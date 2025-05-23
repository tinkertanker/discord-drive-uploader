import { Client, GatewayIntentBits, REST, Routes, AttachmentBuilder } from 'discord.js';
import { ConfigStore } from '../services/config-store.js';
import { GoogleAuthService } from '../services/google-auth.js';
import { GoogleDriveService } from '../services/google-drive.js';
import { generateFileName, handleDuplicateFilename } from '../utils/file-namer.js';
import { getUploadQueue } from '../services/upload-queue.js';
import { createLogger } from '../utils/logger.js';
import fetch from 'node-fetch';

const logger = createLogger('MessageHandler');

const SUPPORTED_IMAGE_TYPES = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp'];
const SUPPORTED_VIDEO_TYPES = ['video/mp4', 'video/webm', 'video/mov', 'video/avi'];
const SUPPORTED_TYPES = [...SUPPORTED_IMAGE_TYPES, ...SUPPORTED_VIDEO_TYPES];

export class DiscordBot {
  constructor() {
    this.client = null;
    this.configStore = new ConfigStore();
    this.uploadQueue = getUploadQueue();
  }

  async initialize() {
    await this.configStore.initialize();
    
    const token = await this.configStore.getDiscordBotToken();
    if (!token) {
      throw new Error('Discord bot token not configured');
    }

    this.client = new Client({
      intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent
      ]
    });

    this.setupEventHandlers();
    
    await this.client.login(token);
    logger.info('Discord bot logged in successfully');
  }

  setupEventHandlers() {
    this.client.on('ready', () => {
      logger.info(`Bot ready! Logged in as ${this.client.user.tag}`);
    });

    this.client.on('messageCreate', async (message) => {
      // Ignore bot messages
      if (message.author.bot) return;

      // Check if message has attachments
      if (message.attachments.size === 0) return;

      await this.handleMessageWithAttachments(message);
    });

    this.client.on('error', (error) => {
      logger.error('Discord client error:', error);
    });
  }

  async handleMessageWithAttachments(message) {
    const { guild, channel } = message;
    
    // Get channel configuration
    const channelConfig = await this.configStore.getChannelFolder(guild.id, channel.id);
    if (!channelConfig) {
      logger.debug(`No upload configuration for channel ${channel.id}`);
      return;
    }

    // Filter supported attachments
    const supportedAttachments = Array.from(message.attachments.values())
      .filter(attachment => SUPPORTED_TYPES.includes(attachment.contentType));

    if (supportedAttachments.length === 0) {
      logger.debug('No supported attachments in message');
      return;
    }

    logger.info(`Processing ${supportedAttachments.length} attachments from channel ${channel.name}`);

    // Add upload tasks to queue
    const uploadTasks = supportedAttachments.map(attachment => 
      this.createUploadTask(attachment, message, channelConfig)
    );

    for (const task of uploadTasks) {
      await this.uploadQueue.add(task);
    }

    // Send initial response
    const emoji = supportedAttachments.length === 1 ? '📤' : '📤📤';
    const uploadingMessage = await message.reply(`${emoji} Uploading ${supportedAttachments.length} file(s)...`);

    // Wait for uploads to complete
    const results = await Promise.allSettled(
      uploadTasks.map(task => task())
    );

    const successful = results.filter(r => r.status === 'fulfilled').length;
    const failed = results.filter(r => r.status === 'rejected').length;

    // Update response
    let responseText = '';
    if (successful === supportedAttachments.length) {
      responseText = `✅ Uploaded ${successful === 1 ? '' : `${successful} images`}`;
    } else if (failed === supportedAttachments.length) {
      responseText = '❌ Upload failed';
    } else {
      responseText = `✅ Uploaded ${successful}/${supportedAttachments.length} files`;
    }

    await uploadingMessage.edit(responseText);

    // Update bot avatar if last upload was an image
    const lastSuccessful = results
      .map((result, index) => ({ result, attachment: supportedAttachments[index] }))
      .filter(({ result }) => result.status === 'fulfilled')
      .pop();

    if (lastSuccessful && SUPPORTED_IMAGE_TYPES.includes(lastSuccessful.attachment.contentType)) {
      await this.updateBotAvatar(lastSuccessful.attachment.url);
    }
  }

  createUploadTask(attachment, message, channelConfig) {
    return async () => {
      try {
        // Download file
        const response = await fetch(attachment.url);
        if (!response.ok) {
          throw new Error(`Failed to download attachment: ${response.statusText}`);
        }

        const buffer = Buffer.from(await response.arrayBuffer());

        // Get Google Drive service
        const googleTokens = await this.configStore.getGoogleTokens();
        if (!googleTokens) {
          throw new Error('Google Drive not configured');
        }

        const authService = new GoogleAuthService();
        authService.setCredentials(googleTokens);
        const driveService = new GoogleDriveService(authService.getAuthClient());

        // Get existing files in folder for duplicate handling
        const existingFiles = await driveService.getFilesByFolder(channelConfig.driveFolderId);
        const existingFilenames = existingFiles.map(f => f.name);

        // Generate filename
        const baseFilename = generateFileName(
          attachment.name,
          message.content,
          message.createdAt
        );
        const finalFilename = handleDuplicateFilename(baseFilename, existingFilenames);

        // Upload to Drive
        const uploadResult = buffer.length > 10 * 1024 * 1024 // 10MB
          ? await driveService.uploadLargeFile(buffer, finalFilename, channelConfig.driveFolderId, attachment.contentType)
          : await driveService.uploadFile(buffer, finalFilename, channelConfig.driveFolderId, attachment.contentType);

        logger.info(`Successfully uploaded ${finalFilename} to Google Drive`);
        return uploadResult;
      } catch (error) {
        logger.error(`Failed to upload ${attachment.name}:`, error);
        throw error;
      }
    };
  }

  async updateBotAvatar(imageUrl) {
    try {
      const response = await fetch(imageUrl);
      if (!response.ok) {
        throw new Error(`Failed to fetch image: ${response.statusText}`);
      }

      const buffer = Buffer.from(await response.arrayBuffer());
      await this.client.user.setAvatar(buffer);
      logger.info('Updated bot avatar to latest uploaded image');
    } catch (error) {
      logger.error('Failed to update bot avatar:', error);
    }
  }

  async registerSlashCommands() {
    const commands = [
      {
        name: 'setup-folder',
        description: 'Configure the Google Drive folder for this channel',
        options: [
          {
            name: 'folder',
            type: 3, // STRING
            description: 'The name of the Google Drive folder',
            required: true
          }
        ]
      },
      {
        name: 'upload-info',
        description: 'Show current upload configuration for this channel'
      },
      {
        name: 'test-upload',
        description: 'Test the upload functionality'
      }
    ];

    const rest = new REST({ version: '10' }).setToken(
      await this.configStore.getDiscordBotToken()
    );

    try {
      logger.info('Registering slash commands...');
      await rest.put(
        Routes.applicationCommands(process.env.DISCORD_APPLICATION_ID),
        { body: commands }
      );
      logger.info('Successfully registered slash commands');
    } catch (error) {
      logger.error('Failed to register slash commands:', error);
    }
  }
}