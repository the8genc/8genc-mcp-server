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

export async function sendEmail({ to, subject, text }) {
  const provider = config.email.provider;
  if (provider === 'resend' && config.email.resendApiKey) {
    await sendResend({ to, subject, text });
    return;
  }
  // dev (default) + smtp-not-yet-implemented fallback: log so flows are usable.
  console.error('\n──────── EMAIL (dev mode) ────────');
  console.error(`To:      ${to}`);
  console.error(`Subject: ${subject}`);
  console.error(text);
  console.error('──────────────────────────────────\n');
}

/** Build an absolute portal action URL (verification / reset links). */
export function portalLink(path, params = {}) {
  const url = new URL(`/access${path}`, config.publicBaseUrl);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  return url.toString();
}
