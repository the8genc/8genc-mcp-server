/**
 * Token helpers: portal session JWTs, OAuth access JWTs, opaque random tokens,
 * and sha256 hashing for anything stored in the DB (PATs, refresh/email tokens).
 */

import { randomBytes, createHash } from 'node:crypto';
import jwt from 'jsonwebtoken';
import { config, resourceUrl } from '../config.js';

export function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

export function randomToken(bytes = 32) {
  return randomBytes(bytes).toString('base64url');
}

/** Generate a personal access token string + its storage hash. */
export function generatePat() {
  const secret = randomToken(32);
  const token = `${config.patPrefix}${secret}`;
  return { token, hash: sha256(token) };
}

// ── Portal session JWT (httpOnly cookie) ───────────────────────────
export function signSession(user) {
  return jwt.sign(
    { sub: user.id, role: user.role, status: user.status, mcp: false, typ: 'session' },
    config.jwtSecret,
    { expiresIn: config.sessionTtlSeconds }
  );
}

export function verifySession(token) {
  try {
    const claims = jwt.verify(token, config.jwtSecret);
    if (claims.typ !== 'session') return null;
    return claims;
  } catch {
    return null;
  }
}

// ── OAuth access token JWT (resource = /mcp) ───────────────────────
export function signAccessToken({ userId, clientId, scopes, resource }) {
  return jwt.sign(
    { sub: userId, cid: clientId, scope: scopes.join(' '), typ: 'access' },
    config.jwtSecret,
    {
      expiresIn: config.accessTokenTtlSeconds,
      issuer: config.publicBaseUrl,
      audience: resource || resourceUrl().toString()
    }
  );
}

export function verifyAccessJwt(token) {
  try {
    const claims = jwt.verify(token, config.jwtSecret, { issuer: config.publicBaseUrl });
    if (claims.typ !== 'access') return null;
    return claims;
  } catch {
    return null;
  }
}

// ── OAuth authorize "ticket" (carries pending authorize params across login) ──
export function signTicket(payload) {
  return jwt.sign({ ...payload, typ: 'oauth_ticket' }, config.jwtSecret, { expiresIn: 600 });
}

export function verifyTicket(token) {
  try {
    const claims = jwt.verify(token, config.jwtSecret);
    if (claims.typ !== 'oauth_ticket') return null;
    return claims;
  } catch {
    return null;
  }
}
