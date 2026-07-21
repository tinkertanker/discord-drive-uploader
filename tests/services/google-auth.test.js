import { jest } from '@jest/globals';

// Mock googleapis before importing the service
const mockOAuth2Client = {
  generateAuthUrl: jest.fn().mockReturnValue('https://accounts.google.com/oauth2/auth?...'),
  getToken: jest.fn().mockResolvedValue({ tokens: { access_token: 'test_token' } }),
  setCredentials: jest.fn(),
  refreshAccessToken: jest.fn().mockResolvedValue({ 
    credentials: { access_token: 'refreshed_token' } 
  })
};

jest.unstable_mockModule('googleapis', () => ({
  google: {
    auth: {
      OAuth2: jest.fn().mockImplementation(() => mockOAuth2Client)
    }
  }
}));

const { GoogleAuthService, refreshStoredGoogleTokens } = await import('../../src/services/google-auth.js');

describe('GoogleAuthService', () => {
  let authService;

  beforeEach(() => {
    process.env.GOOGLE_CLIENT_ID = 'test_client_id';
    process.env.GOOGLE_CLIENT_SECRET = 'test_client_secret';
    process.env.GOOGLE_REDIRECT_URI = 'http://localhost/callback';
    
    authService = new GoogleAuthService();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('generateAuthUrl', () => {
    test('generates auth URL with correct parameters', () => {
      const state = 'test_state';
      const url = authService.generateAuthUrl(state);
      
      expect(mockOAuth2Client.generateAuthUrl).toHaveBeenCalledWith({
        access_type: 'offline',
        scope: [
          'https://www.googleapis.com/auth/drive.file',
          'https://www.googleapis.com/auth/drive.metadata.readonly',
          'https://www.googleapis.com/auth/userinfo.email'
        ],
        state: state,
        prompt: 'consent'
      });
      
      expect(url).toContain('https://accounts.google.com');
    });
  });

  describe('getTokensFromCode', () => {
    test('successfully gets tokens from code', async () => {
      const code = 'test_auth_code';
      const tokens = await authService.getTokensFromCode(code);
      
      expect(mockOAuth2Client.getToken).toHaveBeenCalledWith(code);
      expect(tokens).toEqual({ access_token: 'test_token' });
    });

    test('throws error when getting tokens fails', async () => {
      mockOAuth2Client.getToken.mockRejectedValueOnce(new Error('Invalid code'));
      
      await expect(authService.getTokensFromCode('bad_code'))
        .rejects.toThrow('Failed to authenticate with Google');
    });
  });

  describe('refreshAccessToken', () => {
    test('successfully refreshes access token', async () => {
      const refreshToken = 'test_refresh_token';
      const newCredentials = await authService.refreshAccessToken(refreshToken);
      
      expect(mockOAuth2Client.setCredentials).toHaveBeenCalledWith({
        refresh_token: refreshToken
      });
      expect(newCredentials).toEqual({ access_token: 'refreshed_token' });
    });

    test('throws error when refresh fails', async () => {
      mockOAuth2Client.refreshAccessToken.mockRejectedValueOnce(
        new Error('Invalid refresh token')
      );
      
      await expect(authService.refreshAccessToken('bad_token'))
        .rejects.toThrow('Failed to refresh Google access token');
    });
  });

  describe('refreshStoredGoogleTokens', () => {
    test('coalesces concurrent refreshes and stores the result once', async () => {
      let resolveRefresh;
      mockOAuth2Client.refreshAccessToken.mockReturnValueOnce(new Promise((resolve) => {
        resolveRefresh = resolve;
      }));
      const expiredTokens = {
        access_token: 'expired-token',
        refresh_token: 'shared-refresh-token',
        expired: true
      };
      const configStore = {
        setGoogleTokensIfRefreshTokenMatches: jest.fn().mockResolvedValue({
          updated: true,
          value: { ...expiredTokens, access_token: 'fresh-token' }
        })
      };

      const firstRefresh = refreshStoredGoogleTokens(configStore, expiredTokens);
      const secondRefresh = refreshStoredGoogleTokens(configStore, expiredTokens);
      expect(mockOAuth2Client.refreshAccessToken).toHaveBeenCalledTimes(1);

      resolveRefresh({ credentials: { access_token: 'fresh-token' } });
      const [firstTokens, secondTokens] = await Promise.all([firstRefresh, secondRefresh]);

      expect(configStore.setGoogleTokensIfRefreshTokenMatches).toHaveBeenCalledTimes(1);
      expect(firstTokens).toEqual({
        access_token: 'fresh-token',
        refresh_token: 'shared-refresh-token',
        expired: false
      });
      expect(secondTokens).toEqual(firstTokens);
    });

    test('allows a new refresh attempt after a shared refresh fails', async () => {
      const expiredTokens = {
        refresh_token: 'retry-refresh-token',
        expired: true
      };
      const configStore = {
        setGoogleTokensIfRefreshTokenMatches: jest.fn().mockResolvedValue({
          updated: true,
          value: { ...expiredTokens, access_token: 'recovered-token' }
        })
      };
      mockOAuth2Client.refreshAccessToken
        .mockRejectedValueOnce(new Error('Temporary failure'))
        .mockResolvedValueOnce({ credentials: { access_token: 'recovered-token' } });

      await expect(refreshStoredGoogleTokens(configStore, expiredTokens))
        .rejects.toThrow('Failed to refresh Google access token');
      await expect(refreshStoredGoogleTokens(configStore, expiredTokens))
        .resolves.toEqual({
          refresh_token: 'retry-refresh-token',
          access_token: 'recovered-token',
          expired: false
        });

      expect(mockOAuth2Client.refreshAccessToken).toHaveBeenCalledTimes(2);
      expect(configStore.setGoogleTokensIfRefreshTokenMatches).toHaveBeenCalledTimes(1);
    });

    test('does not overwrite credentials replaced during an in-flight refresh', async () => {
      let resolveRefresh;
      mockOAuth2Client.refreshAccessToken.mockReturnValueOnce(new Promise((resolve) => {
        resolveRefresh = resolve;
      }));
      const oldTokens = {
        access_token: 'old-access-token',
        refresh_token: 'old-refresh-token',
        expired: true
      };
      const reconnectedTokens = {
        access_token: 'new-access-token',
        refresh_token: 'new-refresh-token',
        expired: false
      };
      const configStore = {
        setGoogleTokensIfRefreshTokenMatches: jest.fn().mockResolvedValue({
          updated: false,
          value: reconnectedTokens
        })
      };

      const refreshPromise = refreshStoredGoogleTokens(configStore, oldTokens);
      resolveRefresh({ credentials: { access_token: 'stale-refreshed-token' } });

      await expect(refreshPromise).resolves.toBe(reconnectedTokens);
      expect(configStore.setGoogleTokensIfRefreshTokenMatches).toHaveBeenCalledWith(
        { access_token: 'stale-refreshed-token' },
        'old-refresh-token'
      );
    });
  });
});
