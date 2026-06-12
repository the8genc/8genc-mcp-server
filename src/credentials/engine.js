/**
 * Multi-tenant tool-credential engine (JS/ESM runtime port of the typed engine in
 * `tool-credentials/`). Pure functions + dotenv. Per-tool policy:
 *   shared       — admin key (system .env) exposed to clients
 *   client-owned — client must bring their own key (client .env); admin key NEVER used.
 */
import { existsSync, readFileSync } from 'node:fs';
import { parse as parseEnv } from 'dotenv';

/** Built-in capability tokens → Agent built-in tools (no API credentials). */
export const BUILTIN = {
  webfetch: ['WebFetch', 'WebSearch'],
  imagemagick: ['Bash'],
  github: ['Bash'],
  wordpress: ['Bash', 'WebFetch'],
  ghost: ['Bash', 'WebFetch'],
  framer: ['Bash', 'WebFetch'],
  falai: ['Bash', 'WebFetch'],
  webhook: ['Bash', 'WebFetch'],
  'square-sdk': ['Bash', 'WebFetch'],
  figma: ['Bash', 'WebFetch'],
  canva: ['Bash', 'WebFetch'],
  squarespace: ['Bash', 'WebFetch'],
  coda: ['Bash'],
  dataforseo: ['Bash'],
  zerodb: ['Bash'],
  'ainative-8genc': ['Bash']
};

/** Load the admin registry. Accepts `{ tools: {...} }` or a flat `{ token: {...} }`. */
export function loadAdminToolConfig(path) {
  if (!existsSync(path)) return { tools: {} };
  const raw = JSON.parse(readFileSync(path, 'utf-8'));
  const src = raw.tools && typeof raw.tools === 'object' ? raw.tools : raw;
  const tools = {};
  for (const [k, v] of Object.entries(src)) {
    if (k.startsWith('_') || k === 'tools') continue;
    if (v && typeof v === 'object') tools[k] = v;
  }
  return { tools };
}

/** Parse a .env file into a plain map (empty if absent). Never touches process.env. */
export function loadEnvFile(path) {
  if (!path || !existsSync(path)) return {};
  return parseEnv(readFileSync(path));
}

const pick = (keys, env) => {
  const out = {};
  if (env) for (const k of keys) if (env[k] !== undefined) out[k] = env[k];
  return out;
};

const mkMcp = (command, args, env) => (command ? { command, args, env } : undefined);

/**
 * Resolve one tool's credentials under a client, enforcing the isolation rule:
 * a `client-owned` tool with no client key is UNAVAILABLE (never the admin key).
 * @param {string} token
 * @param {{tools:Record<string,any>}} admin
 * @param {{clientId:string,overrides?:Record<string,any>}|undefined} client
 * @param {{adminEnv?:Record<string,string>,clientEnv?:Record<string,string>}} sources
 */
export function resolveCredential(token, admin, client, sources = {}) {
  const a = admin.tools[token];
  const ov = client?.overrides?.[token];
  if (!a) return { token, available: true, source: 'none', policy: 'none', env: {} };

  const policy = a.policy ?? 'shared';
  const keys = a.envKeys ?? [];
  const clientVals = { ...pick(keys, sources.clientEnv), ...(ov?.env ?? {}) };
  const clientHas = Object.keys(clientVals).length > 0 || Boolean(ov?.command);

  if (policy === 'client-owned') {
    if (clientHas) {
      return {
        token, available: true, source: 'client', policy,
        env: clientVals, mcp: mkMcp(ov?.command ?? a.command, ov?.args ?? a.args, clientVals)
      };
    }
    return {
      token, available: false, source: 'none', policy, env: {},
      reason: `tool "${token}" is client-owned: this client must supply their own API key (none in the client .env). Not falling back to the admin key — client isolation enforced.`
    };
  }

  const adminVals = { ...(a.env ?? {}), ...pick(keys, sources.adminEnv) };
  const env = { ...adminVals, ...clientVals };
  return {
    token, available: true, source: clientHas ? 'client' : 'admin', policy,
    env, mcp: mkMcp(ov?.command ?? a.command, ov?.args ?? a.args, env)
  };
}

/** Resolve a set of tool tokens into a session's env + MCP servers + unavailable list. */
export function resolveSessionTools(tokens, admin, client, envSources = {}) {
  const allowed = new Set(['Read', 'Write']);
  const mcpServers = {};
  const env = {};
  const unavailable = [];
  const sources = {};
  for (const t of tokens) {
    const cred = resolveCredential(t, admin, client, envSources);
    sources[t] = cred.source;
    if (!cred.available) {
      unavailable.push({ token: t, reason: cred.reason ?? 'unavailable' });
      continue;
    }
    if (BUILTIN[t]) BUILTIN[t].forEach((x) => allowed.add(x));
    Object.assign(env, cred.env);
    if (cred.mcp) mcpServers[t] = cred.mcp;
  }
  const hasMcp = Object.keys(mcpServers).length > 0;
  return { allowedTools: hasMcp ? undefined : [...allowed], mcpServers, env, unavailable, sources };
}
