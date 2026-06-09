/** Rate limiters for sensitive auth endpoints. */
import rateLimit from 'express-rate-limit';

const make = (max, windowMs = 15 * 60 * 1000) =>
  rateLimit({
    windowMs,
    max,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'too_many_requests' }
  });

// Tighter limits on credential-guessing surfaces; looser on read/registration.
export const loginLimiter = make(20);
export const registerLimiter = make(10);
export const passwordResetLimiter = make(10);
