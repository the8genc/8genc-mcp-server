/**
 * Portal REST API mounted at /access/api.
 *
 * Public:   register, login, logout, verify-email, forgot/reset password
 * User:     me, change-password, personal access token CRUD
 * Admin:    list users, approve/reject, block/unblock, reset password, elevate/demote
 *
 * All responses are JSON. Session is a httpOnly cookie (see auth/session.js).
 */

import { Router } from 'express';
import { z } from 'zod';

import * as users from '../db/repositories/users.js';
import * as pats from '../db/repositories/personalTokens.js';
import * as emailTokens from '../db/repositories/emailTokens.js';
import { hashPassword, verifyPassword, validatePasswordStrength } from '../auth/passwords.js';
import { generatePat, randomToken, sha256 } from '../auth/tokens.js';
import { setSessionCookie, clearSessionCookie, requireSession, requireAdmin, requirePasswordChange } from '../auth/session.js';
import { loginLimiter, registerLimiter, passwordResetLimiter } from '../auth/rateLimit.js';
import { queueEmail, portalLink } from '../email/sender.js';
import { socialStartRoutes, socialEnabled } from '../auth/social.js';

const TOKEN_TTL_MS = 1000 * 60 * 60; // 1h for verify/reset links

function ok(res, body = {}) {
  return res.json({ ok: true, ...body });
}
function fail(res, status, error, extra = {}) {
  return res.status(status).json({ error, ...extra });
}
function uniqueViolation(err) {
  return err && err.code === '23505';
}

export function createPortalApiRouter({ oauth = null } = {}) {
  const router = Router();

  // ── Register ──────────────────────────────────────────────────
  const registerSchema = z.object({
    username: z.string().min(3).max(40).regex(/^[a-zA-Z0-9_.-]+$/),
    email: z.string().email().max(200),
    password: z.string()
  });
  router.post('/register', registerLimiter, async (req, res) => {
    const parsed = registerSchema.safeParse(req.body);
    if (!parsed.success) return fail(res, 400, 'invalid_input', { details: parsed.error.flatten() });
    const { username, email, password } = parsed.data;

    const pwErr = validatePasswordStrength(password);
    if (pwErr) return fail(res, 400, 'weak_password', { message: pwErr });

    let user;
    try {
      user = await users.createUser({
        username,
        email,
        passwordHash: await hashPassword(password),
        status: 'pending',
        role: 'user',
        emailVerified: false
      });
    } catch (err) {
      if (uniqueViolation(err)) return fail(res, 409, 'username_or_email_taken');
      throw err;
    }

    await issueEmailToken(user, 'verify', 'Verify your 8genC account', '/verify-email');
    return ok(res, { user: users.publicUser(user), message: 'Registered. Check email to verify; an admin must approve your account before MCP access.' });
  });

  // ── Login ─────────────────────────────────────────────────────
  const loginSchema = z.object({ identifier: z.string().min(1), password: z.string().min(1) });
  router.post('/login', loginLimiter, async (req, res) => {
    const parsed = loginSchema.safeParse(req.body);
    if (!parsed.success) return fail(res, 400, 'invalid_input');
    const { identifier, password } = parsed.data;

    const user = await users.findByIdentifier(identifier);
    if (!user || !(await verifyPassword(password, user.password_hash))) {
      return fail(res, 401, 'invalid_credentials');
    }
    if (user.status === 'blocked') return fail(res, 403, 'account_blocked');

    setSessionCookie(res, user);
    return ok(res, { user: users.publicUser(user), mustChangePassword: user.must_change_password });
  });

  router.post('/logout', (req, res) => {
    clearSessionCookie(res);
    return ok(res);
  });

  // ── Email verification ────────────────────────────────────────
  router.post('/verify-email', async (req, res) => {
    const token = String(req.body?.token || '');
    if (!token) return fail(res, 400, 'missing_token');
    const row = await emailTokens.findValid(sha256(token), 'verify');
    if (!row) return fail(res, 400, 'invalid_or_expired_token');
    await emailTokens.markUsed(row.id);
    await users.setEmailVerified(row.user_id, true);
    return ok(res, { message: 'Email verified.' });
  });

  // ── Forgot / reset password ───────────────────────────────────
  router.post('/forgot-password', passwordResetLimiter, async (req, res) => {
    const email = String(req.body?.email || '');
    const user = await users.findByEmail(email);
    // Always 200 to avoid account enumeration.
    if (user) await issueEmailToken(user, 'reset', 'Reset your 8genC password', '/reset-password');
    return ok(res, { message: 'If that email exists, a reset link has been sent.' });
  });

  router.post('/reset-password', passwordResetLimiter, async (req, res) => {
    const token = String(req.body?.token || '');
    const password = String(req.body?.password || '');
    const pwErr = validatePasswordStrength(password);
    if (pwErr) return fail(res, 400, 'weak_password', { message: pwErr });
    const row = await emailTokens.findValid(sha256(token), 'reset');
    if (!row) return fail(res, 400, 'invalid_or_expired_token');
    await emailTokens.markUsed(row.id);
    await users.setPassword(row.user_id, await hashPassword(password));
    return ok(res, { message: 'Password reset. You can now log in.' });
  });

  // ── Current user ──────────────────────────────────────────────
  router.get('/me', requireSession(), (req, res) =>
    ok(res, { user: users.publicUser(req.sessionUser), mustChangePassword: req.sessionUser.must_change_password })
  );

  const changePwSchema = z.object({ currentPassword: z.string().min(1), newPassword: z.string() });
  router.post('/change-password', requireSession(), async (req, res) => {
    const parsed = changePwSchema.safeParse(req.body);
    if (!parsed.success) return fail(res, 400, 'invalid_input');
    const { currentPassword, newPassword } = parsed.data;
    const pwErr = validatePasswordStrength(newPassword);
    if (pwErr) return fail(res, 400, 'weak_password', { message: pwErr });
    if (!(await verifyPassword(currentPassword, req.sessionUser.password_hash))) {
      return fail(res, 401, 'invalid_credentials');
    }
    const updated = await users.setPassword(req.sessionUser.id, await hashPassword(newPassword));
    setSessionCookie(res, updated); // refresh session claims (status/role unchanged)
    return ok(res, { message: 'Password changed.' });
  });

  // ── Personal access tokens ────────────────────────────────────
  router.get('/tokens', requireSession(), async (req, res) =>
    ok(res, { tokens: await pats.listForUser(req.sessionUser.id) })
  );

  router.post('/tokens', requireSession(), requirePasswordChange(), async (req, res) => {
    const name = String(req.body?.name || 'token').slice(0, 60);
    const { token, hash } = generatePat();
    const row = await pats.createToken({ userId: req.sessionUser.id, name, tokenHash: hash });
    // The secret is shown exactly once.
    return ok(res, { id: row.id, name: row.name, token, message: 'Copy this token now — it will not be shown again.' });
  });

  router.delete('/tokens/:id', requireSession(), requirePasswordChange(), async (req, res) => {
    const revoked = await pats.revoke(req.params.id, req.sessionUser.id);
    if (!revoked) return fail(res, 404, 'not_found');
    return ok(res);
  });

  // ── Admin ─────────────────────────────────────────────────────
  const statusEnum = z.enum(['pending', 'approved', 'blocked']);
  router.get('/admin/users', requireAdmin(), requirePasswordChange(), async (req, res) => {
    let status = null;
    if (req.query.status != null) {
      const parsed = statusEnum.safeParse(String(req.query.status));
      if (!parsed.success) return fail(res, 400, 'invalid_status');
      status = parsed.data;
    }
    const list = await users.listUsers({ status });
    return ok(res, { users: list.map(users.publicUser) });
  });

  const adminAction = (fn) => [requireAdmin(), requirePasswordChange(), async (req, res) => {
    const target = await users.findById(req.params.id);
    if (!target) return fail(res, 404, 'user_not_found');
    return fn(req, res, target);
  }];

  router.post('/admin/users/:id/approve', ...adminAction(async (req, res, t) =>
    ok(res, { user: users.publicUser(await users.setStatus(t.id, 'approved')) })
  ));
  router.post('/admin/users/:id/reject', ...adminAction(async (req, res, t) =>
    ok(res, { user: users.publicUser(await users.setStatus(t.id, 'blocked')) })
  ));
  router.post('/admin/users/:id/block', ...adminAction(async (req, res, t) =>
    ok(res, { user: users.publicUser(await users.setStatus(t.id, 'blocked')) })
  ));
  router.post('/admin/users/:id/unblock', ...adminAction(async (req, res, t) =>
    ok(res, { user: users.publicUser(await users.setStatus(t.id, 'approved')) })
  ));

  router.post('/admin/users/:id/elevate', ...adminAction(async (req, res, t) => {
    if (!t.email_verified) return fail(res, 400, 'email_not_verified', { message: 'User must verify their email before being elevated to admin.' });
    return ok(res, { user: users.publicUser(await users.setRole(t.id, 'admin')) });
  }));
  router.post('/admin/users/:id/demote', ...adminAction(async (req, res, t) => {
    if (t.id === req.sessionUser.id) return fail(res, 400, 'cannot_demote_self');
    return ok(res, { user: users.publicUser(await users.setRole(t.id, 'user')) });
  }));

  router.post('/admin/users/:id/reset-password', ...adminAction(async (req, res, t) => {
    // Block self-reset: it sets a random temp password + must_change, which locks
    // the admin out if email delivery is unavailable. Use change-password instead.
    if (t.id === req.sessionUser.id) {
      return fail(res, 400, 'cannot_reset_self', { message: 'Use Change Password for your own account.' });
    }
    const temp = randomToken(9);
    await users.setPassword(t.id, await hashPassword(temp), { clearMustChange: false });
    await markMustChange(t.id);
    if (t.email) {
      queueEmail({
        to: t.email,
        subject: 'Your 8genC password was reset',
        text: `An administrator reset your password.\n\nTemporary password: ${temp}\n\nLog in at ${portalLink('/login')} and change it immediately.\n`
      });
    }
    return ok(res, { tempPassword: temp, message: 'Temporary password set; the user must change it on next login.' });
  }));

  // ── OAuth (authorization-server) consent + social login (PR3) ──
  // Which social providers are configured (public — used by the login UI).
  router.get('/oauth/providers', (_req, res) => ok(res, { providers: socialEnabled() }));

  if (oauth) {
    // Social login start: GET /oauth/:provider/start?ticket=...
    router.use('/oauth', socialStartRoutes());

    // Describe a pending authorize ticket (for the consent screen).
    router.get('/oauth/ticket', async (req, res) => {
      const info = await oauth.describeTicket(String(req.query.ticket || ''));
      if (!info) return fail(res, 400, 'invalid_ticket');
      return ok(res, info);
    });

    // Consent: the logged-in, approved user authorizes the client → mint a code.
    router.post('/oauth/consent', requireSession(), async (req, res) => {
      const claims = oauth.verifyTicket(String(req.body?.ticket || ''));
      if (!claims) return fail(res, 400, 'invalid_ticket');
      if (req.sessionUser.must_change_password) return fail(res, 409, 'must_change_password');
      if (req.sessionUser.status !== 'approved') {
        return fail(res, 403, 'not_approved', { status: req.sessionUser.status });
      }
      const redirectTo = await oauth.mintCodeForApprovedUser(claims, req.sessionUser);
      return ok(res, { redirectTo });
    });
  }

  // JSON 404 for any unmatched /access/api/* route (keeps the API JSON-only;
  // no HTML/default error page). Must be the last handler on this router.
  router.use((_req, res) => res.status(404).json({ error: 'not_found' }));

  return router;
}

// ── helpers ────────────────────────────────────────────────────
async function issueEmailToken(user, purpose, subject, path) {
  if (!user.email) return;
  await emailTokens.invalidateForUser(user.id, purpose);
  const token = randomToken(24);
  await emailTokens.create({
    userId: user.id,
    purpose,
    tokenHash: sha256(token),
    expiresAt: new Date(Date.now() + TOKEN_TTL_MS)
  });
  const link = portalLink(path, { token });
  // Fire-and-forget so a slow/blocked provider never hangs the request.
  queueEmail({ to: user.email, subject, text: `${subject}\n\nOpen this link (valid 1 hour):\n${link}\n` });
}

async function markMustChange(userId) {
  const { query } = await import('../db/pool.js');
  await query('UPDATE users SET must_change_password = true, updated_at = now() WHERE id = $1', [userId]);
}
