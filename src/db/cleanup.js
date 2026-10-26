/**
 * Periodic cleanup of expired/consumed auth rows so these tables don't grow
 * unbounded. Safe to run on a single instance; deletes are idempotent.
 */

import { query } from './pool.js';

export async function cleanupExpired() {
  const results = {};
  const run = async (label, sql) => {
    try {
      const r = await query(sql);
      results[label] = r.rowCount || 0;
    } catch (err) {
      console.error(`[cleanup] ${label} failed:`, err.message);
      results[label] = -1;
    }
  };
  await run('authorization_codes', `DELETE FROM authorization_codes WHERE expires_at < now() - interval '1 day'`);
  await run('email_tokens', `DELETE FROM email_tokens WHERE expires_at < now() - interval '7 days'`);
  await run('refresh_tokens', `DELETE FROM refresh_tokens WHERE (expires_at < now() - interval '30 days') OR (revoked_at IS NOT NULL AND revoked_at < now() - interval '30 days')`);
  // Audit rows are kept at least one year.
  await run('audit_events', `DELETE FROM audit_events WHERE created_at < now() - interval '400 days'`);
  return results;
}

/** Run once on boot, then on an interval. Returns the timer (unref'd so it never blocks exit). */
export function startCleanup(intervalMs = 24 * 60 * 60 * 1000) {
  cleanupExpired().catch(() => {});
  const t = setInterval(() => { cleanupExpired().catch(() => {}); }, intervalMs);
  t.unref?.();
  return t;
}
