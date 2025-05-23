import { GoogleAuthService } from '../../src/services/google-auth.js';
import { createLogger } from '../../src/utils/logger.js';

const logger = createLogger('GoogleAuthStart');

export async function handler(event) {
  if (event.httpMethod !== 'GET') {
    return {
      statusCode: 405,
      body: JSON.stringify({ error: 'Method not allowed' })
    };
  }

  try {
    const authService = new GoogleAuthService();
    
    // Generate a random state for CSRF protection
    const state = Math.random().toString(36).substring(2, 15);
    
    // Store state in a cookie for validation later
    const authUrl = authService.generateAuthUrl(state);
    
    logger.info('Generated auth URL for user');
    
    return {
      statusCode: 302,
      headers: {
        Location: authUrl,
        'Set-Cookie': `auth_state=${state}; HttpOnly; Secure; SameSite=Lax; Max-Age=600; Path=/`
      }
    };
  } catch (error) {
    logger.error('Failed to start auth flow:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'Failed to start authentication' })
    };
  }
}