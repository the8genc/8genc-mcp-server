/**
 * Central configuration read from the environment.
 *
 * Auth/portal features activate only when DATABASE_URL is set. Without it the
 * server runs exactly as before (unauthenticated /mcp) so local stdio use and
 * the existing tests keep working.
 */

import { randomBytes } from 'node:crypto';

const bool = (v, dflt = false) =>
  v == null ? dflt : ['1', 'true', 'yes', 'on'].includes(String(v).toLowerCase());

// Public origin the server is reached at (issuer + resource base for OAuth).
// Falls back to localhost for local dev.
const PORT = parseInt(process.env.PORT || '8080', 10);
const PUBLIC_BASE_URL = (
  process.env.PUBLIC_BASE_URL ||
  process.env.BASE_URL ||
  `http://localhost:${PORT}`
).replace(/\/+$/, '');

// A stable secret is required to sign session + access tokens. In production it
// MUST be provided; for local dev we generate an ephemeral one (tokens won't
// survive a restart, which is fine for development).
let jwtSecret = process.env.JWT_SECRET;
if (!jwtSecret) {
  // In production a stable secret is mandatory (an ephemeral one would invalidate
  // every session/token on each restart and differ across instances).
  if (process.env.NODE_ENV === 'production' && process.env.DATABASE_URL) {
    throw new Error('JWT_SECRET is required in production. Set a long random JWT_SECRET and restart.');
  }
  jwtSecret = randomBytes(48).toString('hex');
}

export const config = {
  port: PORT,
  publicBaseUrl: PUBLIC_BASE_URL,
  isHttps: PUBLIC_BASE_URL.startsWith('https://'),

  // Auth is enabled only when a database is configured.
  databaseUrl: process.env.DATABASE_URL || null,
  get authEnabled() {
    return !!this.databaseUrl;
  },

  jwtSecret,
  sessionTtlSeconds: parseInt(process.env.SESSION_TTL_SECONDS || `${4 * 3600}`, 10),
  accessTokenTtlSeconds: parseInt(process.env.ACCESS_TOKEN_TTL_SECONDS || '3600', 10),
  cookieSecure: bool(process.env.SESSION_COOKIE_SECURE, PUBLIC_BASE_URL.startsWith('https://')),

  bcryptRounds: parseInt(process.env.BCRYPT_ROUNDS || '12', 10),

  // Seed admin (consumed only by the migration seeder).
  adminUsername: process.env.ADMIN_SEED_USERNAME || 'admin',
  adminPassword: process.env.ADMIN_SEED_PASSWORD || 'admin',

  // OAuth social providers (used in PR3).
  google: {
    clientId: process.env.GOOGLE_CLIENT_ID || null,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET || null
  },
  github: {
    clientId: process.env.GITHUB_CLIENT_ID || null,
    clientSecret: process.env.GITHUB_CLIENT_SECRET || null
  },

  // Email delivery: 'dev' logs links to stdout; 'smtp'/'resend' wired later.
  email: {
    provider: process.env.EMAIL_PROVIDER || 'dev',
    from: process.env.EMAIL_FROM || 'no-reply@8genc.com',
    resendApiKey: process.env.RESEND_API_KEY || null,
    smtpUrl: process.env.SMTP_URL || null
  },

  // Where admin-facing notifications (e.g. new-signup-pending-approval) are sent.
  adminNotifyEmail: process.env.ADMIN_NOTIFY_EMAIL || 'arif@8genc.com',

  mcpScope: 'mcp:tools',
  patPrefix: '8genc_pat_',

  // Default access tier applied to a skill when it's first synced into the
  // catalog (and the fallback tier for a slug not yet in the catalog). 'admin'
  // is safe-by-default: every newly-synced skill is admin-only until an admin
  // classifies it down to 'consultant'/'client' in the dashboard.
  rbacDefaultTier: process.env.RBAC_DEFAULT_TIER || 'admin'
};

export function resourceUrl() {
  return new URL('/mcp', config.publicBaseUrl);
}
