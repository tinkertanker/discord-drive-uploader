import { createLogger } from '../utils/logger.js';

const logger = createLogger('EnvStore');

// Use a single environment variable to store all data as JSON
// This is a workaround for the Netlify Blobs issue
class EnvStore {
  constructor() {
    this.cache = null;
  }

  async loadData() {
    if (this.cache) return this.cache;
    
    try {
      const data = process.env.APP_STORE_DATA;
      if (data) {
        this.cache = JSON.parse(Buffer.from(data, 'base64').toString());
        logger.info('Loaded data from environment');
      } else {
        this.cache = {};
      }
    } catch (error) {
      logger.error('Failed to load data:', error);
      this.cache = {};
    }
    
    return this.cache;
  }

  async get(key, options = {}) {
    const data = await this.loadData();
    const value = data[key];
    
    if (options.type === 'json' && value) {
      return value; // Already parsed
    }
    
    return value;
  }

  async set(key, value) {
    const data = await this.loadData();
    data[key] = value;
    
    // Note: In a real implementation, we'd update the environment variable
    // through Netlify's API. For now, we're just using in-memory cache
    logger.info(`Stored value for key: ${key} (in memory only)`);
    
    // Store in cache
    this.cache = data;
  }

  async setJSON(key, value) {
    await this.set(key, value); // Already an object
  }

  async list() {
    const data = await this.loadData();
    return Object.keys(data);
  }
}

// Singleton instance
let storeInstance = null;

export function getStore(name) {
  if (!storeInstance) {
    storeInstance = new EnvStore();
  }
  return storeInstance;
}