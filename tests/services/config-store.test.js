import { jest } from '@jest/globals';

// Mock @netlify/blobs
const mockStore = {
  get: jest.fn(),
  set: jest.fn(),
  setJSON: jest.fn(),
  list: jest.fn()
};

jest.unstable_mockModule('@netlify/blobs', () => ({
  getStore: jest.fn(() => mockStore)
}));

const { ConfigStore } = await import('../../src/services/config-store.js');

describe('ConfigStore', () => {
  let configStore;

  beforeEach(() => {
    configStore = new ConfigStore();
    jest.clearAllMocks();
  });

  describe('initialize', () => {
    test('initializes store successfully', async () => {
      await configStore.initialize();
      expect(configStore.store).toBe(mockStore);
    });
  });

  describe('Google Tokens', () => {
    beforeEach(async () => {
      await configStore.initialize();
    });

    test('gets Google tokens successfully', async () => {
      const tokens = {
        access_token: 'test_token',
        refresh_token: 'refresh_token',
        expiry_date: new Date(Date.now() + 3600000).toISOString()
      };
      mockStore.get.mockResolvedValueOnce(tokens);

      const result = await configStore.getGoogleTokens();
      expect(mockStore.get).toHaveBeenCalledWith('google_tokens', { type: 'json' });
      expect(result).toEqual(tokens);
    });

    test('identifies expired tokens', async () => {
      const tokens = {
        access_token: 'test_token',
        refresh_token: 'refresh_token',
        expiry_date: new Date(Date.now() - 1000).toISOString() // Expired
      };
      mockStore.get.mockResolvedValueOnce(tokens);

      const result = await configStore.getGoogleTokens();
      expect(result.expired).toBe(true);
    });

    test('sets Google tokens with timestamp', async () => {
      const tokens = { access_token: 'new_token' };
      
      await configStore.setGoogleTokens(tokens);
      
      expect(mockStore.setJSON).toHaveBeenCalledWith('google_tokens', {
        ...tokens,
        obtained_at: expect.any(Number)
      });
    });
  });

  describe('Guild Configuration', () => {
    beforeEach(async () => {
      await configStore.initialize();
    });

    test('gets guild config with defaults', async () => {
      mockStore.get.mockResolvedValueOnce(null);

      const config = await configStore.getGuildConfig('guild123');
      expect(config).toEqual({ channels: {}, defaultFolderId: null });
    });

    test('sets channel folder configuration', async () => {
      mockStore.get.mockResolvedValueOnce({ channels: {} });

      await configStore.setChannelFolder('guild123', 'channel456', 'folder789', 'My Folder');

      expect(mockStore.setJSON).toHaveBeenCalledWith('guild_guild123', {
        channels: {
          channel456: {
            driveFolderId: 'folder789',
            folderName: 'My Folder',
            configuredAt: expect.any(Number)
          }
        }
      });
    });

    test('gets channel folder configuration', async () => {
      const guildConfig = {
        channels: {
          channel456: {
            driveFolderId: 'folder789',
            folderName: 'My Folder'
          }
        }
      };
      mockStore.get.mockResolvedValueOnce(guildConfig);

      const result = await configStore.getChannelFolder('guild123', 'channel456');
      expect(result).toEqual(guildConfig.channels.channel456);
    });
  });

  describe('Discord Bot Token', () => {
    beforeEach(async () => {
      await configStore.initialize();
    });

    test('gets Discord bot token', async () => {
      mockStore.get.mockResolvedValueOnce('bot_token_123');

      const token = await configStore.getDiscordBotToken();
      expect(mockStore.get).toHaveBeenCalledWith('discord_bot_token');
      expect(token).toBe('bot_token_123');
    });

    test('sets Discord bot token', async () => {
      await configStore.setDiscordBotToken('new_bot_token');
      expect(mockStore.set).toHaveBeenCalledWith('discord_bot_token', 'new_bot_token');
    });
  });

  describe('getAllGuildIds', () => {
    beforeEach(async () => {
      await configStore.initialize();
    });

    test('returns list of guild IDs', async () => {
      mockStore.list.mockResolvedValueOnce([
        'guild_123',
        'guild_456',
        'google_tokens',
        'discord_bot_token'
      ]);

      const guildIds = await configStore.getAllGuildIds();
      expect(guildIds).toEqual(['123', '456']);
    });
  });
});