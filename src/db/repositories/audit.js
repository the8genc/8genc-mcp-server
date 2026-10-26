/**
 * Audit repository: append-only log of MCP tool calls (see
 * migrations/009_audit_events.sql). Raw SQL via query() (the repo convention).
 *
 * record() never throws: an audit write failure is logged and swallowed so it
 * can't break the tool call it describes.
 */
import { getPool, query } from '../pool.js';

export const OUTCOMES = ['ok', 'denied', 'error'];

/**
 * Build the row for one tool call. Pure. Only argument KEYS are kept, never
 * values, so client text and secrets don't land in the log.
 */
export function buildEvent({ user, tool, outcome, args, error, sowId = null, pagesRead = [], pagesWritten = [] }) {
  const detail = {};
  if (args && typeof args === 'object') detail.arg_keys = Object.keys(args).slice(0, 50);
  if (error) detail.error = String(error).slice(0, 500);
  return {
    user_id: user?.userId || null,
    role: user?.role || null,
    tool: String(tool || 'unknown').slice(0, 200),
    sow_id: sowId,
    pages_read: pagesRead,
    pages_written: pagesWritten,
    outcome: OUTCOMES.includes(outcome) ? outcome : 'error',
    detail
  };
}

export async function record(event) {
  if (!getPool()) return; // no DB (stdio / auth disabled): nothing to audit against
  const e = buildEvent(event);
  try {
    await query(
      `INSERT INTO audit_events (user_id, role, tool, sow_id, pages_read, pages_written, outcome, detail)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [e.user_id, e.role, e.tool, e.sow_id, e.pages_read, e.pages_written, e.outcome, e.detail]
    );
  } catch (err) {
    console.error('[audit] write failed:', err.message);
  }
}

export async function listForUser(userId, { limit = 100 } = {}) {
  const { rows } = await query(
    `SELECT id, user_id, role, tool, sow_id, pages_read, pages_written, outcome, detail, created_at
     FROM audit_events WHERE user_id = $1 ORDER BY created_at DESC LIMIT $2`,
    [userId, Math.min(Math.max(1, limit), 1000)]
  );
  return rows;
}
