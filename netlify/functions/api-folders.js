import { ConfigStore } from '../../src/services/config-store.js';
import { GoogleAuthService } from '../../src/services/google-auth.js';
import { GoogleDriveService } from '../../src/services/google-drive.js';
import { createLogger } from '../../src/utils/logger.js';

const logger = createLogger('APIFolders');

export async function handler(event) {
  if (event.httpMethod !== 'GET') {
    return {
      statusCode: 405,
      body: JSON.stringify({ error: 'Method not allowed' })
    };
  }

  try {
    const configStore = new ConfigStore();
    await configStore.initialize();

    // Get Google tokens
    const tokens = await configStore.getGoogleTokens();
    if (!tokens) {
      return {
        statusCode: 401,
        body: JSON.stringify({ error: 'Not authenticated with Google' })
      };
    }

    // Check if tokens are expired and refresh if needed
    if (tokens.expired || !tokens.access_token) {
      const authService = new GoogleAuthService();
      const newTokens = await authService.refreshAccessToken(tokens.refresh_token);
      await configStore.setGoogleTokens(newTokens);
      tokens.access_token = newTokens.access_token;
    }

    // Initialize Google services
    const authService = new GoogleAuthService();
    authService.setCredentials(tokens);
    const driveService = new GoogleDriveService(authService.getAuthClient());

    // List folders
    const folders = await driveService.listFolders();
    
    logger.info(`Retrieved ${folders.length} folders`);

    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(folders)
    };
  } catch (error) {
    logger.error('Failed to list folders:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'Failed to retrieve folders' })
    };
  }
}