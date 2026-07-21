import { jest } from '@jest/globals';
import { PassThrough, Readable } from 'node:stream';

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

    expect(mockDriveFiles.create).toHaveBeenCalledWith(
      expect.objectContaining({
        fields: 'id, name, webViewLink',
        supportsAllDrives: true,
        resource: {
          name: 'photo.png',
          parents: ['folder123']
        }
      }),
      expect.objectContaining({ signal: expect.any(Object) })
    );
    expect(result.id).toBe('file123');
  });

  test('passes streams directly to Drive without buffering them', async () => {
    mockDriveFiles.create.mockResolvedValueOnce({
      data: { id: 'file456', name: 'video.mp4' }
    });
    const stream = Readable.from(['video data']);

    await driveService.uploadFile(stream, 'video.mp4', 'folder123', 'video/mp4');

    expect(mockDriveFiles.create).toHaveBeenCalledWith(
      expect.objectContaining({
        media: {
          mimeType: 'video/mp4',
          body: stream
        }
      }),
      expect.objectContaining({ signal: expect.any(Object) })
    );
  });

  test('aborts and rejects when the source stream fails mid-upload', async () => {
    const stream = new PassThrough();
    let uploadSignal;
    mockDriveFiles.create.mockImplementationOnce((_params, options) => {
      uploadSignal = options.signal;
      return new Promise(() => {});
    });

    const uploadPromise = driveService.uploadFile(
      stream,
      'video.mp4',
      'folder123',
      'video/mp4'
    );
    stream.destroy(new Error('Discord connection reset'));

    await expect(uploadPromise).rejects.toThrow('Failed to upload file to Google Drive');
    expect(uploadSignal.aborted).toBe(true);
  });

  test('aborts an upload that exceeds its time limit', async () => {
    jest.useFakeTimers();
    const timedDriveService = new GoogleDriveService(
      { fake: 'auth' },
      { uploadTimeoutMs: 100 }
    );
    const stream = new PassThrough();
    let uploadSignal;
    mockDriveFiles.create.mockImplementationOnce((_params, options) => {
      uploadSignal = options.signal;
      return new Promise(() => {});
    });

    try {
      const uploadPromise = timedDriveService.uploadFile(
        stream,
        'video.mp4',
        'folder123',
        'video/mp4'
      );
      jest.advanceTimersByTime(100);

      await expect(uploadPromise).rejects.toThrow('Failed to upload file to Google Drive');
      expect(uploadSignal.aborted).toBe(true);
    } finally {
      jest.useRealTimers();
    }
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

  test('reuses a recently resolved folder without another Drive lookup', async () => {
    mockDriveFiles.list.mockResolvedValueOnce({
      data: {
        files: [{ id: 'folder456', name: '2026-03-16', parents: ['parent123'] }]
      }
    });

    const firstFolder = await driveService.ensureFolder('2026-03-16', 'parent123');
    const secondFolder = await driveService.ensureFolder('2026-03-16', 'parent123');

    expect(mockDriveFiles.list).toHaveBeenCalledTimes(1);
    expect(secondFolder).toBe(firstFolder);
  });

  test('reuses a recent filename list without exposing mutable cache state', async () => {
    mockDriveFiles.list.mockResolvedValueOnce({
      data: {
        files: [{ id: 'file123', name: 'photo.png' }]
      }
    });

    const firstFilenames = await driveService.getKnownFilenames('folder123');
    firstFilenames.push('photo_1.png');
    const secondFilenames = await driveService.getKnownFilenames('folder123');

    expect(mockDriveFiles.list).toHaveBeenCalledTimes(1);
    expect(secondFilenames).not.toBe(firstFilenames);
    expect(secondFilenames).toEqual(['photo.png']);
  });

  test('prunes expired entries across folder and filename cache keys', () => {
    driveService.folderCache.set('old-folder', {
      folder: { id: 'old-folder' },
      expiresAt: 99
    });
    driveService.folderCache.set('current-folder', {
      folder: { id: 'current-folder' },
      expiresAt: 101
    });
    driveService.filenameCache.set('old-folder', {
      filenames: ['old.png'],
      expiresAt: 99
    });
    driveService.filenameCache.set('current-folder', {
      filenames: ['current.png'],
      expiresAt: 101
    });

    driveService.pruneExpiredCaches(100);

    expect([...driveService.folderCache.keys()]).toEqual(['current-folder']);
    expect([...driveService.filenameCache.keys()]).toEqual(['current-folder']);
  });
});
