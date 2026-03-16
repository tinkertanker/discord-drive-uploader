import { Client, GatewayIntentBits, REST, Routes } from 'discord.js';
import { ConfigStore } from '../services/config-store.js';
import { GoogleAuthService } from '../services/google-auth.js';
import { GoogleDriveService } from '../services/google-drive.js';
import { formatUploadDate, generateFileName, reserveDuplicateFilename } from '../utils/file-namer.js';
import { formatUploadStatusMessage } from '../utils/upload-status.js';
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
    this.discordToken = null;
  }

  async initialize() {
    await this.configStore.initialize();
    
    const token = await this.configStore.getDiscordBotToken();
    if (!token) {
      throw new Error('Discord bot token not configured');
    }

    this.discordToken = token;

    this.client = new Client({
      intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent
      ]
    });

    this.setupEventHandlers();
    this.client.rest.setToken(token);
    
    await this.client.login(token);
    logger.info('Discord bot logged in successfully');
  }

  async ensureDiscordRestToken() {
    if (!this.client?.rest) return;

    const token = this.discordToken || await this.configStore.getDiscordBotToken();
    if (!token) {
      throw new Error('Discord bot token not configured');
    }

    this.discordToken = token;
    this.client.rest.setToken(token);
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
    if (!guild) return;
    
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

    const uploadDate = formatUploadDate(message.createdAt);
    const { driveService, uploadFolder, existingFilenames } = await this.prepareDriveUploadContext(
      channelConfig.driveFolderId,
      uploadDate
    );
    const reservedFilenames = supportedAttachments.map((attachment) => {
      const baseFilename = generateFileName(
        attachment.name,
        message.content,
        message.createdAt,
        message.member?.displayName || message.author?.globalName || message.author?.username || ''
      );

      return reserveDuplicateFilename(baseFilename, existingFilenames);
    });

    const uploadTasks = supportedAttachments.map((attachment, index) =>
      this.createUploadTask(attachment, reservedFilenames[index], uploadFolder.id, driveService)
    );

    // Send initial response
    const emoji = supportedAttachments.length === 1 ? '📤' : '📤📤';
    let uploadingMessage = null;
    try {
      await this.ensureDiscordRestToken();
      uploadingMessage = await message.reply(`${emoji} Uploading ${supportedAttachments.length} file(s)...`);
    } catch (error) {
      logger.warn(`Failed to send upload status reply for message ${message.id}:`, error);
    }

    // Wait for uploads to complete
    const results = await Promise.allSettled(
      uploadTasks.map(task => task())
    );

    const successful = results.filter(r => r.status === 'fulfilled').length;
    const failed = results.filter(r => r.status === 'rejected').length;
    const uploadedFilenames = results
      .filter((result) => result.status === 'fulfilled')
      .map((result) => result.value.fileName);

    // Update response
    let responseText = '';
    if (successful === supportedAttachments.length) {
      responseText = formatUploadStatusMessage({
        successfulCount: successful,
        totalCount: supportedAttachments.length,
        folderName: `${channelConfig.folderName}/${uploadFolder.name}`,
        folderId: uploadFolder.id,
        uploadedFilenames
      });
    } else if (failed === supportedAttachments.length) {
      responseText = '❌ Upload failed';
    } else {
      responseText = formatUploadStatusMessage({
        successfulCount: successful,
        totalCount: supportedAttachments.length,
        folderName: `${channelConfig.folderName}/${uploadFolder.name}`,
        folderId: uploadFolder.id,
        uploadedFilenames
      });
    }

    if (uploadingMessage) {
      try {
        await this.ensureDiscordRestToken();
        await uploadingMessage.edit(responseText);
      } catch (error) {
        logger.warn(`Failed to update upload status reply for message ${message.id}:`, error);
      }
    }

    // Update bot avatar if last upload was an image
    const lastSuccessful = results
      .map((result, index) => ({ result, attachment: supportedAttachments[index] }))
      .filter(({ result }) => result.status === 'fulfilled')
      .pop();

    if (lastSuccessful && SUPPORTED_IMAGE_TYPES.includes(lastSuccessful.attachment.contentType)) {
      await this.updateBotAvatar(lastSuccessful.attachment.url);
    }
  }

  async prepareDriveUploadContext(folderId, uploadDate) {
    const googleTokens = await this.configStore.getGoogleTokens();
    if (!googleTokens) {
      throw new Error('Google Drive not configured');
    }

    const authService = new GoogleAuthService();
    if (googleTokens.expired && googleTokens.refresh_token) {
      const refreshed = await authService.refreshAccessToken(googleTokens.refresh_token);
      await this.configStore.setGoogleTokens(refreshed);
      authService.setCredentials(refreshed);
    } else {
      authService.setCredentials(googleTokens);
    }

    const driveService = new GoogleDriveService(authService.getAuthClient());
    const uploadFolder = await driveService.ensureFolder(uploadDate, folderId);
    const existingFiles = await driveService.getFilesByFolder(uploadFolder.id);

    return {
      driveService,
      uploadFolder,
      existingFilenames: existingFiles.map((file) => file.name)
    };
  }

  createUploadTask(attachment, finalFilename, folderId, driveService) {
    return async () => {
      try {
        // Download file
        const response = await fetch(attachment.url);
        if (!response.ok) {
          throw new Error(`Failed to download attachment: ${response.statusText}`);
        }

        const buffer = Buffer.from(await response.arrayBuffer());

        // Upload to Drive
        const uploadResult = buffer.length > 10 * 1024 * 1024 // 10MB
          ? await driveService.uploadLargeFile(buffer, finalFilename, folderId, attachment.contentType)
          : await driveService.uploadFile(buffer, finalFilename, folderId, attachment.contentType);

        logger.info(`Successfully uploaded ${finalFilename} to Google Drive`);
        return {
          ...uploadResult,
          fileName: finalFilename
        };
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
      await this.ensureDiscordRestToken();
      await this.client.user.setAvatar(buffer);
      logger.info('Updated bot avatar to latest uploaded image');
    } catch (error) {
      logger.error('Failed to update bot avatar:', error);
    }
  }

  getConnectedGuilds() {
    if (!this.client || !this.client.isReady()) {
      return [];
    }

    return Array.from(this.client.guilds.cache.values())
      .map((guild) => ({
        id: guild.id,
        name: guild.name,
        icon: guild.icon,
        memberCount: guild.memberCount || 0
      }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  async getGuildChannels(guildId) {
    if (!this.client || !this.client.isReady()) {
      return [];
    }

    const guild = this.client.guilds.cache.get(guildId);
    if (!guild) {
      return [];
    }

    let channels = guild.channels.cache;
    try {
      channels = await guild.channels.fetch();
    } catch {
      channels = guild.channels.cache;
    }

    return Array.from(channels.values())
      .filter((channel) => channel.isTextBased())
      .map((channel) => ({
        id: channel.id,
        name: channel.name || 'Unknown channel',
        type: channel.type
      }))
      .sort((a, b) => a.name.localeCompare(b.name));
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
