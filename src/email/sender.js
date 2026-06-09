/**
 * Pluggable email sender. Default 'dev' provider logs the message (and any
 * action link) to stdout so the flows work without an email account. Wire
 * 'smtp' or 'resend' later via env without touching call sites.
 */

import { config } from '../config.js';

async function sendResend({ to, subject, text }) {
  // Minimal Resend HTTP call; only used when EMAIL_PROVIDER=resend.
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${config.email.resendApiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ from: config.email.from, to, subject, text })
  });
  if (!res.ok) throw new Error(`Resend failed: ${res.status} ${await res.text()}`);
}

let _smtpTransport = null;
async function sendSmtp({ to, subject, text }) {
  if (!_smtpTransport) {
    const nodemailer = (await import('nodemailer')).default;
    // Append fail-fast timeouts so a blocked SMTP egress (e.g. PaaS that filters
    // outbound port 587) errors quickly instead of hanging the connection.
    const u = config.email.smtpUrl;
    const url = u + (u.includes('?') ? '&' : '?') + 'connectionTimeout=8000&greetingTimeout=8000&socketTimeout=10000';
    _smtpTransport = nodemailer.createTransport(url);
  }
  await _smtpTransport.sendMail({ from: config.email.from, to, subject, text });
}

function logDev({ to, subject, text }) {
  console.error('\n──────── EMAIL (dev mode) ────────');
  console.error(`To:      ${to}`);
  console.error(`Subject: ${subject}`);
  console.error(text);
  console.error('──────────────────────────────────\n');
}

const withTimeout = (p, ms) =>
  Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error('email send timed out')), ms))]);

/** Send and await delivery (bounded). Throws on failure — callers that don't
 *  want to block/fail a request should use queueEmail() instead. */
export async function sendEmail({ to, subject, text }) {
  const provider = config.email.provider;
  if (provider === 'resend' && config.email.resendApiKey) return withTimeout(sendResend({ to, subject, text }), 12000);
  if (provider === 'smtp' && config.email.smtpUrl) return withTimeout(sendSmtp({ to, subject, text }), 12000);
  // dev (default) or misconfigured provider: log so flows remain usable.
  logDev({ to, subject, text });
}

/** Fire-and-forget: never throws and never blocks the caller's response.
 *  Use in request handlers so a slow/blocked email provider can't hang or 500 them. */
export function queueEmail(msg) {
  sendEmail(msg).catch((err) => console.error(`[email] send to ${msg.to} failed:`, err.message));
}

/** Build an absolute portal action URL (verification / reset links). */
export function portalLink(path, params = {}) {
  const url = new URL(`/access${path}`, config.publicBaseUrl);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  return url.toString();
}
