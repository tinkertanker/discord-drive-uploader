import { ConfigStore } from '../../src/services/config-store.js';
import { createLogger } from '../../src/utils/logger.js';

const logger = createLogger('APISetupComplete');

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
    
    // Get all stored data
    const googleTokens = await configStore.getGoogleTokens();
    const discordToken = await configStore.getDiscordBotToken();
    const defaultFolder = await configStore.store.get('default_folder');
    
    // Generate environment variable instructions
    const envVars = [];
    
    if (googleTokens) {
      envVars.push({
        key: 'APP_DATA_GOOGLE_TOKENS',
        value: JSON.stringify(googleTokens),
        description: 'Google OAuth tokens'
      });
    }
    
    if (discordToken) {
      envVars.push({
        key: 'APP_DATA_DISCORD_BOT_TOKEN',
        value: JSON.stringify(discordToken),
        description: 'Discord bot token'
      });
    }
    
    if (defaultFolder) {
      envVars.push({
        key: 'APP_DATA_DEFAULT_FOLDER',
        value: JSON.stringify(defaultFolder),
        description: 'Default Google Drive folder'
      });
    }
    
    logger.info('Setup complete, generated env vars configuration');

    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        success: true,
        message: 'Setup complete! To persist configuration, set these environment variables in Netlify:',
        envVars,
        botInviteUrl: `https://discord.com/api/oauth2/authorize?client_id=${process.env.DISCORD_APPLICATION_ID}&permissions=3072&scope=bot%20applications.commands`
      })
    };
  } catch (error) {
    logger.error('Failed to complete setup:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'Failed to complete setup' })
    };
  }
}