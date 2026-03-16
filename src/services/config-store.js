import { getStore } from './file-store.js';
import { createLogger } from '../utils/logger.js';

const logger = createLogger('ConfigStore');

export class ConfigStore {
  constructor() {
    this.store = null;
  }

  async initialize() {
    try {
      this.store = getStore('config');
      logger.info('Config store initialized');
    } catch (error) {
      logger.error('Failed to initialize config store:', error);
      throw new Error('Failed to initialize configuration storage');
    }
  }

  async getGoogleTokens() {
    try {
      const tokens = await this.store.get('google_tokens', { type: 'json' });
      if (tokens && this.isTokenExpired(tokens)) {
        logger.info('Google tokens expired, need refresh');
        return { ...tokens, expired: true };
      }
      return tokens;
    } catch (error) {
      logger.error('Failed to get Google tokens:', error);
      return null;
    }
  }

  async setGoogleTokens(tokens) {
    try {
      const existing = await this.store.get('google_tokens');

      const merged = {
        ...(existing || {}),
        ...tokens,
        obtained_at: Date.now()
      };

      if (existing?.refresh_token && !merged.refresh_token) {
        merged.refresh_token = existing.refresh_token;
      }

      await this.store.setJSON('google_tokens', {
        ...merged
      });
      logger.info('Google tokens updated');
    } catch (error) {
      logger.error('Failed to set Google tokens:', error);
      throw new Error('Failed to store Google tokens');
    }
  }

  async getGuildConfig(guildId) {
    try {
      const config = await this.store.get(`guild_${guildId}`, { type: 'json' });
      return config || { channels: {}, defaultFolderId: null };
    } catch (error) {
      logger.error(`Failed to get config for guild ${guildId}:`, error);
      return { channels: {}, defaultFolderId: null };
    }
  }

  async setGuildConfig(guildId, config) {
    try {
      await this.store.setJSON(`guild_${guildId}`, config);
      logger.info(`Updated config for guild ${guildId}`);
    } catch (error) {
      logger.error(`Failed to set config for guild ${guildId}:`, error);
      throw new Error('Failed to store guild configuration');
    }
  }

  async setChannelFolder(guildId, channelId, folderId, folderName, enabled = true) {
    const useDefault = folderId == null;
    const normalizedFolderId = typeof folderId === 'string' ? folderId.trim() : folderId;
    const normalizedFolderName = typeof folderName === 'string' ? folderName.trim() : folderName;

    if (!useDefault) {
      if (typeof normalizedFolderId !== 'string' || !normalizedFolderId) {
        throw new Error('Channel folder ID must be a non-empty string');
      }

      if (typeof normalizedFolderName !== 'string' || !normalizedFolderName) {
        throw new Error('Channel folder name is required when specifying a folder');
      }
    }

    try {
      const guildConfig = await this.getGuildConfig(guildId);

      if (!guildConfig.channels) {
        guildConfig.channels = {};
      }

      guildConfig.channels[channelId] = {
        ...(useDefault ? { useDefault: true } : { driveFolderId: normalizedFolderId, folderName: normalizedFolderName }),
        configuredAt: Date.now(),
        enabled
      };

      await this.setGuildConfig(guildId, guildConfig);
      logger.info(`Set folder ${useDefault ? '(default)' : normalizedFolderName} for channel ${channelId} in guild ${guildId}`);
    } catch (error) {
      logger.error('Failed to set channel folder:', error);
      throw new Error('Failed to configure channel folder');
    }
  }

  async getChannelFolder(guildId, channelId) {
    try {
      const guildConfig = await this.getGuildConfig(guildId);
      if (guildConfig.channels?.[channelId]) {
        const channelConfig = guildConfig.channels[channelId];
        if (channelConfig?.enabled === false) {
          return null;
        }
        // useDefault channels are resolved by getUploadFolder, not here
        if (channelConfig?.useDefault) {
          return null;
        }
        return channelConfig;
      }
      return null;
    } catch (error) {
      logger.error('Failed to get channel folder:', error);
      return null;
    }
  }

  async getUploadFolder(guildId, channelId) {
    try {
      const channelConfig = await this.getChannelFolder(guildId, channelId);
      if (channelConfig) {
        return {
          ...channelConfig,
          source: 'channel'
        };
      }

      const guildConfig = await this.getGuildConfig(guildId);
      const entry = guildConfig.channels?.[channelId];

      // No config at all, or explicitly disabled — don't upload
      if (!entry || entry.enabled === false) {
        return null;
      }

      // Only fall back to the default folder for channels explicitly linked to it
      if (!entry.useDefault) {
        return null;
      }

      const defaultFolder = await this.getDefaultFolder();
      if (!defaultFolder?.id || !defaultFolder?.name) {
        return null;
      }

      return {
        driveFolderId: defaultFolder.id,
        folderName: defaultFolder.name,
        configuredAt: defaultFolder.configuredAt || null,
        enabled: true,
        source: 'default'
      };
    } catch (error) {
      logger.error('Failed to resolve upload folder:', error);
      return null;
    }
  }

  async setChannelSyncEnabled(guildId, channelId, enabled) {
    try {
      const guildConfig = await this.getGuildConfig(guildId);
      if (!guildConfig.channels?.[channelId]) {
        throw new Error('Channel is not configured');
      }

      guildConfig.channels[channelId] = {
        ...guildConfig.channels[channelId],
        enabled,
        configuredAt: Date.now()
      };

      await this.setGuildConfig(guildId, guildConfig);
      logger.info(`Set sync ${enabled ? 'enabled' : 'disabled'} for channel ${channelId} in guild ${guildId}`);
    } catch (error) {
      logger.error('Failed to update channel sync state:', error);
      throw new Error('Failed to update channel sync state');
    }
  }

  async removeChannelFolder(guildId, channelId) {
    try {
      const guildConfig = await this.getGuildConfig(guildId);
      if (!guildConfig.channels?.[channelId]) {
        return;
      }

      delete guildConfig.channels[channelId];
      if (!Object.keys(guildConfig.channels).length) {
        guildConfig.channels = {};
      }

      await this.setGuildConfig(guildId, guildConfig);
      logger.info(`Removed channel ${channelId} configuration from guild ${guildId}`);
    } catch (error) {
      logger.error('Failed to remove channel folder config:', error);
      throw new Error('Failed to remove channel configuration');
    }
  }

  async getAllChannelConfigs() {
    try {
      const guildIds = await this.getAllGuildIds();
      const mappings = [];

      for (const guildId of guildIds) {
        const guildConfig = await this.getGuildConfig(guildId);
        const channels = guildConfig.channels || {};

        Object.entries(channels).forEach(([channelId, config]) => {
          mappings.push({
            guildId,
            channelId,
            folderId: config.driveFolderId || null,
            folderName: config.folderName || null,
            useDefault: config.useDefault === true,
            enabled: config.enabled !== false,
            configuredAt: config.configuredAt || null
          });
        });
      }

      return mappings;
    } catch (error) {
      logger.error('Failed to list channel configs:', error);
      return [];
    }
  }

  async setDefaultFolder(folderId, folderName) {
    try {
      const defaultFolder = {
        id: folderId,
        name: folderName,
        configuredAt: Date.now()
      };
      await this.store.setJSON('default_folder', defaultFolder);
      logger.info(`Updated default folder to ${folderName} (${folderId})`);
    } catch (error) {
      logger.error('Failed to set default folder:', error);
      throw new Error('Failed to store default folder');
    }
  }

  async getDefaultFolder() {
    try {
      const defaultFolder = await this.store.get('default_folder');
      if (typeof defaultFolder === 'string') {
        try {
          return JSON.parse(defaultFolder);
        } catch {
          return null;
        }
      }
      return defaultFolder;
    } catch (error) {
      logger.error('Failed to get default folder:', error);
      return null;
    }
  }

  async getDiscordBotToken() {
    try {
      return await this.store.get('discord_bot_token');
    } catch (error) {
      logger.error('Failed to get Discord bot token:', error);
      return null;
    }
  }

  async setDiscordBotToken(token) {
    try {
      await this.store.set('discord_bot_token', token);
      logger.info('Discord bot token updated');
    } catch (error) {
      logger.error('Failed to set Discord bot token:', error);
      throw new Error('Failed to store Discord bot token');
    }
  }

  isTokenExpired(tokens) {
    if (!tokens.expiry_date) return false;
    
    const now = Date.now();
    const expiryTime = new Date(tokens.expiry_date).getTime();
    
    // Consider token expired if it expires in less than 5 minutes
    return expiryTime - now < 5 * 60 * 1000;
  }

  async getAllGuildIds() {
    try {
      const list = await this.store.list();
      return list
        .filter(key => key.startsWith('guild_'))
        .map(key => key.replace('guild_', ''));
    } catch (error) {
      logger.error('Failed to list guild IDs:', error);
      return [];
    }
  }
}
