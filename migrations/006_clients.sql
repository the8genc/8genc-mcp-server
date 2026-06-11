-- 006_clients.sql — client tenants + membership for multi-tenant context/memory.
--
-- A `client` is a TENANT: an admin provisions it, it owns a shared data-scope
-- (Coda pointers / variables / notes — moved here from the per-user
-- client_contexts) and a dedicated ZeroDB memory namespace (`client:<id>`).
-- `client_members` is the access wall: a user reads/writes a client's context
-- only if they're a member (admins access all — enforced in the server).
--
-- client_contexts is NOT dropped here — its readers are rewired in the next PR
-- and its dashboard editor is removed in the PR after, so the drop lands then
-- (migration 007) to avoid a broken-UI window.

CREATE TABLE IF NOT EXISTS clients (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug        text NOT NULL UNIQUE,
  name        text NOT NULL,
  status      text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'archived')),
  coda_files  jsonb NOT NULL DEFAULT '[]'::jsonb,
  variables   jsonb NOT NULL DEFAULT '{}'::jsonb,
  notes       text,
  created_by  uuid REFERENCES users(id) ON DELETE SET NULL,
  updated_by  uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS clients_status_idx ON clients (status);

CREATE TABLE IF NOT EXISTS client_members (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id  uuid NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  user_id    uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_by uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (client_id, user_id)
);
CREATE INDEX IF NOT EXISTS client_members_client_idx ON client_members (client_id);
CREATE INDEX IF NOT EXISTS client_members_user_idx ON client_members (user_id);

-- Defensive backfill: turn any existing per-user data-scope into a tenant the
-- user is a member of (effectively a no-op in prod — only pending test users).
-- Slug derives from username; name is "<username>'s context".
INSERT INTO clients (slug, name, coda_files, variables, notes, created_by, updated_by)
SELECT
  'legacy-' || left(replace(cc.user_id::text, '-', ''), 12),
  COALESCE(u.username, 'legacy') || ' (migrated)',
  cc.coda_files, cc.variables, cc.notes, cc.updated_by, cc.updated_by
FROM client_contexts cc
JOIN users u ON u.id = cc.user_id
ON CONFLICT (slug) DO NOTHING;

INSERT INTO client_members (client_id, user_id, created_by)
SELECT c.id, cc.user_id, cc.updated_by
FROM client_contexts cc
JOIN users u ON u.id = cc.user_id
JOIN clients c ON c.slug = 'legacy-' || left(replace(cc.user_id::text, '-', ''), 12)
ON CONFLICT (client_id, user_id) DO NOTHING;
