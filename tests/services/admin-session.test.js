import {
  ADMIN_SESSION_TTL_SECONDS,
  adminSessionCookie,
  createAdminSession,
  verifyAdminSession
} from '../../src/services/admin-session.js';

describe('admin sessions', () => {
  const secret = 'a'.repeat(64);
  const email = 'admin@tinkertanker.com';
  const now = Date.parse('2026-07-21T00:00:00Z');

  test('creates and verifies an allowed signed session', () => {
    const value = createAdminSession(email.toUpperCase(), secret, now);

    expect(verifyAdminSession(value, secret, [email], now)).toEqual({
      email,
      expiresAt: now + ADMIN_SESSION_TTL_SECONDS * 1000
    });
  });

  test('rejects tampered, expired, and no-longer-allowed sessions', () => {
    const value = createAdminSession(email, secret, now);

    expect(verifyAdminSession(`${value}x`, secret, [email], now)).toBeNull();
    expect(verifyAdminSession(value, secret, [email], now + ADMIN_SESSION_TTL_SECONDS * 1000)).toBeNull();
    expect(verifyAdminSession(value, secret, ['someone@example.com'], now)).toBeNull();
  });

  test('uses a host-only secure cookie in production', () => {
    expect(adminSessionCookie('signed-value', true)).toContain(
      '__Host-discord-drive-admin=signed-value; Path=/; HttpOnly; SameSite=Lax;'
    );
    expect(adminSessionCookie('signed-value', true)).toContain('Secure');
  });
});
