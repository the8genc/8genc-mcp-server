# Tool Credentials

Multi-tenant tool-credential engine for the 8genc MCP server. The admin registers every tool's
API config with a per-tool **policy**; each tool is either **shared** (the agency key, from the
system `.env`, is exposed to clients) or **client-owned** (the client must bring their own key via
their uploaded `.env` — the admin key is never used, so tenants don't cross-pollinate). Managed by
the [`../dashboard`](../dashboard) UI; full model + contract in
[`../docs/tool-credentials.md`](../docs/tool-credentials.md).

Ported from `ai-8gent-skills` PRs #21 (credential model) and #22 (.env support).

## Use
```ts
import { loadAdminToolConfig, loadEnvFile } from './src/tool-credentials';
import { resolveSessionTools } from './src/mcp-config';

const admin = loadAdminToolConfig('orchestrator.mcp.json');   // policy + envKeys (no secrets)
const adminEnv = loadEnvFile('.env');                         // agency shared keys
const clientEnv = loadEnvFile('clients/acme.env');            // a client's uploaded keys
const session = resolveSessionTools(['dataforseo', 'square-sdk'], admin,
  { clientId: 'acme', overrides: {} }, { adminEnv, clientEnv });
// session.env → inject into the MCP tool call; session.unavailable → client-owned tools not connected
```

Isolation rule: a `client-owned` tool with no client key resolves to **unavailable** — it never
falls back to the admin key.

## Files
```
src/tool-credentials.ts   policy model, .env loaders, resolveCredential (isolation enforced)
src/mcp-config.ts         resolveSessionTools → per-session env + MCP servers + unavailable list
test/credentials.test.ts  policy matrix + .env resolution + isolation (vitest)
examples/                 tools.example.json (admin registry), clients.example.json, client.env.example
```
`npm install && npm test` to verify; `npm run typecheck` to type-check.

## Runtime integration (MCP server)

The server wires this engine into its tool layer (`src/credentials/` is the JS/ESM runtime port):
- `src/credentials/engine.js` — `resolveCredential` / `resolveSessionTools` (pure, dotenv).
- `src/credentials/resolver.js` — `makeCredentialResolver()` reads `config.credentialsDir`
  (`CREDENTIALS_DIR`, default this `tool-credentials/` dir): admin registry + system `.env` +
  per-client `clients/<id>.env`.
- `src/tools/credentials-tools.js` — the `tool_credentials_status` MCP tool: membership-gated
  (same client resolution as the memory tools), reports each tool's policy + connection for the
  caller's client. **No secrets are returned.**
- Internal tool handlers can call `credentials.resolveForClient(clientId, tokens)` to get a
  client-scoped `env` (shared keys from the system `.env`; client-owned keys from the client's
  `.env`; client-owned-without-key → reported unavailable, admin key never used).

Verified by `tests/credentials.test.js` (`node --test`).
