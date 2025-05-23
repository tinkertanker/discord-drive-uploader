import { ConfigStore } from '../../src/services/config-store.js';
import { createLogger } from '../../src/utils/logger.js';

const logger = createLogger('APIConfigDiscord');

export async function handler(event) {
  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      body: JSON.stringify({ error: 'Method not allowed' })
    };
  }

  try {
    const { token } = JSON.parse(event.body);
    
    if (!token) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: 'Discord bot token is required' })
      };
    }

    // Validate token format (basic check)
    if (!token.match(/^[A-Za-z0-9._-]+$/)) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: 'Invalid token format' })
      };
    }

    const configStore = new ConfigStore();
    await configStore.initialize();
    
    // Save the token
    await configStore.setDiscordBotToken(token);
    
    logger.info('Discord bot token saved successfully');

    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ success: true })
    };
  } catch (error) {
    logger.error('Failed to save Discord configuration:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'Failed to save Discord configuration' })
    };
  }
}