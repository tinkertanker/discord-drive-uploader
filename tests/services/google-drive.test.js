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

  test('reuses an existing child folder when ensuring a folder', async () => {
    mockDriveFiles.list.mockResolvedValueOnce({
      data: {
        files: [{ id: 'folder456', name: '2026-03-16', parents: ['parent123'] }]
      }
    });

    const folder = await driveService.ensureFolder('2026-03-16', 'parent123');

    expect(mockDriveFiles.list).toHaveBeenCalledWith(expect.objectContaining({
      q: 'mimeType=\'application/vnd.google-apps.folder\' and trashed=false and name=\'2026-03-16\' and \'parent123\' in parents'
    }));
    expect(mockDriveFiles.create).not.toHaveBeenCalled();
    expect(folder).toEqual({ id: 'folder456', name: '2026-03-16', parents: ['parent123'] });
  });

  test('creates a child folder when ensuring a missing folder', async () => {
    mockDriveFiles.list.mockResolvedValueOnce({
      data: {
        files: []
      }
    });
    mockDriveFiles.list.mockResolvedValueOnce({
      data: {
        files: []
      }
    });
    mockDriveFiles.create.mockResolvedValueOnce({
      data: { id: 'folder789', name: '2026-03-16' }
    });

    const folder = await driveService.ensureFolder('2026-03-16', 'parent123');

    expect(mockDriveFiles.create).toHaveBeenCalledWith(expect.objectContaining({
      resource: {
        name: '2026-03-16',
        mimeType: 'application/vnd.google-apps.folder',
        parents: ['parent123']
      },
      fields: 'id, name',
      supportsAllDrives: true
    }));
    expect(folder).toEqual({ id: 'folder789', name: '2026-03-16' });
  });

  test('reuses an existing same-day child folder with a description suffix', async () => {
    mockDriveFiles.list.mockResolvedValueOnce({
      data: {
        files: []
      }
    });
    mockDriveFiles.list.mockResolvedValueOnce({
      data: {
        files: [
          { id: 'folder654', name: '2026-03-16 holiday album', parents: ['parent123'] }
        ]
      }
    });

    const folder = await driveService.ensureFolder('2026-03-16', 'parent123');

    expect(mockDriveFiles.create).not.toHaveBeenCalled();
    expect(folder).toEqual({
      id: 'folder654',
      name: '2026-03-16 holiday album',
      parents: ['parent123']
    });
  });

  test('ignores partial date matches that continue with more digits', async () => {
    mockDriveFiles.list.mockResolvedValueOnce({
      data: {
        files: []
      }
    });
    mockDriveFiles.list.mockResolvedValueOnce({
      data: {
        files: [
          { id: 'folder321', name: '2026-03-1601 archive', parents: ['parent123'] }
        ]
      }
    });
    mockDriveFiles.create.mockResolvedValueOnce({
      data: { id: 'folder789', name: '2026-03-16' }
    });

    const folder = await driveService.ensureFolder('2026-03-16', 'parent123');

    expect(mockDriveFiles.create).toHaveBeenCalledTimes(1);
    expect(folder).toEqual({ id: 'folder789', name: '2026-03-16' });
  });

  test('keeps searching later pages for a same-day folder with a suffix', async () => {
    mockDriveFiles.list.mockResolvedValueOnce({
      data: {
        files: []
      }
    });
    mockDriveFiles.list.mockResolvedValueOnce({
      data: {
        files: [
          { id: 'folder001', name: 'misc 2026-03-16', parents: ['parent123'] }
        ],
        nextPageToken: 'page-2'
      }
    });
    mockDriveFiles.list.mockResolvedValueOnce({
      data: {
        files: [
          { id: 'folder654', name: '2026-03-16 holiday album', parents: ['parent123'] }
        ]
      }
    });

    const folder = await driveService.ensureFolder('2026-03-16', 'parent123');

    expect(mockDriveFiles.create).not.toHaveBeenCalled();
    expect(mockDriveFiles.list).toHaveBeenNthCalledWith(3, expect.objectContaining({
      pageToken: 'page-2',
      fields: 'nextPageToken, files(id, name, parents)'
    }));
    expect(folder).toEqual({
      id: 'folder654',
      name: '2026-03-16 holiday album',
      parents: ['parent123']
    });
  });

  test('serialises concurrent ensureFolder calls for the same child folder', async () => {
    let resolveList;
    let resolvePrefixList;
    let resolveCreate;
    const listPromise = new Promise((resolve) => {
      resolveList = resolve;
    });
    const prefixListPromise = new Promise((resolve) => {
      resolvePrefixList = resolve;
    });
    const createPromise = new Promise((resolve) => {
      resolveCreate = resolve;
    });

    mockDriveFiles.list.mockReturnValueOnce(listPromise);
    mockDriveFiles.list.mockReturnValueOnce(prefixListPromise);
    mockDriveFiles.create.mockReturnValueOnce(createPromise);

    const firstEnsure = driveService.ensureFolder('2026-03-16', 'parent123');
    const secondEnsure = driveService.ensureFolder('2026-03-16', 'parent123');

    expect(mockDriveFiles.list).toHaveBeenCalledTimes(1);
    expect(mockDriveFiles.create).toHaveBeenCalledTimes(0);

    resolveList({
      data: {
        files: []
      }
    });

    await new Promise((resolve) => setImmediate(resolve));
    resolvePrefixList({
      data: {
        files: []
      }
    });

    await new Promise((resolve) => setImmediate(resolve));
    expect(mockDriveFiles.create).toHaveBeenCalledTimes(1);

    resolveCreate({
      data: { id: 'folder999', name: '2026-03-16' }
    });

    await expect(firstEnsure).resolves.toEqual({ id: 'folder999', name: '2026-03-16' });
    await expect(secondEnsure).resolves.toEqual({ id: 'folder999', name: '2026-03-16' });
  });
});
