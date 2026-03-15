import { jest } from '@jest/globals';

const mockDriveFiles = {
  create: jest.fn(),
  list: jest.fn()
};

const mockDrive = {
  files: mockDriveFiles
};

jest.unstable_mockModule('googleapis', () => ({
  google: {
    drive: jest.fn(() => mockDrive)
  }
}));

const { GoogleDriveService } = await import('../../src/services/google-drive.js');

describe('GoogleDriveService', () => {
  let driveService;

  beforeEach(() => {
    jest.clearAllMocks();
    driveService = new GoogleDriveService({ fake: 'auth' });
  });

  test('uploads small files with shared drive support enabled', async () => {
    mockDriveFiles.create.mockResolvedValueOnce({
      data: { id: 'file123', name: 'photo.png', webViewLink: 'https://drive.google.com/file123' }
    });

    const result = await driveService.uploadFile(
      Buffer.from('hello'),
      'photo.png',
      'folder123',
      'image/png'
    );

    expect(mockDriveFiles.create).toHaveBeenCalledWith(expect.objectContaining({
      fields: 'id, name, webViewLink',
      supportsAllDrives: true,
      resource: {
        name: 'photo.png',
        parents: ['folder123']
      }
    }));
    expect(result.id).toBe('file123');
  });

  test('lists files in a folder with shared drive support enabled', async () => {
    mockDriveFiles.list.mockResolvedValueOnce({
      data: {
        files: [{ id: 'file123', name: 'photo.png' }]
      }
    });

    const files = await driveService.getFilesByFolder('folder123');

    expect(mockDriveFiles.list).toHaveBeenCalledWith(expect.objectContaining({
      q: '\'folder123\' in parents and trashed=false',
      supportsAllDrives: true,
      includeItemsFromAllDrives: true
    }));
    expect(files).toEqual([{ id: 'file123', name: 'photo.png' }]);
  });
});
