/**
 * File-backed credential resolver, scoped per client. Reads the same files the dashboard
 * writes (under config.credentialsDir): the admin registry `orchestrator.mcp.json`, the system
 * `.env` (shared keys), and per-client `clients/<id>.env` (client-owned keys).
 */
import { join } from 'node:path';
import { loadAdminToolConfig, loadEnvFile, resolveCredential, resolveSessionTools } from './engine.js';
import { config } from '../config.js';

const sanitize = (id) => String(id).replace(/[^A-Za-z0-9_-]/g, '_');

export function makeCredentialResolver(dir = config.credentialsDir) {
  const admin = loadAdminToolConfig(join(dir, 'orchestrator.mcp.json'));
  const adminEnv = loadEnvFile(join(dir, '.env'));
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
