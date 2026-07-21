import { createServer } from 'node:http';
import { createReadStream, statSync } from 'node:fs';
import { promises as fs } from 'node:fs';
import { join, normalize, extname, resolve } from 'node:path';
import { randomBytes, timingSafeEqual } from 'node:crypto';
import { URL } from 'node:url';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';
import { config } from 'dotenv';
import { GoogleAuthService, refreshStoredGoogleTokens } from './services/google-auth.js';
import { ConfigStore } from './services/config-store.js';
import { GoogleDriveService } from './services/google-drive.js';
import { DiscordBot } from './handlers/message-handler.js';
import { createLogger } from './utils/logger.js';
import { handleDiscordInteraction } from './handlers/discord-interactions.js';
import {
  ADMIN_SESSION_COOKIE,
  SECURE_ADMIN_SESSION_COOKIE,
  adminSessionCookie,
  createAdminSession,
  verifyAdminSession
} from './services/admin-session.js';

config();

const logger = createLogger('Server');
const configStore = new ConfigStore();
await configStore.initialize();

const PORT = Number(process.env.PORT || 3000);
const ALLOWED_EMAIL_DOMAINS = (process.env.ALLOWED_EMAIL_DOMAINS || process.env.ALLOWED_EMAIL_DOMAIN || 'tinkertanker.com').toLowerCase().split(',').map((domain) => domain.trim()).filter(Boolean);
const ADMIN_EMAILS = (process.env.ADMIN_EMAILS || '').toLowerCase().split(',').map((email) => email.trim()).filter(Boolean);
const ADMIN_SESSION_SECRET = (process.env.ADMIN_SESSION_SECRET || '').trim();
const BASE_DIR = dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = join(BASE_DIR, '..', 'public');
const oauthState = new Map();
const OAUTH_STATE_TTL_MS = 10 * 60 * 1000;
const DEFAULT_DISCORD_FOLDER_NAME = 'default-for-discord';
let bot = null;
let botStartPromise = null;

if (ADMIN_EMAILS.length === 0) {
  throw new Error('ADMIN_EMAILS must contain at least one Google account');
}

if (ADMIN_SESSION_SECRET.length < 32) {
  throw new Error('ADMIN_SESSION_SECRET must be at least 32 characters');
}

const mimeTypes = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8'
};

const json = (body, statusCode = 200, headers = {}) => ({
  statusCode,
  headers: {
    'content-type': 'application/json; charset=utf-8',
    ...headers
  },
  body: JSON.stringify(body)
});

function getCookie(req, name) {
  const cookieHeader = req.headers.cookie || '';
  const cookies = cookieHeader
    .split(';')
    .map((item) => item.trim())
    .filter(Boolean)
    .reduce((acc, pair) => {
      const index = pair.indexOf('=');
      if (index === -1) {
        return acc;
      }
      acc[pair.slice(0, index)] = pair.slice(index + 1);
      return acc;
    }, {});
  return cookies[name];
}

function isSecureRequest(req) {
  const forwardedProto = String(req.headers['x-forwarded-proto'] || '').split(',')[0].trim();
  return forwardedProto === 'https' || Boolean(req.socket.encrypted);
}

function isTrustedOrigin(req) {
  const origin = req.headers.origin;
  const host = req.headers.host;
  if (!origin || !host) return false;
  const protocol = isSecureRequest(req) ? 'https' : 'http';
  return origin === `${protocol}://${host}`;
}

function appendCookie(res, cookie) {
  const current = res.getHeader('Set-Cookie');
  const cookies = current ? (Array.isArray(current) ? current : [current]) : [];
  res.setHeader('Set-Cookie', [...cookies, cookie]);
}

function sendResponse(res, payload) {
  res.statusCode = payload.statusCode || 200;
  res.statusMessage = 'OK';

  const headers = payload.headers || {};
  Object.entries(headers).forEach(([key, value]) => {
    res.setHeader(key, value);
  });

  const body = payload.body || '';
  res.end(body);
}

async function getRequestBody(req) {
  const chunks = [];
  for await (const chunk of req) {
    chunks.push(chunk);
  }
  return Buffer.concat(chunks).toString();
}

function setStateCookie(req, res, state) {
  const isSecure = isSecureRequest(req);
  const maxAge = state ? 600 : 0;
  const flags = ['Path=/', 'HttpOnly', 'SameSite=Lax', `Max-Age=${maxAge}`];
  if (isSecure) {
    flags.push('Secure');
  }
  appendCookie(res, `discord-drive-state=${state}; ${flags.join('; ')}`);
}

function verifyStateCookie(expected, received) {
  if (!expected || !received) return false;
  const expectedBuffer = Buffer.from(expected);
  const receivedBuffer = Buffer.from(received);
  if (expectedBuffer.length !== receivedBuffer.length) return false;
  return timingSafeEqual(expectedBuffer, receivedBuffer);
}

function isEmailAllowed(email) {
  if (ALLOWED_EMAIL_DOMAINS.length === 0) return true;
  if (!email || !email.includes('@')) return false;
  const [, domain] = email.toLowerCase().split('@');
  return ALLOWED_EMAIL_DOMAINS.includes(domain);
}

function getAdminSession(req) {
  const value = getCookie(req, SECURE_ADMIN_SESSION_COOKIE) || getCookie(req, ADMIN_SESSION_COOKIE);
  return verifyAdminSession(value, ADMIN_SESSION_SECRET, ADMIN_EMAILS);
}

function setAdminSession(req, res, email) {
  const value = createAdminSession(email, ADMIN_SESSION_SECRET);
  appendCookie(res, adminSessionCookie(value, isSecureRequest(req)));
}

function clearAdminSession(res) {
  appendCookie(res, adminSessionCookie('', false));
  appendCookie(res, adminSessionCookie('', true));
}

function isAuthorizedAdminRequest(req, res) {
  const session = getAdminSession(req);
  if (session) return session;
  sendResponse(res, json(
    { error: 'Authentication required' },
    401,
    { 'x-auth-required': 'true' }
  ));
  return null;
}

function isAuthorizedAdminMutation(req, res) {
  const session = isAuthorizedAdminRequest(req, res);
  if (!session) return null;
  if (isTrustedOrigin(req)) return session;
  sendResponse(res, json({ error: 'Untrusted request origin' }, 403));
  return null;
}

function cleanupOAuthState() {
  const now = Date.now();
  for (const [state, pending] of oauthState.entries()) {
    if (now - pending.startedAt > OAUTH_STATE_TTL_MS) {
      oauthState.delete(state);
    }
  }
}

function renderIndexPage(html) {
  return html.replace('%DISCORD_APPLICATION_ID%', process.env.DISCORD_APPLICATION_ID || '');
}

async function ensureBotRunning() {
  if (bot) return bot;
  if (botStartPromise) return botStartPromise;

  botStartPromise = (async () => {
    const newBot = new DiscordBot();
    await newBot.initialize();
    await newBot.registerSlashCommands();
    bot = newBot;
    return bot;
  })().catch((error) => {
    bot = null;
    logger.error('Failed to start bot:', error);
    throw error;
  }).finally(() => {
    botStartPromise = null;
  });

  return botStartPromise;
}

function normalizeBoolean(value, fallback = false) {
  if (typeof value === 'boolean') {
    return value;
  }

  if (typeof value === 'string') {
    const lowered = value.toLowerCase();
    return lowered === 'true' || lowered === '1';
  }

  return fallback;
}

async function getRunningBot(req, res) {
  try {
    return await ensureBotRunning();
  } catch (error) {
    sendResponse(res, json({ error: error.message || 'Bot is not running' }, 503));
    return null;
  }
}

async function readJsonBody(req, res) {
  const contentType = String(req.headers['content-type'] || '').split(';')[0].trim().toLowerCase();
  if (contentType !== 'application/json') {
    sendResponse(res, json({ error: 'Content-Type must be application/json' }, 415));
    return null;
  }

  const bodyText = await getRequestBody(req);
  try {
    return JSON.parse(bodyText || '{}');
  } catch {
    sendResponse(res, json({ error: 'Invalid JSON body' }, 400));
    return null;
  }
}

async function readStaticFile(filePath, res) {
  try {
    const normalized = normalize(filePath);
    if (!normalized.startsWith(PUBLIC_DIR)) {
      throw new Error('Invalid path');
    }

    const file = await fs.stat(normalized);
    if (!file.isFile()) {
      throw new Error('Not a file');
    }

    const extension = extname(normalized);
    if (extension === '.html') {
      const html = await fs.readFile(normalized, 'utf8');
      const replaced = renderIndexPage(html);
      res.statusCode = 200;
      res.setHeader('content-type', mimeTypes[extension] || 'text/html; charset=utf-8');
      res.setHeader('cache-control', 'no-store');
      res.end(replaced);
      return;
    }

    res.statusCode = 200;
    res.setHeader('content-type', mimeTypes[extension] || 'application/octet-stream');
    createReadStream(normalized).pipe(res);
    return;
  } catch (error) {
    const fallback = join(PUBLIC_DIR, 'index.html');
    const fallbackStats = statSync(fallback);
    if (!fallbackStats.isFile()) throw error;

    const html = await fs.readFile(fallback, 'utf8');
    const replaced = renderIndexPage(html);
    res.statusCode = 200;
    res.setHeader('content-type', 'text/html; charset=utf-8');
    res.setHeader('cache-control', 'no-store');
    res.end(replaced);
  }
}

async function handleGoogleFolders(tokens) {
  const authService = new GoogleAuthService();

  if (tokens.expired || !tokens.access_token) {
    if (!tokens.refresh_token) {
      throw new Error('Missing Google refresh token');
    }
    const refreshed = await refreshStoredGoogleTokens(configStore, tokens);
    authService.setCredentials(refreshed);
  } else {
    authService.setCredentials(tokens);
  }

  const driveService = new GoogleDriveService(authService.getAuthClient());
  return driveService.listFolders();
}

async function getGoogleTokensForClient() {
  const tokens = await configStore.getGoogleTokens();
  if (!tokens) {
    return null;
  }

  if (!tokens.expired && tokens.access_token) {
    return tokens;
  }

  if (!tokens.refresh_token) {
    throw new Error('Missing Google refresh token');
  }

  return refreshStoredGoogleTokens(configStore, tokens);
}

async function getGoogleDriveServiceForClient() {
  const tokens = await getGoogleTokensForClient();
  if (!tokens) {
    return null;
  }

  const authService = new GoogleAuthService();
  authService.setCredentials(tokens);
  return new GoogleDriveService(authService.getAuthClient());
}

export const server = createServer(async (req, res) => {
  const method = req.method || 'GET';
  const requestUrl = new URL(req.url || '/', `http://localhost:${PORT}`);
  const pathname = requestUrl.pathname;

  try {
    if (method === 'GET' && (pathname === '/login' || pathname === '/login.html')) {
      if (getAdminSession(req)) {
        res.statusCode = 302;
        res.setHeader('Location', '/');
        return res.end();
      }
      return await readStaticFile(join(PUBLIC_DIR, 'login.html'), res);
    }

    if (method === 'GET' && pathname === '/') {
      if (!getAdminSession(req)) {
        res.statusCode = 302;
        res.setHeader('Location', '/login');
        return res.end();
      }
      return await readStaticFile(join(PUBLIC_DIR, 'index.html'), res);
    }

    if (method === 'GET' && pathname === '/auth/google/login') {
      try {
        cleanupOAuthState();
        const authService = new GoogleAuthService();
        const state = randomBytes(16).toString('hex');
        oauthState.set(state, { startedAt: Date.now(), purpose: 'login' });

        setStateCookie(req, res, state);
        const authUrl = authService.generateLoginAuthUrl(state);
        res.statusCode = 302;
        res.setHeader('Location', authUrl);
        return res.end();
      } catch {
        return sendResponse(res, json({ error: 'Failed to start Google sign-in' }, 500));
      }
    }

    if (method === 'POST' && pathname === '/auth/logout') {
      if (!isTrustedOrigin(req)) {
        return sendResponse(res, json({ error: 'Untrusted request origin' }, 403));
      }
      clearAdminSession(res);
      res.statusCode = 303;
      res.setHeader('Location', '/login');
      return res.end();
    }

    if (method === 'GET' && pathname === '/auth/google/start') {
      if (!isAuthorizedAdminRequest(req, res)) return;
      try {
        cleanupOAuthState();
        const authService = new GoogleAuthService();
        const state = randomBytes(16).toString('hex');
        oauthState.set(state, { startedAt: Date.now(), purpose: 'drive' });

        setStateCookie(req, res, state);
        const authUrl = authService.generateAuthUrl(state);
        res.statusCode = 302;
        res.setHeader('Location', authUrl);
        return res.end();
      } catch {
        return sendResponse(res, json({ error: 'Failed to start authentication' }, 500));
      }
    }

    if (method === 'GET' && pathname === '/auth/google/callback') {
      cleanupOAuthState();
      const code = requestUrl.searchParams.get('code');
      const oauthError = requestUrl.searchParams.get('error');
      const state = requestUrl.searchParams.get('state');
      const cookieState = getCookie(req, 'discord-drive-state');
      const pending = oauthState.get(state);

      if (!pending || !verifyStateCookie(state || '', cookieState) || Date.now() - pending.startedAt > OAUTH_STATE_TTL_MS) {
        return sendResponse(res, json({ error: 'Invalid or expired OAuth state' }, 400));
      }

      oauthState.delete(state);
      setStateCookie(req, res, '');

      if (oauthError) {
        res.statusCode = 302;
        res.setHeader(
          'Location',
          pending.purpose === 'login'
            ? '/login?error=oauth_cancelled'
            : '/?error=drive_authorisation_cancelled'
        );
        return res.end();
      }

      if (!code) {
        return sendResponse(res, json({ error: 'Missing authorization code' }, 400));
      }

      const authService = new GoogleAuthService();
      const tokens = await authService.getTokensFromCode(code);
      authService.setCredentials(tokens);
      const accountEmail = await authService.getAccountEmail();

      if (pending.purpose === 'login') {
        const normalisedEmail = accountEmail?.toLowerCase() || '';
        if (!ADMIN_EMAILS.includes(normalisedEmail)) {
          logger.warn(`Google account blocked from admin sign-in: ${normalisedEmail || 'unknown'}`);
          clearAdminSession(res);
          res.statusCode = 302;
          res.setHeader('Location', '/login?error=not_authorised');
          return res.end();
        }

        setAdminSession(req, res, normalisedEmail);
        res.statusCode = 302;
        res.setHeader('Location', '/');
        return res.end();
      }

      if (!getAdminSession(req)) {
        res.statusCode = 302;
        res.setHeader('Location', '/login?error=session_expired');
        return res.end();
      }

      if (!isEmailAllowed(accountEmail)) {
        logger.warn(`Google account blocked from setup: ${accountEmail || 'unknown'}`);
        setStateCookie(req, res, '');
        const fallback = new URL('/index.html', requestUrl);
        fallback.searchParams.set('error', 'unauthorized_email');
        if (ALLOWED_EMAIL_DOMAINS.length > 0) {
          fallback.searchParams.set('allowed', ALLOWED_EMAIL_DOMAINS.join(','));
        }
        if (accountEmail) {
          fallback.searchParams.set('email', accountEmail);
        }
        res.statusCode = 302;
        res.setHeader('Location', fallback.pathname + fallback.search);
        return res.end();
      }

      await configStore.setGoogleTokens(tokens);

      res.statusCode = 302;
      res.setHeader('Location', '/index.html?step=3');
      return res.end();
    }

    if (method === 'GET' && pathname === '/api/folders') {
      if (!isAuthorizedAdminRequest(req, res)) return;

      const tokens = await getGoogleTokensForClient();
      if (!tokens) {
        return sendResponse(res, json({ error: 'Not authenticated with Google' }, 401));
      }

      const folders = await handleGoogleFolders(tokens);
      return sendResponse(res, json({ folders }));
    }

    if (method === 'GET' && pathname === '/api/google-picker-config') {
      if (!isAuthorizedAdminRequest(req, res)) return;

      const tokens = await getGoogleTokensForClient();
      if (!tokens) {
        return sendResponse(res, json({ error: 'Not authenticated with Google' }, 401));
      }

      const appId = (process.env.GOOGLE_APP_ID || process.env.GOOGLE_PROJECT_NUMBER || '').trim()
        || (process.env.GOOGLE_CLIENT_ID || '').split('-')[0]
        || '';

      return sendResponse(res, json({
        accessToken: tokens.access_token,
        apiKey: (process.env.GOOGLE_API_KEY || '').trim(),
        appId,
        pickerConfigured: Boolean(tokens.access_token && appId && process.env.GOOGLE_API_KEY)
      }));
    }

    if (method === 'GET' && pathname === '/api/config-folder') {
      if (!isAuthorizedAdminRequest(req, res)) return;

      const folder = await configStore.getDefaultFolder();
      return sendResponse(res, json({
        folder: folder || null
      }));
    }

    if (method === 'POST' && pathname === '/api/config-folder') {
      if (!isAuthorizedAdminMutation(req, res)) return;

      const body = await readJsonBody(req, res);
      if (body === null) return;

      const { folderId, folderName } = body;
      const createDefaultFolder = normalizeBoolean(body.createDefaultFolder, false);
      if (!folderId || !folderName) {
        return sendResponse(res, json({ error: 'Folder ID and name are required' }, 400));
      }

      let finalFolderId = folderId;
      let finalFolderName = folderName;
      let createdFolder = null;
      let reusedExistingFolder = false;

      if (createDefaultFolder) {
        const driveService = await getGoogleDriveServiceForClient();
        if (!driveService) {
          return sendResponse(res, json({ error: 'Not authenticated with Google' }, 401));
        }

        const existingFolder = await driveService.findFolderByName(DEFAULT_DISCORD_FOLDER_NAME, folderId);
        const targetFolder = existingFolder || await driveService.createFolder(DEFAULT_DISCORD_FOLDER_NAME, folderId);

        finalFolderId = targetFolder.id;
        finalFolderName = targetFolder.name;
        createdFolder = {
          id: targetFolder.id,
          name: targetFolder.name,
          parentId: folderId,
          parentName: folderName
        };
        reusedExistingFolder = Boolean(existingFolder);
      }

      await configStore.setDefaultFolder(finalFolderId, finalFolderName);

      return sendResponse(res, json({
        success: true,
        folder: { id: finalFolderId, name: finalFolderName },
        createdFolder,
        reusedExistingFolder,
        message: createDefaultFolder
          ? `${reusedExistingFolder ? 'Reused' : 'Created'} ${finalFolderName} and configured it as the default folder`
          : 'Default folder configured'
      }));
    }

    if (method === 'POST' && pathname === '/api/config-discord') {
      if (!isAuthorizedAdminMutation(req, res)) return;

      const body = await readJsonBody(req, res);
      if (body === null) return;

      const { token } = body;
      if (!token) {
        return sendResponse(res, json({ error: 'Discord bot token is required' }, 400));
      }

      if (!/^[A-Za-z0-9._-]+$/.test(token)) {
        return sendResponse(res, json({ error: 'Invalid token format' }, 400));
      }

      await configStore.setDiscordBotToken(token);
      ensureBotRunning().catch((error) => {
        logger.error('Bot failed to start after token save:', error);
      });

      return sendResponse(res, json({ success: true }));
    }

    if (method === 'GET' && pathname === '/api/bot-guilds') {
      if (!isAuthorizedAdminRequest(req, res)) return;

      const runningBot = await getRunningBot(req, res);
      if (!runningBot) return;

      return sendResponse(res, json({ guilds: runningBot.getConnectedGuilds() }));
    }

    if (method === 'GET' && pathname === '/api/guild-channels') {
      if (!isAuthorizedAdminRequest(req, res)) return;

      const guildId = requestUrl.searchParams.get('guildId');
      if (!guildId) {
        return sendResponse(res, json({ error: 'guildId query parameter is required' }, 400));
      }

      const runningBot = await getRunningBot(req, res);
      if (!runningBot) return;

      const channels = await runningBot.getGuildChannels(guildId);
      return sendResponse(res, json({ channels }));
    }

    if (method === 'GET' && pathname === '/api/channel-configs') {
      if (!isAuthorizedAdminRequest(req, res)) return;

      const configs = await configStore.getAllChannelConfigs();
      let guilds = [];
      try {
        const runningBot = await ensureBotRunning();
        guilds = runningBot?.getConnectedGuilds() || [];
      } catch (error) {
        logger.debug(`Guild names unavailable while loading mappings: ${error.message}`);
      }
      const guildMap = new Map(guilds.map((guild) => [guild.id, guild.name]));

      return sendResponse(res, json({
        configs: configs.map((config) => ({
          ...config,
          guildName: guildMap.get(config.guildId) || 'Unknown server'
        }))
      }));
    }

    if (method === 'POST' && pathname === '/api/config-channel') {
      if (!isAuthorizedAdminMutation(req, res)) return;

      const body = await readJsonBody(req, res);
      if (body === null) return;

      const guildId = body.guildId;
      const channelId = body.channelId;

      if (!guildId || !channelId) {
        return sendResponse(res, json({ error: 'guildId and channelId are required' }, 400));
      }

      if (body.remove === true) {
        await configStore.removeChannelFolder(guildId, channelId);
        return sendResponse(res, json({
          success: true,
          action: 'removed'
        }));
      }

      const enabled = normalizeBoolean(body.enabled, true);
      if (!enabled) {
        await configStore.setChannelSyncEnabled(guildId, channelId, false);
        return sendResponse(res, json({
          success: true,
          action: 'disabled'
        }));
      }

      const rawFolderId = body.folderId;
      const rawFolderName = body.folderName;
      const useDefault = rawFolderId == null;
      const folderId = typeof rawFolderId === 'string' ? rawFolderId.trim() : rawFolderId;
      const folderName = typeof rawFolderName === 'string' ? rawFolderName.trim() : rawFolderName;

      // Allow folderId to be null/omitted to link the channel to the default folder
      if (!useDefault && (typeof folderId !== 'string' || !folderId)) {
        return sendResponse(res, json({ error: 'folderId must be a non-empty string when specifying a folder' }, 400));
      }

      if (!useDefault && (typeof folderName !== 'string' || !folderName)) {
        return sendResponse(res, json({ error: 'folderName is required when specifying a folderId' }, 400));
      }

      await configStore.setChannelFolder(guildId, channelId, useDefault ? null : folderId, useDefault ? null : folderName, true);
      return sendResponse(res, json({
        success: true,
        action: 'enabled',
        mapping: {
          guildId,
          channelId,
          ...(useDefault ? { useDefault: true } : { folderId, folderName })
        }
      }));
    }

    if (method === 'GET' && pathname === '/api/setup-complete') {
      if (!isAuthorizedAdminRequest(req, res)) return;

      const storedGoogleTokens = await configStore.getGoogleTokens();
      const discordToken = await configStore.getDiscordBotToken();
      const defaultFolder = await configStore.getDefaultFolder();
      let googleConnected = false;

      if (storedGoogleTokens) {
        try {
          googleConnected = Boolean(await getGoogleTokensForClient());
        } catch (error) {
          logger.warn(`Unable to restore Google session during setup status check: ${error.message}`);
        }
      }

      const resumeStep = !googleConnected
        ? 2
        : !defaultFolder
          ? 3
          : !discordToken
            ? 4
            : 5;

      return sendResponse(res, json({
        success: true,
        message: 'Configuration is stored on disk.',
        configured: {
          google: googleConnected,
          discord: Boolean(discordToken),
          defaultFolder: Boolean(defaultFolder)
        },
        resumeStep,
        defaultFolder: defaultFolder || null,
        botInviteUrl: `https://discord.com/api/oauth2/authorize?client_id=${process.env.DISCORD_APPLICATION_ID}&permissions=3072&scope=bot%20applications.commands`
      }));
    }

    if (method === 'POST' && pathname === '/discord/interactions') {
      const body = await getRequestBody(req);
      const request = {
        headers: req.headers,
        body
      };
      const response = await handleDiscordInteraction(request);
      return sendResponse(res, {
        statusCode: response.statusCode || 200,
        headers: {
          'content-type': response.headers?.['Content-Type'] || 'application/json; charset=utf-8'
        },
        body: response.body || JSON.stringify(response)
      });
    }

    // Static assets and fallback page
    if (method === 'GET' && pathname === '/index.html') {
      if (!getAdminSession(req)) {
        res.statusCode = 302;
        res.setHeader('Location', '/login');
        return res.end();
      }
      return await readStaticFile(join(PUBLIC_DIR, 'index.html'), res);
    }

    if (method === 'GET' && (pathname.startsWith('/css/') || pathname.startsWith('/js/'))) {
      return await readStaticFile(join(PUBLIC_DIR, pathname), res);
    }

    sendResponse(res, json({ error: 'Not found' }, 404));
  } catch (error) {
    logger.error('Request failed:', error);
    sendResponse(res, json({ error: 'Internal server error' }, 500));
  }
});

if (resolve(process.argv[1] || '') === fileURLToPath(import.meta.url)) {
  server.listen(PORT, () => {
    logger.info(`Server listening on port ${PORT}`);

    ensureBotRunning().catch((error) => {
      logger.warn('Bot not started yet. Configure Discord token from setup page:', error.message);
    });
  });
}
