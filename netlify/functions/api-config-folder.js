import { ConfigStore } from '../../src/services/config-store.js';
import { createLogger } from '../../src/utils/logger.js';

const logger = createLogger('APIConfigFolder');

export async function handler(event) {
  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      body: JSON.stringify({ error: 'Method not allowed' })
    };
  }

  try {
    const { folderId, folderName } = JSON.parse(event.body);
    
    if (!folderId || !folderName) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: 'Folder ID and name are required' })
      };
    }

    const configStore = new ConfigStore();
    await configStore.initialize();
    
    // For now, store as default folder
    // In a real app, you'd store per guild/channel
    await configStore.set('default_folder', {
      id: folderId,
      name: folderName,
      configuredAt: Date.now()
    });
    
    logger.info(`Default folder set to: ${folderName} (${folderId})`);

    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ 
        success: true,
        folder: {
          id: folderId,
          name: folderName
        }
      })
    };
  } catch (error) {
    logger.error('Failed to save folder configuration:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'Failed to save folder configuration' })
    };
  }
}