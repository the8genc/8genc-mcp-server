-- 005_skills_rbac.sql — skills catalog + role/per-user access + client data scope.
--
-- Catalog of every skill the GitHub skills repo exposes (DB-gated, GitHub-synced).
-- The catalog (tier + enabled) is the default access control; per-user overrides
-- layer on top; client_contexts holds each client's data-scope pointers (e.g. Coda
-- docs) that get injected into skill/prompt context at request time.
--
-- `tier` is text + CHECK (not an enum) so it stays transaction-safe and easy to
-- extend. NULL tier = unclassified = admin-only until an admin classifies it.

CREATE TABLE IF NOT EXISTS skills_catalog (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug            text NOT NULL UNIQUE,
  name            text,
  description     text,
  tier            text CHECK (tier IN ('admin', 'consultant', 'client')),  -- NULL = unclassified (admin-only)
  enabled         boolean NOT NULL DEFAULT true,
  reference_files text[] NOT NULL DEFAULT '{}',
  source          text,
  repo            text,
  branch          text,
  synced_at       timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

-- Per-user allow/deny override for a specific skill (wins over the tier default).
CREATE TABLE IF NOT EXISTS skill_access_overrides (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  skill_id   uuid NOT NULL REFERENCES skills_catalog(id) ON DELETE CASCADE,
  effect     text NOT NULL CHECK (effect IN ('allow', 'deny')),
  created_by uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, skill_id)
);
CREATE INDEX IF NOT EXISTS skill_access_overrides_user_idx ON skill_access_overrides (user_id);

-- Per-user data-scope pointers injected into skill/prompt context. coda_files is
-- [{ doc_id, url, label }]; variables is arbitrary key/value scoping context.
CREATE TABLE IF NOT EXISTS client_contexts (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  coda_files jsonb NOT NULL DEFAULT '[]'::jsonb,
  variables  jsonb NOT NULL DEFAULT '{}'::jsonb,
  notes      text,
  updated_by uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
