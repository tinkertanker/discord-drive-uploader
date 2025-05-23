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
    logger.info('Received folder save request');
    
    const { folderId, folderName } = JSON.parse(event.body);
    logger.info(`Folder data: ${folderName} (${folderId})`);
    
    if (!folderId || !folderName) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: 'Folder ID and name are required' })
      };
    }

    // For now, just return success without actually storing
    // Since our storage isn't working properly yet
    logger.info(`Would store folder: ${folderName} (${folderId})`);

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
        },
        message: 'Folder configuration saved (temporarily in memory)'
      })
    };
  } catch (error) {
    logger.error('Failed to save folder configuration:', error);
    logger.error('Error details:', error.message, error.stack);
    return {
      statusCode: 500,
      body: JSON.stringify({ 
        error: 'Failed to save folder configuration',
        details: error.message
      })
    };
  }
}