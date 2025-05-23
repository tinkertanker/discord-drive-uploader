import { DiscordBot } from '../../src/handlers/message-handler.js';
import { createLogger } from '../../src/utils/logger.js';

const logger = createLogger('BotInit');

let bot = null;

export async function handler(event, context) {
  // This function is called by Netlify on deployment to initialize the bot
  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      body: JSON.stringify({ error: 'Method not allowed' })
    };
  }

  try {
    if (bot) {
      logger.info('Bot already initialized');
      return {
        statusCode: 200,
        body: JSON.stringify({ message: 'Bot already running' })
      };
    }

    logger.info('Initializing Discord bot...');
    bot = new DiscordBot();
    
    // Initialize in background
    context.waitUntil(initializeBot());

    return {
      statusCode: 200,
      body: JSON.stringify({ message: 'Bot initialization started' })
    };
  } catch (error) {
    logger.error('Failed to initialize bot:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'Failed to initialize bot' })
    };
  }
}

async function initializeBot() {
  try {
    await bot.initialize();
    await bot.registerSlashCommands();
    logger.info('Bot fully initialized and ready');
  } catch (error) {
    logger.error('Bot initialization failed:', error);
    bot = null; // Reset so it can be retried
  }
}