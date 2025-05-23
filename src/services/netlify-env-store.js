import { createLogger } from '../utils/logger.js';

const logger = createLogger('NetlifyEnvStore');

// Store data in Netlify environment variables
// This is a workaround for single-user bots
class NetlifyEnvStore {
  constructor() {
    this.cache = new Map();
    this.loaded = false;
  }

  async loadFromEnv() {
    if (this.loaded) return;
    
    try {
      // Load all APP_DATA_* environment variables
      Object.keys(process.env).forEach(key => {
        if (key.startsWith('APP_DATA_')) {
          const dataKey = key.substring(9).toLowerCase();
          try {
            const value = JSON.parse(process.env[key]);
            this.cache.set(dataKey, value);
            logger.info(`Loaded ${dataKey} from environment`);
          } catch (e) {
            logger.warn(`Failed to parse ${key}:`, e);
          }
        }
      });
      
      this.loaded = true;
    } catch (error) {
      logger.error('Failed to load from environment:', error);
    }
  }

  async get(key, options = {}) {
    await this.loadFromEnv();
    return this.cache.get(key);
  }

  async set(key, value) {
    await this.loadFromEnv();
    this.cache.set(key, value);
    
    // In production, you'd use Netlify API to update env vars
    // For now, we'll just keep it in memory
    logger.info(`Stored ${key} in cache`);
    
    // Log what the env var should be set to
    const envKey = `APP_DATA_${key.toUpperCase()}`;
    const envValue = JSON.stringify(value);
    logger.info(`To persist, set ${envKey} = ${envValue}`);
  }

  async setJSON(key, value) {
    return this.set(key, value);
  }

  async list() {
    await this.loadFromEnv();
    return Array.from(this.cache.keys());
  }
}

// Singleton instance
let storeInstance = null;

export function getStore(name) {
  if (!storeInstance) {
    storeInstance = new NetlifyEnvStore();
  }
  return storeInstance;
}