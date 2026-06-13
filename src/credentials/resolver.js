/**
 * Credential resolver, scoped per client. The admin registry is a committed, non-secret
 * default (`registry.default.json`) overlaid with the dashboard-written
 * `orchestrator.mcp.json` (gitignored) when present. Shared (agency) keys come from
 * process.env (how Railway supplies secrets), with the system `.env` file overriding for
 * local/dashboard use. Per-client `client-owned` keys come from `clients/<id>.env`.
 */
import { join } from 'node:path';
import { loadAdminToolConfig, loadEnvFile, resolveCredential, resolveSessionTools } from './engine.js';
import { config } from '../config.js';
import * as toolCreds from '../db/repositories/toolCredentials.js';

const sanitize = (id) => String(id).replace(/[^A-Za-z0-9_-]/g, '_');

/**
 * DB-backed resolver (production). Registry comes from the `tool_registry` table — seeded
 * from the committed registry.default.json when empty. Shared (agency) keys come from
 * process.env (Railway secrets) + an optional system .env file. Per-client `client-owned`
 * keys come ENCRYPTED from `client_tool_credentials`, decrypted only here at resolution.
 * statusForClient / resolveForClient are ASYNC (the file-based resolver below is sync;
 * tool handlers `await` either form). `repo` is injectable for tests.
 */
export function makeDbCredentialResolver(repo = toolCreds, dir = config.credentialsDir) {
  const adminEnv = { ...process.env, ...loadEnvFile(join(dir, '.env')) };
  let registryPromise = null;
  const loadRegistry = () =>
    (registryPromise ??= (async () => {
      let rows = await repo.listRegistry();
      if (!rows.length) {
        // self-heal: seed the committed non-secret default into the DB once
        const defaults = loadAdminToolConfig(join(dir, 'registry.default.json'));
        await repo.seedRegistry(defaults.tools);
        rows = await repo.listRegistry();
      }
      const tools = {};
      for (const r of rows) {
        tools[r.token] = {
          policy: r.policy,
          envKeys: r.env_keys || [],
          ...(r.command ? { command: r.command, args: r.args || [] } : {})
        };
      }
      return { tools };
    })());

  async function statusForClient(clientId) {
    const admin = await loadRegistry();
    const cEnv = clientId ? await repo.getClientEnv(clientId) : {};
    const client = clientId ? { clientId, overrides: {} } : undefined;
    return Object.entries(admin.tools).map(([token, t]) => {
      const cred = resolveCredential(token, admin, client, { adminEnv, clientEnv: cEnv });
      const envKeys = t.envKeys ?? [];
      return {
        token,
        policy: t.policy ?? 'shared',
        envKeys,
        providedKeys: envKeys.filter((k) => cEnv[k] !== undefined),
        available: cred.available,
        source: cred.source,
        reason: cred.reason
      };
    });
  }

  async function resolveForClient(clientId, tokens) {
    const admin = await loadRegistry();
    const cEnv = clientId ? await repo.getClientEnv(clientId) : {};
    return resolveSessionTools(tokens, admin, clientId ? { clientId, overrides: {} } : undefined, {
      adminEnv,
      clientEnv: cEnv
    });
  }

  return { statusForClient, resolveForClient, tokens: async () => Object.keys((await loadRegistry()).tools) };
}

export function makeCredentialResolver(dir = config.credentialsDir) {
  const defaults = loadAdminToolConfig(join(dir, 'registry.default.json'));
  const override = loadAdminToolConfig(join(dir, 'orchestrator.mcp.json'));
  const admin = { tools: { ...defaults.tools, ...override.tools } };
  // pick() (engine.js) limits use to each tool's declared envKeys, so spreading process.env
  // here can't leak unrelated vars; the system .env file overrides process.env when present.
  const adminEnv = { ...process.env, ...loadEnvFile(join(dir, '.env')) };
  const clientEnvCache = new Map();
  const clientEnv = (clientId) => {
    if (!clientId) return {};
    if (!clientEnvCache.has(clientId)) {
      clientEnvCache.set(clientId, loadEnvFile(join(dir, 'clients', `${sanitize(clientId)}.env`)));
    }
    return clientEnvCache.get(clientId);
  };

  /** Per-tool status for a client (no secrets) — mirrors the dashboard client view. */
  function statusForClient(clientId) {
    const cEnv = clientEnv(clientId);
    const client = clientId ? { clientId, overrides: {} } : undefined;
    return Object.entries(admin.tools).map(([token, t]) => {
      const cred = resolveCredential(token, admin, client, { adminEnv, clientEnv: cEnv });
      const envKeys = t.envKeys ?? [];
      const providedKeys = envKeys.filter((k) => cEnv[k] !== undefined);
      return {
        token,
        policy: t.policy ?? 'shared',
        envKeys,
        providedKeys,
        available: cred.available,
        source: cred.source,
        reason: cred.reason
      };
    });
  }

  /** Resolve credentials/env for a tool call, scoped to a client (for internal tool handlers). */
  function resolveForClient(clientId, tokens) {
    return resolveSessionTools(tokens, admin, clientId ? { clientId, overrides: {} } : undefined, {
      adminEnv,
      clientEnv: clientEnv(clientId)
    });
  }

  return { statusForClient, resolveForClient, tokens: () => Object.keys(admin.tools) };
}
