import { google } from 'googleapis';
import { createLogger } from '../utils/logger.js';
import { Readable } from 'stream';

const logger = createLogger('GoogleDrive');

export class GoogleDriveService {
  constructor(authClient) {
    this.drive = google.drive({ version: 'v3', auth: authClient });
  }

  async listFolders(pageSize = 100) {
    try {
      const response = await this.drive.files.list({
        q: 'mimeType=\'application/vnd.google-apps.folder\' and trashed=false',
        fields: 'files(id, name, parents)',
        pageSize,
        orderBy: 'name'
      });

      logger.info(`Found ${response.data.files.length} folders`);
      return response.data.files;
    } catch (error) {
      logger.error('Failed to list folders:', error);
      throw new Error('Failed to list Google Drive folders');
    }
  }

  async createFolder(name, parentId = null) {
    try {
      const fileMetadata = {
        name,
        mimeType: 'application/vnd.google-apps.folder'
      };

      if (parentId) {
        fileMetadata.parents = [parentId];
      }

      const response = await this.drive.files.create({
        resource: fileMetadata,
        fields: 'id, name'
      });

      logger.info(`Created folder: ${name} with ID: ${response.data.id}`);
      return response.data;
    } catch (error) {
      logger.error('Failed to create folder:', error);
      throw new Error('Failed to create folder in Google Drive');
    }
  }

  async uploadFile(fileBuffer, fileName, folderId, mimeType) {
    try {
      const fileMetadata = {
        name: fileName,
        parents: [folderId]
      };

      const media = {
        mimeType,
        body: Readable.from(fileBuffer)
      };

      const response = await this.drive.files.create({
        resource: fileMetadata,
        media: media,
        fields: 'id, name, webViewLink'
      });

      logger.info(`Uploaded file: ${fileName} with ID: ${response.data.id}`);
      return response.data;
    } catch (error) {
      logger.error('Failed to upload file:', error);
      throw new Error('Failed to upload file to Google Drive');
    }
  }

  async uploadLargeFile(fileBuffer, fileName, folderId, mimeType) {
    try {
      const fileSize = fileBuffer.length;
      logger.info(`Starting resumable upload for ${fileName} (${fileSize} bytes)`);

      const fileMetadata = {
        name: fileName,
        parents: [folderId]
      };

      const response = await this.drive.files.create({
        resource: fileMetadata,
        media: {
          mimeType,
          body: Readable.from(fileBuffer)
        },
        fields: 'id, name, webViewLink',
        supportsAllDrives: true
      });

      logger.info(`Successfully uploaded large file: ${fileName}`);
      return response.data;
    } catch (error) {
      logger.error('Failed to upload large file:', error);
      throw new Error('Failed to upload large file to Google Drive');
    }
  }

  async getFilesByFolder(folderId, pageSize = 100) {
    try {
      const response = await this.drive.files.list({
        q: `'${folderId}' in parents and trashed=false`,
        fields: 'files(id, name, mimeType, size, createdTime)',
        pageSize,
        orderBy: 'createdTime desc'
      });

      return response.data.files;
    } catch (error) {
      logger.error('Failed to get files by folder:', error);
      throw new Error('Failed to list files in folder');
    }
  }
}