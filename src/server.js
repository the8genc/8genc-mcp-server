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
import {
  resolveUser,
  isAdmin,
  canUseTool,
  decideSlug,
  filterSkillResult,
  buildClientContextBlock
} from './auth/access.js';
import { config } from './config.js';
import * as skillAccess from './db/repositories/skillAccess.js';
import * as clientContexts from './db/repositories/clientContexts.js';
import { syncCatalog } from './skills/catalogSync.js';

// PRD generation/validation/templates/memory are no longer server tools — that
// capability now lives in the `prd-generator` Agent Skill (the8genc/ai-8gent-skills),
// loaded at runtime via the skill_* tools and surfaced as an MCP prompt. The server
// keeps only platform discovery + skills delivery.
export const ALL_TOOLS = [
  ...PLATFORM_TOOLS,
  ...SKILL_TOOLS,
  ...ORCHESTRATION_TOOLS
];

// Map each non-skill tool name to its executor. Platform tools take (name, args, client);
// skill tools take (name, args, ctx) and are dispatched separately below.
const PLATFORM_EXECUTORS = {};
for (const t of PLATFORM_TOOLS) PLATFORM_EXECUTORS[t.name] = executePlatformTool;

const SKILL_TOOL_NAMES = new Set(SKILL_TOOLS.map((t) => t.name));
const ORCHESTRATION_TOOL_NAMES = new Set(ORCHESTRATION_TOOLS.map((t) => t.name));

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

  /** Fetch + render the user's client-context block (or null). */
  async function clientContextBlock(user) {
    if (!user?.userId) return null; // owner / stdio has no scoped data
    try {
      return buildClientContextBlock(await clientContexts.get(user.userId));
    } catch (err) {
      console.error(`[${serverName}] client-context load failed: ${err.message}`);
      return null;
    }
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
