/**
 * MCP server factory.
 *
 * Builds a fully-wired MCP Server (tools + prompts) against a shared context
 * (the ZeroDB client + the Skills client). Used by both transports:
 *   - stdio  (local `npx 8genc-mcp-server`)
 *   - HTTP   (Railway / Streamable HTTP)
 *
 * Stateless HTTP creates one Server per request, so this must be cheap to call.
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import {
  ListToolsRequestSchema,
  CallToolRequestSchema,
  ListPromptsRequestSchema,
  GetPromptRequestSchema
} from '@modelcontextprotocol/sdk/types.js';

import { PLATFORM_TOOLS, executePlatformTool } from './tools/platform-tools.js';
import { SKILL_TOOLS, executeSkillTool } from './tools/skill-tools.js';
import { ORCHESTRATION_TOOLS, executeOrchestrationTool } from './tools/orchestration-tools.js';
import { CLIENT_TOOLS, executeClientTool } from './tools/client-tools.js';
import { CREDENTIALS_TOOLS, executeCredentialsTool } from './tools/credentials-tools.js';
import { makeCredentialResolver } from './credentials/resolver.js';
import {
  resolveUser,
  isAdmin,
  canUseTool,
  decideSlug,
  filterSkillResult,
  buildClientContextBlock,
  accessibleClients,
  resolveClient
} from './auth/access.js';
import { config } from './config.js';
import * as skillAccess from './db/repositories/skillAccess.js';
import * as clients from './db/repositories/clients.js';
import { syncCatalog } from './skills/catalogSync.js';

// PRD generation/validation/templates/memory are no longer server tools — that
// capability now lives in the `prd-generator` Agent Skill (the8genc/ai-8gent-skills),
// loaded at runtime via the skill_* tools and surfaced as an MCP prompt. The server
// keeps only platform discovery + skills delivery.
export const ALL_TOOLS = [
  ...PLATFORM_TOOLS,
  ...SKILL_TOOLS,
  ...ORCHESTRATION_TOOLS,
  ...CLIENT_TOOLS,
  ...CREDENTIALS_TOOLS
];

// File-backed tool-credential resolver (admin registry + system .env + per-client .env).
// Lazily built and refreshed so dashboard edits are picked up without a restart.
let _credResolver = null;
let _credLoadedAt = 0;
function credentialResolver() {
  if (!_credResolver || Date.now() - _credLoadedAt > 5000) {
    _credResolver = makeCredentialResolver();
    _credLoadedAt = Date.now();
  }
  return _credResolver;
}

// Map each non-skill tool name to its executor. Platform tools take (name, args, client);
// skill tools take (name, args, ctx) and are dispatched separately below.
const PLATFORM_EXECUTORS = {};
for (const t of PLATFORM_TOOLS) PLATFORM_EXECUTORS[t.name] = executePlatformTool;

const SKILL_TOOL_NAMES = new Set(SKILL_TOOLS.map((t) => t.name));
const ORCHESTRATION_TOOL_NAMES = new Set(ORCHESTRATION_TOOLS.map((t) => t.name));
const CLIENT_TOOL_NAMES = new Set(CLIENT_TOOLS.map((t) => t.name));
const CREDENTIALS_TOOL_NAMES = new Set(CREDENTIALS_TOOLS.map((t) => t.name));

/**
 * @param {object} ctx
 * @param {import('./client/zerodb-client.js').ZeroDBClient} ctx.client
 * @param {import('./skills/skills-client.js').SkillsClient} ctx.skills
 * @param {string} ctx.serverName
 * @param {string} ctx.version
 */
export function createMcpServer(ctx) {
  const { client, skills, serverName, version } = ctx;

  const server = new Server(
    { name: serverName, version },
    { capabilities: { tools: {}, prompts: {} } }
  );

  // ── Per-request access resolution ──────────────────────────────
  // Identity arrives via the SDK handler's `extra.authInfo` (set in
  // src/transport/http.js as `authInfo: req.auth`). admin/owner short-circuit
  // BEFORE any DB call, so the local stdio / no-auth path never queries.
  const accessCache = new Map(); // userId -> Promise<Map<slug,meta>|null>

  /** Lazily load + memoize a user's access set (fail-closed to null on DB error). */
  function getAccessSet(user) {
    const key = user.userId;
    if (!accessCache.has(key)) {
      accessCache.set(
        key,
        skillAccess.loadAccessSet(key).catch((err) => {
          console.error(`[${serverName}] access-set load failed: ${err.message}`);
          return null; // fail-closed
        })
      );
    }
    return accessCache.get(key);
  }

  const decide = (user, slug, accessSet) =>
    decideSlug(user, slug, accessSet, config.rbacDefaultTier);

  // Per-request membership cache: the client tenants this user may access.
  const clientCache = new Map(); // userId -> Promise<client rows>
  function getAccessibleClients(user) {
    if (!user?.userId && !user?.owner) return Promise.resolve([]);
    const key = user.owner ? '__owner__' : user.userId;
    if (!clientCache.has(key)) {
      const load = isAdmin(user) ? clients.listAll() : clients.listForUser(user.userId);
      clientCache.set(
        key,
        load.catch((err) => {
          console.error(`[${serverName}] client membership load failed: ${err.message}`);
          return []; // fail-closed
        })
      );
    }
    return clientCache.get(key);
  }

  /** Build a membership-checked client resolver for the client tools. */
  function makeResolveClientId(user, accessible) {
    const accessibleIds = accessible.map((c) => c.id);
    return async (ref) => {
      let explicitId = null;
      if (ref) {
        let row = null;
        try {
          row = await clients.resolveRef(ref);
        } catch {
          row = null;
        }
        if (!row) return { ok: false, reason: 'denied' };
        explicitId = row.id;
      }
      return resolveClient(user, explicitId, accessibleIds);
    };
  }

  /** Inject the caller's client context (scope + recent memory) when unambiguous. */
  async function clientContextBlock(user) {
    if (!user?.userId) return null; // owner / stdio has no single scoped client
    let accessible;
    try {
      accessible = await getAccessibleClients(user);
    } catch {
      return null;
    }
    if (accessible.length !== 1) return null; // none or ambiguous → skip auto-inject
    const c = accessible[0];

    const scopeBlock = buildClientContextBlock(c); // null when no scope set
    let memText = '';
    if (client?.isAuthenticated) {
      try {
        const mem = await withTimeout(client.searchClientMemory(c.id, '', 5), 2500);
        const results = (mem?.results || mem?.memories || []).slice(0, 5);
        if (results.length) {
          memText =
            `\n**Recent client memory:**\n` +
            results
              .map((r) => `- ${String(r.content || r.text || '').replace(/\s+/g, ' ').slice(0, 300)}`)
              .filter((l) => l.length > 2)
              .join('\n');
        }
      } catch {
        // ZeroDB slow/unavailable — degrade to scope-only, never block the prompt.
      }
    }
    if (!scopeBlock && !memText) return null;
    const header = scopeBlock || `\n\n---\n\n## Client Context\n\nShared context for ${c.name}.\n`;
    return header + (memText ? `\n${memText}\n` : '');
  }

  // ── Tools ──────────────────────────────────────────────────────
  server.setRequestHandler(ListToolsRequestSchema, async (_request, extra) => {
    const user = resolveUser(extra?.authInfo);
    return {
      tools: ALL_TOOLS.filter((tool) => canUseTool(user, tool.name)).map((tool) => ({
        name: tool.name,
        description: tool.description,
        inputSchema: tool.inputSchema
      }))
    };
  });

  server.setRequestHandler(CallToolRequestSchema, async (request, extra) => {
    const { name, arguments: args } = request.params;
    const user = resolveUser(extra?.authInfo);
    try {
      if (!canUseTool(user, name)) {
        return errorResult(`Access denied: ${name} requires admin.`, name);
      }

      let result;
      if (SKILL_TOOL_NAMES.has(name)) {
        // Single-skill reads: deny up front if the skill isn't accessible.
        if ((name === 'skill_get' || name === 'skill_get_reference') && !isAdmin(user)) {
          const accessSet = await getAccessSet(user);
          if (!decide(user, args?.skill, accessSet)) {
            return errorResult(`Access denied to skill: ${args?.skill}`, name);
          }
        }

        result = await executeSkillTool(name, args || {}, ctx);

        // List/search: filter results down to what this user may access.
        if (!isAdmin(user) && (name === 'skill_list' || name === 'skill_search')) {
          result = filterSkillResult(result, user, await getAccessSet(user), config.rbacDefaultTier);
        }

        // Admin skill_sync also refreshes the Postgres access catalog.
        if (name === 'skill_sync' && result && !result.error) {
          try {
            await syncCatalog(skills);
          } catch (err) {
            console.error(`[${serverName}] catalog sync failed: ${err.message}`);
          }
        }
      } else if (ORCHESTRATION_TOOL_NAMES.has(name)) {
        // Orchestration plans are scoped to the user's accessible skills.
        const accessSet = isAdmin(user) ? null : await getAccessSet(user);
        const isAccessible = (id) => decide(user, id, accessSet);
        result = await executeOrchestrationTool(name, args || {}, ctx, { isAccessible });
      } else if (CLIENT_TOOL_NAMES.has(name)) {
        // Client memory is membership-gated: resolve the caller's accessible
        // clients, then resolve+check the target client before any ZeroDB call.
        const accessible = await getAccessibleClients(user);
        result = await executeClientTool(name, args || {}, ctx, {
          clients: accessible,
          resolveClientId: makeResolveClientId(user, accessible)
        });
      } else if (CREDENTIALS_TOOL_NAMES.has(name)) {
        // Tool-credential status is membership-gated like client memory: resolve the
        // caller's client, then report that client's per-tool credential status (no secrets).
        const accessible = await getAccessibleClients(user);
        result = await executeCredentialsTool(name, args || {}, ctx, {
          clients: accessible,
          resolveClientId: makeResolveClientId(user, accessible),
          credentials: credentialResolver()
        });
      } else {
        const executor = PLATFORM_EXECUTORS[name];
        if (!executor) {
          return errorResult(`Unknown tool: ${name}`);
        }
        result = await executor(name, args || {}, client);
      }

      if (result === null) return errorResult(`Tool ${name} not found`);
      return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
    } catch (err) {
      console.error(`[${serverName}] Tool ${name} error:`, err.message);
      return errorResult(err.message, name);
    }
  });

  // ── Prompts (skills surfaced as selectable prompts) ────────────
  server.setRequestHandler(ListPromptsRequestSchema, async (_request, extra) => {
    const user = resolveUser(extra?.authInfo);
    let list = [];
    try {
      list = await skills.listSkills();
    } catch (err) {
      console.error(`[${serverName}] prompts/list skill fetch failed:`, err.message);
    }
    if (!isAdmin(user)) {
      const accessSet = await getAccessSet(user);
      list = list.filter((s) => decide(user, s.slug, accessSet));
    }
    return {
      prompts: list.map((s) => ({
        name: s.slug,
        description: s.description || s.name,
        arguments: [
          {
            name: 'input',
            description: 'Optional task/context to apply this skill to',
            required: false
          }
        ]
      }))
    };
  });

  server.setRequestHandler(GetPromptRequestSchema, async (request, extra) => {
    const { name, arguments: promptArgs } = request.params;
    const user = resolveUser(extra?.authInfo);

    if (!isAdmin(user)) {
      const accessSet = await getAccessSet(user);
      if (!decide(user, name, accessSet)) {
        throw new Error(`Access denied to skill: ${name}`);
      }
    }

    const skill = await skills.getSkill(name, { withReferences: false });

    let text = skill.body || skill.content;
    // Inject the client's scoped data sources before the task.
    const ctxBlock = await clientContextBlock(user);
    if (ctxBlock) text += ctxBlock;
    if (promptArgs?.input) {
      text += `\n\n---\n\n## Task\n\n${promptArgs.input}`;
    }
    if (skill.references?.length) {
      text +=
        `\n\n---\n\n_Reference files available (load with skill_get_reference): ` +
        skill.references.join(', ') +
        `_`;
    }

    return {
      description: skill.description || skill.name,
      messages: [
        {
          role: 'user',
          content: { type: 'text', text }
        }
      ]
    };
  });

  return server;
}

/** Resolve `p` but reject if it takes longer than `ms` (used to bound the
 *  optional client-memory recall on the interactive GetPrompt path). */
function withTimeout(p, ms) {
  return Promise.race([
    p,
    new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), ms))
  ]);
}

function errorResult(message, tool) {
  return {
    content: [
      {
        type: 'text',
        text: JSON.stringify({
          error: message,
          tool,
          hint:
            message.includes('credentials') || message.includes('401')
              ? 'Set ZERODB_API_KEY (or AINATIVE_API_KEY) for full functionality. Get one free: npx zerodb-cli init'
              : undefined
        })
      }
    ],
    isError: true
  };
}
