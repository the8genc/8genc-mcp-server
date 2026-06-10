/**
 * Real status metrics for the public status strip.
 *   - tools / services: exact counts from the server (ALL_TOOLS + platform manifest)
 *   - latency: median of recent real request durations (in-memory ring)
 *   - uptime: self-measured from heartbeat samples in Postgres — observed vs
 *     expected sample count over a trailing 90-day window (gaps = downtime/restarts),
 *     labelled honestly by the actual collected span until 90 days exist.
 * Degrades gracefully (nulls) when no DB is configured.
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { ALL_TOOLS } from '../server.js';
import { getPool, query } from '../db/pool.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const manifest = JSON.parse(readFileSync(join(__dirname, '..', 'knowledge', 'platform-manifest.json'), 'utf8'));
const SERVICES = Array.isArray(manifest.products) ? manifest.products.length : 0;
const TOOLS = ALL_TOOLS.length;

const HEARTBEAT_MS = 2 * 60 * 1000;
const RING_MAX = 2000;
const ring = []; // recent request durations (ms)

function median(arr) {
  if (!arr.length) return null;
  const s = [...arr].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

/** Times every request and records its duration into the in-memory ring. */
export function timingMiddleware(req, res, next) {
  const start = process.hrtime.bigint();
  res.on('finish', () => {
    const ms = Number(process.hrtime.bigint() - start) / 1e6;
    ring.push(ms);
    if (ring.length > RING_MAX) ring.shift();
  });
  next();
}

const recentMedian = () => median(ring);

/** Periodic heartbeat: persist an "up" sample + the current median latency. */
export function startStatusHeartbeat() {
  if (!getPool()) return null;
  const beat = async () => {
    try {
      const lat = recentMedian();
      await query('INSERT INTO status_samples (ok, latency_ms) VALUES (true, $1)', [lat != null ? Math.round(lat) : null]);
    } catch (err) {
      console.error('[status] heartbeat failed:', err.message);
    }
  };
  beat();
  const t = setInterval(beat, HEARTBEAT_MS);
  t.unref?.();
  return t;
}

export async function getStatus() {
  let dbOk = true;
  let uptimePct = null;
  let windowDays = 0;
  let latencyMs = recentMedian();

  if (getPool()) {
    try {
      const { rows } = await query(
        `SELECT count(*)::int AS n,
                min(ts) AS first_ts,
                percentile_cont(0.5) within group (order by latency_ms) AS median_lat
         FROM status_samples
         WHERE ts > now() - interval '90 days' AND ok AND latency_ms IS NOT NULL`
      );
      const r = rows[0];
      // uptime uses ALL ok samples in window (incl. null-latency); count separately
      const cnt = await query(`SELECT count(*)::int AS n, min(ts) AS first_ts FROM status_samples WHERE ts > now() - interval '90 days'`);
      const c = cnt.rows[0];
      if (c && c.n > 0) {
        const spanSec = Math.max(HEARTBEAT_MS / 1000, (Date.now() - new Date(c.first_ts).getTime()) / 1000);
        windowDays = Math.min(90, Math.max(1, Math.ceil(spanSec / 86400)));
        const expected = Math.max(1, Math.floor(spanSec / (HEARTBEAT_MS / 1000)));
        uptimePct = Math.min(100, Math.round((c.n / expected) * 1000) / 10);
      }
      if (latencyMs == null && r && r.median_lat != null) latencyMs = Number(r.median_lat);
    } catch {
      dbOk = false;
    }
  }

  return {
    status: dbOk ? 'operational' : 'degraded',
    tools: TOOLS,
    services: SERVICES,
    uptime_pct: uptimePct,
    uptime_window_days: windowDays,
    latency_ms: latencyMs != null ? Math.round(latencyMs) : null
  };
}

export function statusHandler(_req, res) {
  getStatus()
    .then((s) => res.set('Cache-Control', 'public, max-age=20').json(s))
    .catch(() => res.status(500).json({ status: 'unknown', tools: TOOLS, services: SERVICES }));
}
