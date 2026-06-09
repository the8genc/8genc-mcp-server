-- 001_init.sql — auth + OAuth authorization-server schema.

CREATE EXTENSION IF NOT EXISTS pgcrypto;  -- gen_random_uuid()

DO $$ BEGIN
  CREATE TYPE user_role AS ENUM ('user', 'admin');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE user_status AS ENUM ('pending', 'approved', 'blocked');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS users (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  username             text NOT NULL UNIQUE,
  email                text UNIQUE,
  password_hash        text,
  role                 user_role   NOT NULL DEFAULT 'user',
  status               user_status NOT NULL DEFAULT 'pending',
  email_verified       boolean     NOT NULL DEFAULT false,
  must_change_password boolean     NOT NULL DEFAULT false,
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS users_email_lower_idx ON users (lower(email)) WHERE email IS NOT NULL;
CREATE INDEX IF NOT EXISTS users_status_idx ON users (status);

CREATE TABLE IF NOT EXISTS oauth_identities (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  provider         text NOT NULL,
  provider_user_id text NOT NULL,
  created_at       timestamptz NOT NULL DEFAULT now(),
  UNIQUE (provider, provider_user_id)
);
CREATE INDEX IF NOT EXISTS oauth_identities_user_idx ON oauth_identities (user_id);

CREATE TABLE IF NOT EXISTS email_tokens (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  purpose     text NOT NULL,                 -- 'verify' | 'reset'
  token_hash  text NOT NULL UNIQUE,
  expires_at  timestamptz NOT NULL,
  used_at     timestamptz,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS email_tokens_user_idx ON email_tokens (user_id, purpose);

CREATE TABLE IF NOT EXISTS personal_access_tokens (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name         text NOT NULL,
  token_hash   text NOT NULL UNIQUE,
  last_used_at timestamptz,
  expires_at   timestamptz,
  revoked_at   timestamptz,
  created_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS pat_user_idx ON personal_access_tokens (user_id);

-- OAuth 2.1 authorization-server tables (used in PR3).
CREATE TABLE IF NOT EXISTS oauth_clients (
  client_id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_secret              text,
  client_secret_expires_at   bigint,
  client_name                text,
  redirect_uris              text[] NOT NULL,
  grant_types                text[] NOT NULL DEFAULT '{authorization_code,refresh_token}',
  scope                      text,
  token_endpoint_auth_method text DEFAULT 'none',
  client_id_issued_at        bigint,
  metadata                   jsonb,
  created_at                 timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS authorization_codes (
  code           text PRIMARY KEY,
  client_id      uuid NOT NULL REFERENCES oauth_clients(client_id) ON DELETE CASCADE,
  user_id        uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  redirect_uri   text NOT NULL,
  code_challenge text NOT NULL,
  scopes         text[] NOT NULL DEFAULT '{}',
  resource       text,
  expires_at     timestamptz NOT NULL,
  consumed_at    timestamptz,
  created_at     timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS authz_codes_expiry_idx ON authorization_codes (expires_at);

CREATE TABLE IF NOT EXISTS refresh_tokens (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  client_id   uuid NOT NULL REFERENCES oauth_clients(client_id) ON DELETE CASCADE,
  token_hash  text NOT NULL UNIQUE,
  scopes      text[] NOT NULL DEFAULT '{}',
  resource    text,
  expires_at  timestamptz NOT NULL,
  revoked_at  timestamptz,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS refresh_tokens_user_idx ON refresh_tokens (user_id);
