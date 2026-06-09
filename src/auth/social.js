/**
 * Google / GitHub federation via arctic. New social users are created as
 * `pending` (admin must approve) with email_verified=true (the provider verified
 * it). Enabled per-provider only when its client id+secret are configured.
 *
 * Routes:
 *   GET /access/api/oauth/:provider/start?ticket=...  (start — in portal API)
 *   GET /auth/:provider/callback                       (callback — mounted at root)
 */

import { Router } from 'express';
import jwt from 'jsonwebtoken';
import { Google, GitHub, decodeIdToken, generateState, generateCodeVerifier } from 'arctic';
import { config } from '../config.js';
import { setSessionCookie } from './session.js';
import * as users from '../db/repositories/users.js';
import * as identities from '../db/repositories/oauthIdentities.js';

const TX_COOKIE = 'social_tx';

function googleClient() {
  if (!config.google.clientId || !config.google.clientSecret) return null;
  return new Google(config.google.clientId, config.google.clientSecret, `${config.publicBaseUrl}/auth/google/callback`);
}
function githubClient() {
  if (!config.github.clientId || !config.github.clientSecret) return null;
  return new GitHub(config.github.clientId, config.github.clientSecret, `${config.publicBaseUrl}/auth/github/callback`);
}

export function socialEnabled() {
  return { google: !!googleClient(), github: !!githubClient() };
}

function setTx(res, payload) {
  const token = jwt.sign({ ...payload, typ: 'social_tx' }, config.jwtSecret, { expiresIn: 600 });
  res.cookie(TX_COOKIE, token, { httpOnly: true, secure: config.cookieSecure, sameSite: 'lax', maxAge: 600000, path: '/' });
}
function readTx(req) {
  const raw = req.cookies?.[TX_COOKIE];
  if (!raw) return null;
  try {
    const c = jwt.verify(raw, config.jwtSecret);
    return c.typ === 'social_tx' ? c : null;
  } catch { return null; }
}

async function uniqueUsername(base) {
  const clean = (base || 'user').toLowerCase().replace(/[^a-z0-9_.-]+/g, '').slice(0, 32) || 'user';
  if (!(await users.findByUsername(clean))) return clean;
  for (let i = 0; i < 5; i++) {
    const candidate = `${clean}-${Math.random().toString(36).slice(2, 6)}`;
    if (!(await users.findByUsername(candidate))) return candidate;
  }
  return `${clean}-${Date.now().toString(36)}`;
}

/** Find existing user by identity or email; otherwise create a pending one. Returns the user. */
async function resolveUser({ provider, providerUserId, email, displayName }) {
  const linkedId = await identities.findUserIdByProvider(provider, providerUserId);
  if (linkedId) return users.findById(linkedId);

  let user = email ? await users.findByEmail(email) : null;
  if (!user) {
    user = await users.createUser({
      username: await uniqueUsername(displayName || (email ? email.split('@')[0] : provider)),
      email: email || null,
      passwordHash: null,
      status: 'pending',
      role: 'user',
      emailVerified: !!email
    });
  }
  await identities.link({ userId: user.id, provider, providerUserId });
  return user;
}

// ── Start routes (mounted under /access/api/oauth) ──
export function socialStartRoutes() {
  const router = Router();

  router.get('/:provider/start', (req, res) => {
    const provider = req.params.provider;
    const ticket = req.query.ticket ? String(req.query.ticket) : null;
    const state = generateState();

    if (provider === 'google') {
      const g = googleClient();
      if (!g) return res.status(404).json({ error: 'provider_disabled' });
      const codeVerifier = generateCodeVerifier();
      setTx(res, { provider, state, codeVerifier, ticket });
      return res.redirect(g.createAuthorizationURL(state, codeVerifier, ['openid', 'email', 'profile']).toString());
    }
    if (provider === 'github') {
      const gh = githubClient();
      if (!gh) return res.status(404).json({ error: 'provider_disabled' });
      setTx(res, { provider, state, ticket });
      return res.redirect(gh.createAuthorizationURL(state, ['read:user', 'user:email']).toString());
    }
    return res.status(404).json({ error: 'unknown_provider' });
  });

  return router;
}

// ── Callback routes (mounted at root: /auth/:provider/callback) ──
export function socialCallbackRoutes() {
  const router = Router();

  router.get('/auth/:provider/callback', async (req, res) => {
    const provider = req.params.provider;
    const code = String(req.query.code || '');
    const state = String(req.query.state || '');
    const tx = readTx(req);
    res.clearCookie(TX_COOKIE, { path: '/' });

    if (!tx || tx.provider !== provider || tx.state !== state || !code) {
      return res.redirect(`${config.publicBaseUrl}/access/login?error=oauth`);
    }

    try {
      let profile;
      if (provider === 'google') {
        const tokens = await googleClient().validateAuthorizationCode(code, tx.codeVerifier);
        const claims = decodeIdToken(tokens.idToken());
        profile = { providerUserId: String(claims.sub), email: claims.email, displayName: claims.name };
      } else if (provider === 'github') {
        const tokens = await githubClient().validateAuthorizationCode(code);
        const at = tokens.accessToken();
        const u = await fetch('https://api.github.com/user', {
          headers: { Authorization: `Bearer ${at}`, 'User-Agent': '8genc-mcp-server', Accept: 'application/vnd.github+json' }
        }).then((r) => r.json());
        let email = u.email;
        if (!email) {
          const emails = await fetch('https://api.github.com/user/emails', {
            headers: { Authorization: `Bearer ${at}`, 'User-Agent': '8genc-mcp-server', Accept: 'application/vnd.github+json' }
          }).then((r) => r.json());
          email = Array.isArray(emails) ? (emails.find((e) => e.primary && e.verified) || emails.find((e) => e.verified) || {}).email : null;
        }
        profile = { providerUserId: String(u.id), email: email || null, displayName: u.login };
      } else {
        return res.redirect(`${config.publicBaseUrl}/access/login?error=oauth`);
      }

      const user = await resolveUser({ provider, ...profile });
      if (user.status === 'blocked') return res.redirect(`${config.publicBaseUrl}/access/login?error=blocked`);
      setSessionCookie(res, user);

      const dest = tx.ticket
        ? `/access/authorize?ticket=${encodeURIComponent(tx.ticket)}`
        : '/access';
      return res.redirect(`${config.publicBaseUrl}${dest}`);
    } catch (err) {
      console.error(`[social] ${provider} callback failed:`, err.message);
      return res.redirect(`${config.publicBaseUrl}/access/login?error=oauth`);
    }
  });

  return router;
}
