import { google } from 'googleapis';
import { createLogger } from '../utils/logger.js';

const logger = createLogger('GoogleAuth');

export class GoogleAuthService {
  constructor() {
    this.oauth2Client = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET,
      process.env.GOOGLE_REDIRECT_URI || 'https://localhost:8888/auth/google/callback'
    );
  }

  generateAuthUrl(state) {
    const scopes = [
      'https://www.googleapis.com/auth/drive.file',
      'https://www.googleapis.com/auth/drive.metadata.readonly'
    ];

    return this.oauth2Client.generateAuthUrl({
      access_type: 'offline',
      scope: scopes,
      state: state,
      prompt: 'consent'
    });
  }

  async getTokensFromCode(code) {
    try {
      const { tokens } = await this.oauth2Client.getToken(code);
      logger.info('Successfully obtained tokens');
      return tokens;
    } catch (error) {
      logger.error('Failed to get tokens from code:', error);
      throw new Error('Failed to authenticate with Google');
    }
  }

  setCredentials(tokens) {
    this.oauth2Client.setCredentials(tokens);
  }

  async refreshAccessToken(refreshToken) {
    try {
      this.oauth2Client.setCredentials({ refresh_token: refreshToken });
      const { credentials } = await this.oauth2Client.refreshAccessToken();
      logger.info('Successfully refreshed access token');
      return credentials;
    } catch (error) {
      logger.error('Failed to refresh access token:', error);
      throw new Error('Failed to refresh Google access token');
    }
  }

  getAuthClient() {
    return this.oauth2Client;
  }
}