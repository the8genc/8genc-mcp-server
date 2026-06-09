/** Portal session cookie + Express guards. */
import { config } from '../config.js';
import { signSession, verifySession } from './tokens.js';
import * as users from '../db/repositories/users.js';

const COOKIE = 'portal_session';

export function setSessionCookie(res, user) {
  res.cookie(COOKIE, signSession(user), {
    httpOnly: true,
    secure: config.cookieSecure,
    sameSite: 'lax',
    maxAge: config.sessionTtlSeconds * 1000,
    path: '/'
  });
}

export function clearSessionCookie(res) {
  res.clearCookie(COOKIE, { path: '/' });
}

export function readSession(req) {
  const raw = req.cookies?.[COOKIE];
  return raw ? verifySession(raw) : null;
}

/** Attaches req.sessionUser (full DB row) when a valid session exists. */
export async function loadSessionUser(req) {
  const claims = readSession(req);
  if (!claims) return null;
  const user = await users.findById(claims.sub);
  return user || null;
}

/** Require any logged-in user. */
export function requireSession() {
  return async (req, res, next) => {
    const user = await loadSessionUser(req);
    if (!user) return res.status(401).json({ error: 'not_authenticated' });
    if (user.status === 'blocked') return res.status(403).json({ error: 'account_blocked' });
    req.sessionUser = user;
    next();
  };
}

/** Require an admin. */
export function requireAdmin() {
  return async (req, res, next) => {
    const user = await loadSessionUser(req);
    if (!user) return res.status(401).json({ error: 'not_authenticated' });
    if (user.role !== 'admin') return res.status(403).json({ error: 'forbidden' });
    if (user.status === 'blocked') return res.status(403).json({ error: 'account_blocked' });
    req.sessionUser = user;
    next();
  };
}
