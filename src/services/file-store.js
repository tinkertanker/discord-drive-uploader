import { createLogger } from '../utils/logger.js';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';

const logger = createLogger('FileStore');

class FileStore {
  constructor() {
    this.storePath = process.env.CONFIG_STORE_PATH || process.env.APP_DATA_FILE || '/data/bot-config.json';
    this.data = null;
  }

  async load() {
    if (this.data !== null) return;

    this.data = {};

    try {
      const fileContents = await readFile(this.storePath, 'utf8');
      if (fileContents.trim()) {
        this.data = JSON.parse(fileContents);
      }
    } catch (error) {
      if (error.code !== 'ENOENT') {
        logger.error('Failed to load store file:', error);
      }
    }

    // Fall back to App Platform/legacy env values if no file data exists.
    if (Object.keys(this.data).length === 0) {
      const envMappings = {
        APP_DATA_GOOGLE_TOKENS: 'google_tokens',
        APP_DATA_DISCORD_BOT_TOKEN: 'discord_bot_token',
        APP_DATA_DEFAULT_FOLDER: 'default_folder'
      };

      Object.entries(envMappings).forEach(([envKey, storeKey]) => {
        if (!process.env[envKey]) return;

        try {
          this.data[storeKey] = JSON.parse(process.env[envKey]);
        } catch (error) {
          this.data[storeKey] = process.env[envKey];
        }
      });
    }
  }

  async get(key, options = {}) {
    await this.load();
    const value = this.data[key];

    if (options.type === 'json' && typeof value === 'string') {
      try {
        return JSON.parse(value);
      } catch (error) {
        logger.warn(`Failed to parse JSON value for ${key}:`, error);
        return value;
      }
    }

    return value;
  }

  async set(key, value) {
    await this.load();
    this.data[key] = value;
    await this.persist();

    logger.info(`Stored ${key} in file-backed store`);
  }

  async setJSON(key, value) {
    return this.set(key, value);
  }

  async list() {
    await this.load();
    return Object.keys(this.data);
  }

  async persist() {
    try {
      await mkdir(dirname(this.storePath), { recursive: true });
      await writeFile(this.storePath, JSON.stringify(this.data, null, 2), { mode: 0o600 });
    } catch (error) {
      logger.error('Failed to persist store file:', error);
      throw error;
    }
  }
}

// Singleton instance
let storeInstance = null;

export function getStore(_name) {
  if (!storeInstance) {
    storeInstance = new FileStore();
  }
  return storeInstance;
}