import { createLogger } from '../utils/logger.js';

const logger = createLogger('SimpleStore');

// Simple in-memory store with environment variable fallback
// This is a temporary solution until we figure out Netlify Blobs
class SimpleStore {
  constructor() {
    this.data = new Map();
    this.initialized = false;
  }

  async initialize() {
    if (this.initialized) return;
    
    // Load from environment variables if available
    const storedData = process.env.STORE_DATA;
    if (storedData) {
      try {
        const parsed = JSON.parse(storedData);
        Object.entries(parsed).forEach(([key, value]) => {
          this.data.set(key, value);
        });
        logger.info('Loaded data from environment');
      } catch (error) {
        logger.error('Failed to parse stored data:', error);
      }
    }
    
    this.initialized = true;
  }

  async get(key, options = {}) {
    await this.initialize();
    const value = this.data.get(key);
    
    if (options.type === 'json' && value) {
      try {
        return JSON.parse(value);
      } catch {
        return value;
      }
    }
    
    return value;
  }

  async set(key, value) {
    await this.initialize();
    this.data.set(key, value);
    logger.info(`Stored value for key: ${key}`);
  }

  async setJSON(key, value) {
    await this.set(key, JSON.stringify(value));
  }

  // Simulate Netlify Blobs API
  async list() {
    await this.initialize();
    return Array.from(this.data.keys());
  }
}

// Singleton instance
let storeInstance = null;

export function getStore(name) {
  if (!storeInstance) {
    storeInstance = new SimpleStore();
  }
  return storeInstance;
}