import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createAdminSession } from '../../src/services/admin-session.js';

const adminEmail = 'admin@example.com';
const sessionSecret = 'a'.repeat(64);
const tempDirectory = await mkdtemp(join(tmpdir(), 'discord-drive-auth-test-'));

process.env.ADMIN_EMAILS = adminEmail;
process.env.ADMIN_SESSION_SECRET = sessionSecret;
process.env.CONFIG_STORE_PATH = join(tempDirectory, 'config.json');
process.env.GOOGLE_CLIENT_ID = 'test-client';
process.env.GOOGLE_CLIENT_SECRET = 'test-secret';
process.env.GOOGLE_REDIRECT_URI = 'http://localhost/auth/google/callback';

const { server } = await import('../../src/index.js');

let baseUrl;
let adminCookie;

function stateCookie(response) {
  return response.headers.get('set-cookie').split(';')[0];
}

beforeAll(async () => {
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const address = server.address();
  baseUrl = `http://127.0.0.1:${address.port}`;
  adminCookie = `discord-drive-admin=${createAdminSession(adminEmail, sessionSecret)}`;
});

afterAll(async () => {
  await new Promise((resolve) => server.close(resolve));
  await rm(tempDirectory, { recursive: true, force: true });
});

test('redirects anonymous page requests and rejects anonymous API requests', async () => {
  const pageResponse = await fetch(`${baseUrl}/`, { redirect: 'manual' });
  expect(pageResponse.status).toBe(302);
  expect(pageResponse.headers.get('location')).toBe('/login');

  const apiResponse = await fetch(`${baseUrl}/api/setup-complete`);
  expect(apiResponse.status).toBe(401);
  expect(apiResponse.headers.get('x-auth-required')).toBe('true');

  const driveResponse = await fetch(`${baseUrl}/auth/google/start`);
  expect(driveResponse.status).toBe(401);
});

test('serves the dashboard to a valid signed admin session', async () => {
  const response = await fetch(`${baseUrl}/`, {
    headers: { Cookie: adminCookie }
  });

  expect(response.status).toBe(200);
  expect(await response.text()).toContain('<title>Drive Uploader</title>');
});

test('rejects cross-origin and non-JSON configuration writes', async () => {
  const body = JSON.stringify({ guildId: 'guild-1', channelId: 'channel-1' });
  const crossOriginResponse = await fetch(`${baseUrl}/api/config-channel`, {
    method: 'POST',
    headers: {
      Cookie: adminCookie,
      Origin: 'https://evil.tk.sg',
      'Content-Type': 'text/plain'
    },
    body
  });
  expect(crossOriginResponse.status).toBe(403);

  const wrongContentTypeResponse = await fetch(`${baseUrl}/api/config-channel`, {
    method: 'POST',
    headers: {
      Cookie: adminCookie,
      Origin: baseUrl,
      'Content-Type': 'text/plain'
    },
    body
  });
  expect(wrongContentTypeResponse.status).toBe(415);

  const validResponse = await fetch(`${baseUrl}/api/config-channel`, {
    method: 'POST',
    headers: {
      Cookie: adminCookie,
      Origin: baseUrl,
      'Content-Type': 'application/json'
    },
    body
  });
  expect(validResponse.status).toBe(200);
});

test('routes a cancelled Google login back to the login page and consumes its state', async () => {
  const startResponse = await fetch(`${baseUrl}/auth/google/login`, { redirect: 'manual' });
  const location = new URL(startResponse.headers.get('location'));
  const state = location.searchParams.get('state');

  const callbackResponse = await fetch(
    `${baseUrl}/auth/google/callback?error=access_denied&state=${encodeURIComponent(state)}`,
    {
      redirect: 'manual',
      headers: { Cookie: stateCookie(startResponse) }
    }
  );

  expect(callbackResponse.status).toBe(302);
  expect(callbackResponse.headers.get('location')).toBe('/login?error=oauth_cancelled');
  expect(callbackResponse.headers.get('set-cookie')).toContain('discord-drive-state=;');
  expect(callbackResponse.headers.get('set-cookie')).toContain('Max-Age=0');

  const repeatedCallback = await fetch(
    `${baseUrl}/auth/google/callback?error=access_denied&state=${encodeURIComponent(state)}`,
    { headers: { Cookie: stateCookie(startResponse) } }
  );
  expect(repeatedCallback.status).toBe(400);
});

test('protects logout by origin and clears both admin cookie variants', async () => {
  const crossOriginResponse = await fetch(`${baseUrl}/auth/logout`, {
    method: 'POST',
    headers: { Cookie: adminCookie, Origin: 'https://evil.tk.sg' },
    redirect: 'manual'
  });
  expect(crossOriginResponse.status).toBe(403);

  const response = await fetch(`${baseUrl}/auth/logout`, {
    method: 'POST',
    headers: { Cookie: adminCookie, Origin: baseUrl },
    redirect: 'manual'
  });
  const cookies = response.headers.get('set-cookie');

  expect(response.status).toBe(303);
  expect(response.headers.get('location')).toBe('/login');
  expect(cookies).toContain('discord-drive-admin=;');
  expect(cookies).toContain('__Host-discord-drive-admin=;');
  expect(cookies.match(/Max-Age=0/g)).toHaveLength(2);
});
