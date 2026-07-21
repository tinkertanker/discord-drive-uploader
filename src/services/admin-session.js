import { createHmac, timingSafeEqual } from 'node:crypto';

export const ADMIN_SESSION_COOKIE = 'discord-drive-admin';
export const SECURE_ADMIN_SESSION_COOKIE = `__Host-${ADMIN_SESSION_COOKIE}`;
export const ADMIN_SESSION_TTL_SECONDS = 12 * 60 * 60;

function sign(value, secret) {
  return createHmac('sha256', secret).update(value).digest('base64url');
}

function signaturesMatch(expected, received) {
  if (!expected || !received) return false;
  const expectedBuffer = Buffer.from(expected);
  const receivedBuffer = Buffer.from(received);
  if (expectedBuffer.length !== receivedBuffer.length) return false;
  return timingSafeEqual(expectedBuffer, receivedBuffer);
}

export function createAdminSession(email, secret, now = Date.now()) {
  const payload = Buffer.from(JSON.stringify({
    email: email.toLowerCase(),
    expiresAt: now + ADMIN_SESSION_TTL_SECONDS * 1000
  })).toString('base64url');

  return `${payload}.${sign(payload, secret)}`;
}

export function verifyAdminSession(value, secret, allowedEmails, now = Date.now()) {
  if (!value || !secret) return null;

  const separator = value.lastIndexOf('.');
  if (separator === -1) return null;

  const payload = value.slice(0, separator);
  const signature = value.slice(separator + 1);
  if (!signaturesMatch(sign(payload, secret), signature)) return null;

  try {
    const session = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    const email = typeof session.email === 'string' ? session.email.toLowerCase() : '';
    if (!email || !Number.isFinite(session.expiresAt) || session.expiresAt <= now) return null;
    if (!allowedEmails.includes(email)) return null;
    return { email, expiresAt: session.expiresAt };
  } catch {
    return null;
  }
}

export function adminSessionCookie(value, secure) {
  const name = secure ? SECURE_ADMIN_SESSION_COOKIE : ADMIN_SESSION_COOKIE;
  const maxAge = value ? ADMIN_SESSION_TTL_SECONDS : 0;
  const flags = ['Path=/', 'HttpOnly', 'SameSite=Lax', `Max-Age=${maxAge}`];
  if (secure) flags.push('Secure');
  return `${name}=${value}; ${flags.join('; ')}`;
}
