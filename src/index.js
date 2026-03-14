import { createServer } from 'node:http';
import { createReadStream, statSync } from 'node:fs';
import { promises as fs } from 'node:fs';
import { join, normalize, extname } from 'node:path';
import { randomBytes, timingSafeEqual } from 'node:crypto';
import { URL } from 'node:url';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';
import { config } from 'dotenv';
import { GoogleAuthService } from './services/google-auth.js';
import { ConfigStore } from './services/config-store.js';
import { GoogleDriveService } from './services/google-drive.js';
import { DiscordBot } from './handlers/message-handler.js';
import { createLogger } from './utils/logger.js';
import { handleDiscordInteraction } from './handlers/discord-interactions.js';

config();

const logger = createLogger('Server');
const configStore = new ConfigStore();
await configStore.initialize();

const PORT = Number(process.env.PORT || 3000);
const ALLOWED_EMAIL_DOMAINS = (process.env.ALLOWED_EMAIL_DOMAINS || process.env.ALLOWED_EMAIL_DOMAIN || 'tinkertanker.com').toLowerCase().split(',').map((domain) => domain.trim()).filter(Boolean);
const SETUP_API_TOKEN = (process.env.SETUP_API_TOKEN || '').trim();
const BASE_DIR = dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = join(BASE_DIR, '..', 'public');
const oauthState = new Map();
const OAUTH_STATE_TTL_MS = 10 * 60 * 1000;
let bot = null;
let botStartPromise = null;

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
  const proto = (req.headers['x-forwarded-proto'] || 'http').toLowerCase();
  const isSecure = proto === 'https';
  const maxAge = state ? 600 : 0;
  const flags = ['Path=/', 'HttpOnly', 'SameSite=Lax', `Max-Age=${maxAge}`];
  if (isSecure) {
    flags.push('Secure');
  }
  res.setHeader('Set-Cookie', `discord-drive-state=${state}; ${flags.join('; ')}`);
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

function cleanupOAuthState() {
  const now = Date.now();
  for (const [state, startedAt] of oauthState.entries()) {
    if (now - startedAt > OAUTH_STATE_TTL_MS) {
      oauthState.delete(state);
    }
  }
}

function getSetupTokenFromRequest(req) {
  if (!SETUP_API_TOKEN) {
    return null;
  }

  const headerToken = req.headers['x-setup-token'];
  if (headerToken) {
    return headerToken;
  }

  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return null;
  }

  return authHeader.slice(7);
}

function isAuthorizedSetupRequest(req, res) {
  if (!SETUP_API_TOKEN) {
    return true;
  }

  const token = getSetupTokenFromRequest(req);
  if (!token) {
    sendResponse(res, json({ error: 'Setup token required' }, 401));
    return false;
  }

  const tokenBuffer = Buffer.from(token);
  const expectedBuffer = Buffer.from(SETUP_API_TOKEN);

  if (tokenBuffer.length !== expectedBuffer.length || !timingSafeEqual(tokenBuffer, expectedBuffer)) {
    sendResponse(res, json({ error: 'Invalid setup token' }, 403));
    return false;
  }

  return true;
}

function renderIndexPage(html) {
  return html
    .replace('%DISCORD_APPLICATION_ID%', process.env.DISCORD_APPLICATION_ID || '')
    .replace('%SETUP_AUTH_REQUIRED%', SETUP_API_TOKEN ? 'true' : 'false');
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
    res.end(replaced);
  }
}

async function handleGoogleFolders(tokens) {
  const authService = new GoogleAuthService();

  if (tokens.expired || !tokens.access_token) {
    if (!tokens.refresh_token) {
      throw new Error('Missing Google refresh token');
    }
    const refreshed = await authService.refreshAccessToken(tokens.refresh_token);
    await configStore.setGoogleTokens(refreshed);
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

  const authService = new GoogleAuthService();
  const refreshed = await authService.refreshAccessToken(tokens.refresh_token);
  await configStore.setGoogleTokens(refreshed);
  return refreshed;
}

const server = createServer(async (req, res) => {
  const method = req.method || 'GET';
  const requestUrl = new URL(req.url || '/', `http://localhost:${PORT}`);
  const pathname = requestUrl.pathname;

  try {
    if (method === 'GET' && pathname === '/') {
      return await readStaticFile(join(PUBLIC_DIR, 'index.html'), res);
    }

    if (method === 'GET' && pathname === '/auth/google/start') {
      try {
        cleanupOAuthState();
        const authService = new GoogleAuthService();
        const state = randomBytes(16).toString('hex');
        oauthState.set(state, Date.now());

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
      const state = requestUrl.searchParams.get('state');
      const cookieState = getCookie(req, 'discord-drive-state');
      const storedAt = oauthState.get(state);

      if (!code) {
        return sendResponse(res, json({ error: 'Missing authorization code' }, 400));
      }

      if (!storedAt || !verifyStateCookie(state || '', cookieState) || Date.now() - storedAt > 10 * 60 * 1000) {
        return sendResponse(res, json({ error: 'Invalid or expired OAuth state' }, 400));
      }

      oauthState.delete(state);
      setStateCookie(req, res, '');

      const authService = new GoogleAuthService();
      const tokens = await authService.getTokensFromCode(code);
      authService.setCredentials(tokens);
      const accountEmail = await authService.getAccountEmail();

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
      if (!isAuthorizedSetupRequest(req, res)) return;

      const tokens = await getGoogleTokensForClient();
      if (!tokens) {
        return sendResponse(res, json({ error: 'Not authenticated with Google' }, 401));
      }

      const folders = await handleGoogleFolders(tokens);
      return sendResponse(res, json({ folders }));
    }

    if (method === 'GET' && pathname === '/api/google-picker-config') {
      if (!isAuthorizedSetupRequest(req, res)) return;

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

    if (method === 'POST' && pathname === '/api/config-folder') {
      if (!isAuthorizedSetupRequest(req, res)) return;

      const body = await readJsonBody(req, res);
      if (body === null) return;

      const { folderId, folderName } = body;
      if (!folderId || !folderName) {
        return sendResponse(res, json({ error: 'Folder ID and name are required' }, 400));
      }

      await configStore.setDefaultFolder(folderId, folderName);

      return sendResponse(res, json({ success: true, folder: { id: folderId, name: folderName }, message: 'Default folder configured' }));
    }

    if (method === 'POST' && pathname === '/api/config-discord') {
      if (!isAuthorizedSetupRequest(req, res)) return;

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
      if (!isAuthorizedSetupRequest(req, res)) return;

      const runningBot = await getRunningBot(req, res);
      if (!runningBot) return;

      return sendResponse(res, json({ guilds: runningBot.getConnectedGuilds() }));
    }

    if (method === 'GET' && pathname === '/api/guild-channels') {
      if (!isAuthorizedSetupRequest(req, res)) return;

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
      if (!isAuthorizedSetupRequest(req, res)) return;

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
      if (!isAuthorizedSetupRequest(req, res)) return;

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

      const { folderId, folderName } = body;
      if (!folderId || !folderName) {
        return sendResponse(res, json({ error: 'folderId and folderName are required when enabling a mapping' }, 400));
      }

      await configStore.setChannelFolder(guildId, channelId, folderId, folderName, true);
      return sendResponse(res, json({
        success: true,
        action: 'enabled',
        mapping: {
          guildId,
          channelId,
          folderId,
          folderName
        }
      }));
    }

    if (method === 'GET' && pathname === '/api/setup-complete') {
      if (!isAuthorizedSetupRequest(req, res)) return;

      const googleTokens = await configStore.getGoogleTokens();
      const discordToken = await configStore.getDiscordBotToken();
      const defaultFolder = await configStore.getDefaultFolder();

      return sendResponse(res, json({
        success: true,
        message: 'Configuration is stored on disk.',
        configured: {
          google: Boolean(googleTokens),
          discord: Boolean(discordToken),
          defaultFolder: Boolean(defaultFolder)
        },
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
    if (method === 'GET' && (pathname === '/index.html' || pathname.startsWith('/css/') || pathname.startsWith('/js/'))) {
      return await readStaticFile(join(PUBLIC_DIR, pathname === '/index.html' ? 'index.html' : pathname), res);
    }

    sendResponse(res, json({ error: 'Not found' }, 404));
  } catch (error) {
    logger.error('Request failed:', error);
    sendResponse(res, json({ error: 'Internal server error' }, 500));
  }
});

server.listen(PORT, () => {
  logger.info(`Server listening on port ${PORT}`);

  ensureBotRunning().catch((error) => {
    logger.warn('Bot not started yet. Configure Discord token from setup page:', error.message);
  });
});
