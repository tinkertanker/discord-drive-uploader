import { InteractionResponseType } from 'discord.js';
import { ConfigStore } from '../services/config-store.js';
import { GoogleAuthService } from '../services/google-auth.js';
import { GoogleDriveService } from '../services/google-drive.js';
import { createLogger } from '../utils/logger.js';

const logger = createLogger('SlashCommands');

export async function handleSlashCommand(interaction) {
  const { data, guild_id, channel_id } = interaction;
  const commandName = data.name;

  try {
    switch (commandName) {
      case 'setup-folder':
        return await handleSetupFolder(interaction);
      
      case 'upload-info':
        return await handleUploadInfo(interaction);
      
      case 'test-upload':
        return await handleTestUpload(interaction);
      
      default:
        return {
          statusCode: 200,
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            type: InteractionResponseType.ChannelMessageWithSource,
            data: {
              content: 'Unknown command',
              flags: 64
            }
          })
        };
    }
  } catch (error) {
    logger.error(`Error handling command ${commandName}:`, error);
    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: InteractionResponseType.ChannelMessageWithSource,
        data: {
          content: `Error: ${error.message}`,
          flags: 64
        }
      })
    };
  }
}

async function handleSetupFolder(interaction) {
  const { guild_id, channel_id } = interaction;
  
  // Get folder name from options
  const folderOption = interaction.data.options?.find(opt => opt.name === 'folder');
  const folderName = folderOption?.value;

  if (!folderName) {
    return createResponse('Please provide a folder name: `/setup-folder folder: MyFolderName`');
  }

  const configStore = new ConfigStore();
  await configStore.initialize();

  // Get Google tokens
  const tokens = await configStore.getGoogleTokens();
  if (!tokens) {
    return createResponse('❌ Google Drive not connected. Please complete the setup first.');
  }

  // Initialize Google services
  const authService = new GoogleAuthService();
  authService.setCredentials(tokens);
  const driveService = new GoogleDriveService(authService.getAuthClient());

  // Search for the folder
  const folders = await driveService.listFolders();
  const matchingFolder = folders.find(f => 
    f.name.toLowerCase() === folderName.toLowerCase()
  );

  if (!matchingFolder) {
    return createResponse(`❌ Folder "${folderName}" not found. Available folders:\n${
      folders.slice(0, 10).map(f => `• ${f.name}`).join('\n')
    }`);
  }

  // Save the configuration
  await configStore.setChannelFolder(
    guild_id, 
    channel_id, 
    matchingFolder.id, 
    matchingFolder.name
  );

  return createResponse(
    `✅ Channel configured! Photos from this channel will be uploaded to **${matchingFolder.name}**`
  );
}

async function handleUploadInfo(interaction) {
  const { guild_id, channel_id } = interaction;
  
  const configStore = new ConfigStore();
  await configStore.initialize();

  const channelConfig = await configStore.getChannelFolder(guild_id, channel_id);
  
  if (!channelConfig) {
    return createResponse(
      '❌ No upload folder configured for this channel.\nUse `/setup-folder` to configure one.'
    );
  }

  const configuredDate = new Date(channelConfig.configuredAt).toLocaleDateString();
  
  return createResponse(
    `📁 **Upload Configuration**\n` +
    `Folder: **${channelConfig.folderName}**\n` +
    `Configured on: ${configuredDate}`
  );
}

async function handleTestUpload(interaction) {
  return createResponse(
    '🧪 Test upload functionality is not yet implemented.\n' +
    'Try uploading an actual image to test the bot!'
  );
}

function createResponse(content, ephemeral = true) {
  return {
    statusCode: 200,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      type: InteractionResponseType.ChannelMessageWithSource,
      data: {
        content,
        flags: ephemeral ? 64 : 0
      }
    })
  };
}