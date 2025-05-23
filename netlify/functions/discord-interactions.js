import { handleDiscordInteraction } from '../../src/handlers/discord-interactions.js';
import { createLogger } from '../../src/utils/logger.js';

const logger = createLogger('DiscordInteractionsFunction');

export async function handler(event) {
  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      body: JSON.stringify({ error: 'Method not allowed' })
    };
  }

  try {
    logger.info('Received Discord interaction');
    
    const request = {
      body: event.body,
      headers: event.headers
    };

    return await handleDiscordInteraction(request);
  } catch (error) {
    logger.error('Failed to handle Discord interaction:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'Internal server error' })
    };
  }
}