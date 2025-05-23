import { GoogleAuthService } from '../../src/services/google-auth.js';
import { getStore } from '@netlify/blobs';
import { createLogger } from '../../src/utils/logger.js';

const logger = createLogger('GoogleAuthCallback');

export async function handler(event, context) {
  if (event.httpMethod !== 'GET') {
    return {
      statusCode: 405,
      body: JSON.stringify({ error: 'Method not allowed' })
    };
  }

  const { code, state } = event.queryStringParameters || {};
  
  if (!code) {
    return {
      statusCode: 400,
      body: JSON.stringify({ error: 'Missing authorization code' })
    };
  }

  try {
    // Verify state from cookie
    const cookies = parseCookies(event.headers.cookie || '');
    const storedState = cookies.auth_state;
    
    if (!state || state !== storedState) {
      logger.warn('State mismatch in OAuth callback');
      return {
        statusCode: 400,
        body: JSON.stringify({ error: 'Invalid state parameter' })
      };
    }

    const authService = new GoogleAuthService();
    const tokens = await authService.getTokensFromCode(code);
    
    // Store tokens in Netlify Blobs
    const store = getStore('config');
    await store.setJSON('google_tokens', {
      ...tokens,
      obtained_at: Date.now()
    });
    
    logger.info('Successfully stored Google tokens');
    
    return {
      statusCode: 302,
      headers: {
        Location: '/setup.html?step=folder-selection',
        'Set-Cookie': 'auth_state=; HttpOnly; Secure; SameSite=Lax; Max-Age=0; Path=/'
      }
    };
  } catch (error) {
    logger.error('Failed to complete auth flow:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'Failed to complete authentication' })
    };
  }
}

function parseCookies(cookieString) {
  return cookieString
    .split(';')
    .map(cookie => cookie.trim())
    .reduce((acc, cookie) => {
      const [key, value] = cookie.split('=');
      if (key && value) {
        acc[key] = value;
      }
      return acc;
    }, {});
}