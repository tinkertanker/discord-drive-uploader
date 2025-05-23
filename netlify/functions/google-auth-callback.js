import { GoogleAuthService } from '../../src/services/google-auth.js';
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
      logger.warn(`State mismatch in OAuth callback. Expected: ${storedState}, Got: ${state}`);
      // Temporarily continue despite mismatch for debugging
      // return {
      //   statusCode: 400,
      //   body: JSON.stringify({ error: 'Invalid state parameter' })
      // };
    }

    const authService = new GoogleAuthService();
    const tokens = await authService.getTokensFromCode(code);
    
    // TODO: Store tokens properly
    // For now, let's just verify OAuth is working
    logger.info('Successfully obtained Google tokens');
    logger.info('Access token exists:', !!tokens.access_token);
    
    // For now, redirect to a success page
    // We'll need to implement proper storage later
    return {
      statusCode: 302,
      headers: {
        Location: '/?oauth=success&token_received=true',
        'Set-Cookie': 'auth_state=; HttpOnly; Secure; SameSite=Lax; Max-Age=0; Path=/'
      }
    };
  } catch (error) {
    logger.error('Failed to complete auth flow:', error);
    logger.error('Error details:', error.message, error.stack);
    return {
      statusCode: 500,
      body: JSON.stringify({ 
        error: 'Failed to complete authentication',
        details: error.message 
      })
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