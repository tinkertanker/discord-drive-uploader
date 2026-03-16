import { google } from 'googleapis';
import { createLogger } from '../utils/logger.js';
import { Readable } from 'stream';

const logger = createLogger('GoogleDrive');

export class GoogleDriveService {
  constructor(authClient) {
    this.drive = google.drive({ version: 'v3', auth: authClient });
    this.pendingFolderEnsures = new Map();
  }

  escapeDriveQueryValue(value) {
    return String(value).replace(/\\/g, '\\\\').replace(/'/g, '\\\'');
  }

  async listFolders(pageSize = 100) {
    try {
      const response = await this.drive.files.list({
        q: 'mimeType=\'application/vnd.google-apps.folder\' and trashed=false',
        fields: 'files(id, name, parents)',
        pageSize,
        orderBy: 'name',
        supportsAllDrives: true,
        includeItemsFromAllDrives: true
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
        fields: 'id, name',
        supportsAllDrives: true
      });

      logger.info(`Created folder: ${name} with ID: ${response.data.id}`);
      return response.data;
    } catch (error) {
      logger.error('Failed to create folder:', error);
      throw new Error('Failed to create folder in Google Drive');
    }
  }

  async findFolderByName(name, parentId = null) {
    try {
      const clauses = [
        'mimeType=\'application/vnd.google-apps.folder\'',
        'trashed=false',
        `name='${this.escapeDriveQueryValue(name)}'`
      ];

      if (parentId) {
        clauses.push(`'${this.escapeDriveQueryValue(parentId)}' in parents`);
      }

      const response = await this.drive.files.list({
        q: clauses.join(' and '),
        fields: 'files(id, name, parents)',
        pageSize: 1,
        orderBy: 'createdTime desc',
        supportsAllDrives: true,
        includeItemsFromAllDrives: true
      });

      return response.data.files?.[0] || null;
    } catch (error) {
      logger.error('Failed to find folder by name:', error);
      throw new Error('Failed to search Google Drive folders');
    }
  }

  async ensureFolder(name, parentId = null) {
    const folderKey = `${parentId || 'root'}:${name}`;
    const pendingEnsure = this.pendingFolderEnsures.get(folderKey);
    if (pendingEnsure) {
      return pendingEnsure;
    }

    const ensurePromise = (async () => {
      const existingFolder = await this.findFolderByName(name, parentId);
      if (existingFolder) {
        return existingFolder;
      }

      return this.createFolder(name, parentId);
    })();

    this.pendingFolderEnsures.set(folderKey, ensurePromise);

    try {
      return await ensurePromise;
    } finally {
      this.pendingFolderEnsures.delete(folderKey);
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
        fields: 'id, name, webViewLink',
        supportsAllDrives: true
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
        orderBy: 'createdTime desc',
        supportsAllDrives: true,
        includeItemsFromAllDrives: true
      });

      return response.data.files;
    } catch (error) {
      logger.error('Failed to get files by folder:', error);
      throw new Error('Failed to list files in folder');
    }
  }
}
