import { Client, GatewayIntentBits, REST, Routes } from 'discord.js';
import { ConfigStore } from '../services/config-store.js';
import { GoogleAuthService, refreshStoredGoogleTokens } from '../services/google-auth.js';
import { GoogleDriveService } from '../services/google-drive.js';
import { formatUploadDate, generateFileName, getUploadTimeZone, reserveDuplicateFilename } from '../utils/file-namer.js';
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
    this.driveContext = null;
    this.filenameReservations = new Map();
    this.successfulFilenameReservationMs = 30 * 1000;
    this.attachmentHeadersTimeoutMs = 2 * 60 * 1000;
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
    
    const channelConfig = await this.configStore.getUploadFolder(guild.id, channel.id);
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

    // Let the user know immediately while Drive setup happens in parallel.
    const emoji = supportedAttachments.length === 1 ? '📤' : '📤📤';
    const uploadingMessagePromise = this.sendUploadStatusReply(
      message,
      `${emoji} Uploading ${supportedAttachments.length} file(s)...`
    );

    const uploadTimeZone = getUploadTimeZone();
    const uploadDate = formatUploadDate(message.createdAt, uploadTimeZone);
    let uploadContext;
    try {
      uploadContext = await this.prepareDriveUploadContext(channelConfig.driveFolderId, uploadDate);
    } catch (error) {
      logger.error(`Failed to prepare Drive upload for message ${message.id}:`, error);
      const uploadingMessage = await uploadingMessagePromise;
      if (uploadingMessage) {
        try {
          await uploadingMessage.edit('❌ Upload failed');
        } catch (replyError) {
          logger.warn(`Failed to update upload status reply for message ${message.id}:`, replyError);
        }
      }
      return;
    }

    const { driveService, uploadFolder, existingFilenames } = uploadContext;
    const baseFilenames = supportedAttachments.map((attachment) =>
      generateFileName(
        attachment.name,
        message.content,
        message.createdAt,
        message.member?.displayName || message.author?.globalName || message.author?.username || '',
        uploadTimeZone
      )
    );
    const reservedFilenames = this.reserveUploadFilenames(
      uploadFolder.id,
      baseFilenames,
      existingFilenames
    );

    const uploadTasks = supportedAttachments.map((attachment, index) =>
      this.createUploadTask(attachment, reservedFilenames[index], uploadFolder.id, driveService)
    );

    const resultsPromise = Promise.allSettled(
      uploadTasks.map(task => task())
    );
    // Wait for uploads to complete
    const results = await resultsPromise;

    const successful = results.filter(r => r.status === 'fulfilled').length;
    const failed = results.filter(r => r.status === 'rejected').length;
    const uploadedFilenames = results
      .filter((result) => result.status === 'fulfilled')
      .map((result) => result.value.fileName);
    this.finalizeFilenameReservations(uploadFolder.id, reservedFilenames, uploadedFilenames);

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

    const uploadingMessage = await uploadingMessagePromise;
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

  async sendUploadStatusReply(message, text) {
    try {
      await this.ensureDiscordRestToken();
      return await message.reply(text);
    } catch (error) {
      logger.warn(`Failed to send upload status reply for message ${message.id}:`, error);
      return null;
    }
  }

  async prepareDriveUploadContext(folderId, uploadDate) {
    const googleTokens = await this.getGoogleTokensForUpload();
    const driveService = this.getDriveService(googleTokens);
    const uploadFolder = await driveService.ensureFolder(uploadDate, folderId);
    const existingFilenames = await driveService.getKnownFilenames(uploadFolder.id);

    return {
      driveService,
      uploadFolder,
      existingFilenames
    };
  }

  async getGoogleTokensForUpload() {
    const googleTokens = await this.configStore.getGoogleTokens();
    if (!googleTokens) {
      throw new Error('Google Drive not configured');
    }

    if (!googleTokens.expired) {
      return googleTokens;
    }

    if (!googleTokens.refresh_token) {
      throw new Error('Google Drive authorisation expired; reconnect Google Drive');
    }

    return refreshStoredGoogleTokens(this.configStore, googleTokens);
  }

  getDriveService(googleTokens) {
    if (this.driveContext?.accessToken === googleTokens.access_token) {
      return this.driveContext.service;
    }

    const authService = new GoogleAuthService();
    authService.setCredentials(googleTokens);
    const service = new GoogleDriveService(authService.getAuthClient());
    this.driveContext = {
      accessToken: googleTokens.access_token,
      service
    };
    return service;
  }

  reserveUploadFilenames(folderId, baseFilenames, existingFilenames) {
    let reservations = this.filenameReservations.get(folderId);
    if (!reservations) {
      reservations = new Set();
      this.filenameReservations.set(folderId, reservations);
    }

    const unavailableFilenames = [...existingFilenames, ...reservations];
    const reservedFilenames = baseFilenames.map((filename) =>
      reserveDuplicateFilename(filename, unavailableFilenames)
    );
    reservedFilenames.forEach((filename) => reservations.add(filename));
    return reservedFilenames;
  }

  finalizeFilenameReservations(folderId, reservedFilenames, successfulFilenames) {
    const reservations = this.filenameReservations.get(folderId);
    if (!reservations) return;

    const successful = new Set(successfulFilenames);
    reservedFilenames.forEach((filename) => {
      if (!successful.has(filename)) {
        reservations.delete(filename);
        return;
      }

      const releaseTimer = setTimeout(() => {
        reservations.delete(filename);
        if (reservations.size === 0) {
          this.filenameReservations.delete(folderId);
        }
      }, this.successfulFilenameReservationMs);
      releaseTimer.unref?.();
    });

    if (reservations.size === 0) {
      this.filenameReservations.delete(folderId);
    }
  }

  createUploadTask(attachment, finalFilename, folderId, driveService) {
    return async () => {
      try {
        // Download file
        const fetchAbortController = new AbortController();
        let rejectFetchTimeout;
        const fetchTimeoutFailure = new Promise((_, reject) => {
          rejectFetchTimeout = reject;
        });
        const fetchTimer = setTimeout(() => {
          const timeoutError = new Error(
            `Attachment request timed out before response headers after ${this.attachmentHeadersTimeoutMs}ms`
          );
          fetchAbortController.abort(timeoutError);
          rejectFetchTimeout(timeoutError);
        }, this.attachmentHeadersTimeoutMs);
        fetchTimer.unref?.();

        let response;
        try {
          response = await Promise.race([
            fetch(attachment.url, { signal: fetchAbortController.signal }),
            fetchTimeoutFailure
          ]);
        } finally {
          clearTimeout(fetchTimer);
        }

        if (!response.ok) {
          throw new Error(`Failed to download attachment: ${response.statusText}`);
        }

        if (!response.body) {
          throw new Error('Failed to download attachment: empty response body');
        }

        // Pipe the download into Drive instead of buffering the whole file in memory.
        const uploadResult = await driveService.uploadFile(
          response.body,
          finalFilename,
          folderId,
          attachment.contentType
        );

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
