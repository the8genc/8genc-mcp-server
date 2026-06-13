-- 008_tool_credentials.sql — DB-backed tool-credential store (replaces the file-based
-- orchestrator.mcp.json + clients/<id>.env, which can't persist on Railway).
--
-- tool_registry: the admin registry (per-tool policy + env var NAMES + optional MCP launch).
--   Seeded at runtime from the committed tool-credentials/registry.default.json when empty.
-- client_tool_credentials: each client's keys for client-owned tools (and shared overrides),
--   stored ENCRYPTED at rest (AES-256-GCM; see src/credentials/crypto.js). One row per
--   (client, tool); the decrypted JSON is { ENV_KEY: value, ... }.

CREATE TABLE IF NOT EXISTS tool_registry (
  token       text PRIMARY KEY,
  policy      text NOT NULL DEFAULT 'shared' CHECK (policy IN ('shared', 'client-owned')),
  env_keys    text[] NOT NULL DEFAULT '{}',
  command     text,
  args        jsonb,
  updated_by  uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS client_tool_credentials (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id     uuid NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  token         text NOT NULL,
  env_encrypted text NOT NULL,         -- AES-256-GCM ciphertext of { ENV_KEY: value, ... }
  updated_by    uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (client_id, token)
);
CREATE INDEX IF NOT EXISTS client_tool_credentials_client_idx ON client_tool_credentials (client_id);
