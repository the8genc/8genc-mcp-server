-- 009_audit_events.sql: audit trail of MCP tool calls by authenticated users.
--
-- One row per tools/call (allowed, denied, or errored). Records who called
-- which tool and the outcome; argument VALUES are never stored, only their
-- keys, so client text and secrets stay out of the log. sow_id and the page
-- columns are filled in once engagements, SOWs, and the Coda gateway exist.
-- Retained for at least one year (pruned after 400 days by src/db/cleanup.js).

CREATE TABLE IF NOT EXISTS audit_events (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        uuid REFERENCES users(id) ON DELETE SET NULL,
  role           text,
  tool           text NOT NULL,
  sow_id         uuid,
  pages_read     text[] NOT NULL DEFAULT '{}',
  pages_written  text[] NOT NULL DEFAULT '{}',
  outcome        text NOT NULL CHECK (outcome IN ('ok', 'denied', 'error')),
  detail         jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at     timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS audit_events_user_idx ON audit_events (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS audit_events_created_idx ON audit_events (created_at);
CREATE INDEX IF NOT EXISTS audit_events_denied_idx ON audit_events (created_at DESC) WHERE outcome = 'denied';
