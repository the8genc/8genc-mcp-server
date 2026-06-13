/**
 * Symmetric encryption for credential secrets at rest (AES-256-GCM).
 *
 * Key: CREDENTIALS_ENC_KEY (32 bytes as hex[64] or base64), else derived from
 * config.jwtSecret via scrypt. Ciphertext format: "v1:<iv b64>:<tag b64>:<ct b64>".
 * Secrets are decrypted only at resolution time; status surfaces never return values.
 */
import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'node:crypto';
import { config } from '../config.js';

let _key = null;
function key() {
  if (_key) return _key;
  const raw = process.env.CREDENTIALS_ENC_KEY;
  if (raw) {
    const buf = /^[0-9a-fA-F]{64}$/.test(raw) ? Buffer.from(raw, 'hex') : Buffer.from(raw, 'base64');
    if (buf.length === 32) {
      _key = buf;
      return _key;
    }
    console.error('[credentials] CREDENTIALS_ENC_KEY is not 32 bytes — deriving from JWT_SECRET instead.');
  }
  _key = scryptSync(config.jwtSecret, 'tool-credentials-enc-v1', 32);
  return _key;
}

/** Encrypt a JSON-serializable object → "v1:iv:tag:ct" (base64 parts). */
export function encryptJson(obj) {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key(), iv);
  const pt = Buffer.from(JSON.stringify(obj ?? {}), 'utf8');
  const ct = Buffer.concat([cipher.update(pt), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `v1:${iv.toString('base64')}:${tag.toString('base64')}:${ct.toString('base64')}`;
}

/** Decrypt a "v1:iv:tag:ct" string back to the original object. Throws on tamper/format. */
export function decryptJson(s) {
  const parts = String(s).split(':');
  if (parts.length !== 4 || parts[0] !== 'v1') throw new Error('unrecognized ciphertext format');
  const [, ivb, tagb, ctb] = parts;
  const decipher = createDecipheriv('aes-256-gcm', key(), Buffer.from(ivb, 'base64'));
  decipher.setAuthTag(Buffer.from(tagb, 'base64'));
  const pt = Buffer.concat([decipher.update(Buffer.from(ctb, 'base64')), decipher.final()]);
  return JSON.parse(pt.toString('utf8'));
}
