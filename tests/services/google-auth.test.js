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

const { GoogleAuthService } = await import('../../src/services/google-auth.js');

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
          'https://www.googleapis.com/auth/drive.metadata.readonly'
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
});