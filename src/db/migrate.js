/**
 * Migration runner: applies migrations/*.sql in lexical order (tracked in
 * schema_migrations), then idempotently seeds the initial admin account with a
 * bcrypt hash computed in Node (so no password hash lives in source/SQL).
 *
 * Usage: `node src/db/migrate.js` (npm run migrate) or `await runMigrations()`.
 */

import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import bcrypt from 'bcryptjs';
import { getPool, closePool } from './pool.js';
import { config } from '../config.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = join(__dirname, '..', '..', 'migrations');

async function ensureMigrationsTable(client) {
  await client.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version    text PRIMARY KEY,
      applied_at timestamptz NOT NULL DEFAULT now()
    )`);
}

async function applySqlFiles(client) {
  const files = readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith('.sql'))
    .sort();

  const { rows } = await client.query('SELECT version FROM schema_migrations');
  const applied = new Set(rows.map((r) => r.version));

  for (const file of files) {
    if (applied.has(file)) continue;
    const sql = readFileSync(join(MIGRATIONS_DIR, file), 'utf8');
    console.error(`[migrate] applying ${file}`);
    await client.query('BEGIN');
    try {
      await client.query(sql);
      await client.query('INSERT INTO schema_migrations (version) VALUES ($1)', [file]);
      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      throw new Error(`Migration ${file} failed: ${err.message}`);
    }
  }
}

async function seedAdmin(client) {
  const username = config.adminUsername;
  const { rows } = await client.query('SELECT id FROM users WHERE username = $1', [username]);
  if (rows.length > 0) return; // already seeded — never reset an existing admin

  const hash = await bcrypt.hash(config.adminPassword, config.bcryptRounds);
  await client.query(
    `INSERT INTO users (username, password_hash, role, status, email_verified, must_change_password)
     VALUES ($1, $2, 'admin', 'approved', true, true)
     ON CONFLICT (username) DO NOTHING`,
    [username, hash]
  );
  console.error(`[migrate] seeded initial admin "${username}" (must change password on first login)`);
}

export async function runMigrations() {
  const pool = getPool();
  if (!pool) {
    console.error('[migrate] DATABASE_URL not set — skipping migrations (auth disabled)');
    return false;
  }
  const client = await pool.connect();
  try {
    await ensureMigrationsTable(client);
    await applySqlFiles(client);
    await seedAdmin(client);
    return true;
  } finally {
    client.release();
  }
}

// Run directly via `npm run migrate`.
if (import.meta.url === `file://${process.argv[1]}`) {
  const { config: c } = await import('../config.js');
  if (!c.databaseUrl) {
    console.error('[migrate] DATABASE_URL is required. Set it and re-run.');
    process.exit(1);
  }
  try {
    await runMigrations();
    console.error('[migrate] done.');
  } catch (err) {
    console.error('[migrate] FAILED:', err.message);
    process.exitCode = 1;
  } finally {
    await closePool();
  }
}
