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

// PRD generation/validation/templates/memory are no longer server tools — that
// capability now lives in the `prd-generator` Agent Skill (the8genc/ai-8gent-skills),
// loaded at runtime via the skill_* tools and surfaced as an MCP prompt. The server
// keeps only platform discovery + skills delivery.
export const ALL_TOOLS = [
  ...PLATFORM_TOOLS,
  ...SKILL_TOOLS
];

// Map each non-skill tool name to its executor. Platform tools take (name, args, client);
// skill tools take (name, args, ctx) and are dispatched separately below.
const PLATFORM_EXECUTORS = {};
for (const t of PLATFORM_TOOLS) PLATFORM_EXECUTORS[t.name] = executePlatformTool;

const SKILL_TOOL_NAMES = new Set(SKILL_TOOLS.map((t) => t.name));

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

  // ── Tools ──────────────────────────────────────────────────────
  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: ALL_TOOLS.map((tool) => ({
      name: tool.name,
      description: tool.description,
      inputSchema: tool.inputSchema
    }))
  }));

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;
    try {
      let result;
      if (SKILL_TOOL_NAMES.has(name)) {
        result = await executeSkillTool(name, args || {}, ctx);
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
  server.setRequestHandler(ListPromptsRequestSchema, async () => {
    let list = [];
    try {
      list = await skills.listSkills();
    } catch (err) {
      console.error(`[${serverName}] prompts/list skill fetch failed:`, err.message);
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

  server.setRequestHandler(GetPromptRequestSchema, async (request) => {
    const { name, arguments: promptArgs } = request.params;
    const skill = await skills.getSkill(name, { withReferences: false });

    let text = skill.body || skill.content;
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
