/** Password hashing (bcryptjs — pure JS, no native build). */
import bcrypt from 'bcryptjs';
import { config } from '../config.js';

export function hashPassword(plain) {
  return bcrypt.hash(plain, config.bcryptRounds);
}

export function verifyPassword(plain, hash) {
  if (!hash) return Promise.resolve(false);
  return bcrypt.compare(plain, hash);
}

/** Minimum policy: 8+ chars. Returns null if ok, else an error message. */
export function validatePasswordStrength(pw) {
  if (typeof pw !== 'string' || pw.length < 8) return 'Password must be at least 8 characters';
  if (pw.length > 200) return 'Password is too long';
  return null;
}
