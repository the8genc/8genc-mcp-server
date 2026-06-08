/**
 * MCP server factory.
 *
 * Builds a fully-wired MCP Server (tools + prompts) against a shared context
 * (the ZeroDB client + the Skills client). Used by both transports:
 *   - stdio  (local `npx ainative-prd-mcp`)
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

import { GENERATION_TOOLS, executeGenerationTool } from './tools/generation-tools.js';
import { TEMPLATE_TOOLS, executeTemplateTool } from './tools/template-tools.js';
import { VALIDATION_TOOLS, executeValidationTool } from './tools/validation-tools.js';
import { MEMORY_TOOLS, executeMemoryTool } from './tools/memory-tools.js';
import { PLATFORM_TOOLS, executePlatformTool } from './tools/platform-tools.js';
import { SKILL_TOOLS, executeSkillTool } from './tools/skill-tools.js';

export const ALL_TOOLS = [
  ...GENERATION_TOOLS,
  ...TEMPLATE_TOOLS,
  ...VALIDATION_TOOLS,
  ...MEMORY_TOOLS,
  ...PLATFORM_TOOLS,
  ...SKILL_TOOLS
];

// Map each tool name to its executor. PRD tools take (name, args, client);
// skill tools take (name, args, ctx). We normalize by passing the right object.
const PRD_EXECUTORS = {};
for (const t of GENERATION_TOOLS) PRD_EXECUTORS[t.name] = executeGenerationTool;
for (const t of TEMPLATE_TOOLS) PRD_EXECUTORS[t.name] = executeTemplateTool;
for (const t of VALIDATION_TOOLS) PRD_EXECUTORS[t.name] = executeValidationTool;
for (const t of MEMORY_TOOLS) PRD_EXECUTORS[t.name] = executeMemoryTool;
for (const t of PLATFORM_TOOLS) PRD_EXECUTORS[t.name] = executePlatformTool;

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
        const executor = PRD_EXECUTORS[name];
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
