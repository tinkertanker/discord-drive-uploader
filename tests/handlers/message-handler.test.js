import { jest } from '@jest/globals';
import { Readable } from 'node:stream';

const mockFetch = jest.fn();

jest.unstable_mockModule('node-fetch', () => ({
  default: mockFetch
}));

const { DiscordBot } = await import('../../src/handlers/message-handler.js');

describe('DiscordBot upload handling', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('streams the Discord response body directly into Drive', async () => {
    const bot = new DiscordBot();
    const responseBody = Readable.from(['photo data']);
    mockFetch.mockResolvedValueOnce({ ok: true, body: responseBody });
    const driveService = {
      uploadFile: jest.fn().mockResolvedValue({ id: 'file123' })
    };

    const result = await bot.createUploadTask(
      { url: 'https://cdn.example/photo.png', name: 'photo.png', contentType: 'image/png' },
      'Alice - 12-00-00.png',
      'folder123',
      driveService
    )();

    expect(driveService.uploadFile).toHaveBeenCalledWith(
      responseBody,
      'Alice - 12-00-00.png',
      'folder123',
      'image/png'
    );
    expect(result).toEqual({ id: 'file123', fileName: 'Alice - 12-00-00.png' });
  });

  test('rejects an empty Discord response body without calling Drive', async () => {
    const bot = new DiscordBot();
    mockFetch.mockResolvedValueOnce({ ok: true, body: null });
    const driveService = { uploadFile: jest.fn() };

    const upload = bot.createUploadTask(
      { url: 'https://cdn.example/photo.png', name: 'photo.png', contentType: 'image/png' },
      'photo.png',
      'folder123',
      driveService
    );

    await expect(upload()).rejects.toThrow('empty response body');
    expect(driveService.uploadFile).not.toHaveBeenCalled();
  });

  test('aborts a Discord attachment request that never returns headers', async () => {
    jest.useFakeTimers();
    const bot = new DiscordBot();
    bot.attachmentFetchTimeoutMs = 100;
    mockFetch.mockImplementationOnce(() => new Promise(() => {}));
    const driveService = { uploadFile: jest.fn() };

    try {
      const upload = bot.createUploadTask(
        { url: 'https://cdn.example/photo.png', name: 'photo.png', contentType: 'image/png' },
        'photo.png',
        'folder123',
        driveService
      );
      const uploadPromise = upload();
      jest.advanceTimersByTime(100);

      await expect(uploadPromise).rejects.toThrow('Attachment download timed out');
      expect(mockFetch.mock.calls[0][1].signal.aborted).toBe(true);
      expect(driveService.uploadFile).not.toHaveBeenCalled();
    } finally {
      jest.useRealTimers();
    }
  });

  test('updates the pending reply when Drive preparation fails', async () => {
    const bot = new DiscordBot();
    const statusMessage = { edit: jest.fn().mockResolvedValue(undefined) };
    bot.ensureDiscordRestToken = jest.fn().mockResolvedValue(undefined);
    bot.configStore.getUploadFolder = jest.fn().mockResolvedValue({
      driveFolderId: 'parent123',
      folderName: 'Uploads'
    });
    bot.prepareDriveUploadContext = jest.fn().mockRejectedValue(new Error('Drive unavailable'));
    const message = {
      id: 'message123',
      guild: { id: 'guild123' },
      channel: { id: 'channel123', name: 'photos' },
      attachments: new Map([
        ['attachment123', { name: 'photo.png', contentType: 'image/png' }]
      ]),
      reply: jest.fn().mockResolvedValue(statusMessage),
      createdAt: new Date('2026-07-21T08:00:00Z'),
      content: '',
      author: { username: 'Alice' }
    };

    await bot.handleMessageWithAttachments(message);

    expect(message.reply).toHaveBeenCalledWith('📤 Uploading 1 file(s)...');
    expect(statusMessage.edit).toHaveBeenCalledWith('❌ Upload failed');
  });

  test('keeps concurrent filename reservations separate from the Drive cache', () => {
    const bot = new DiscordBot();

    const first = bot.reserveUploadFilenames('folder123', ['photo.png'], []);
    const second = bot.reserveUploadFilenames('folder123', ['photo.png'], []);

    expect(first).toEqual(['photo.png']);
    expect(second).toEqual(['photo_1.png']);

    bot.finalizeFilenameReservations('folder123', first, []);
    const retry = bot.reserveUploadFilenames('folder123', ['photo.png'], []);
    expect(retry).toEqual(['photo.png']);

    bot.finalizeFilenameReservations('folder123', second, []);
    bot.finalizeFilenameReservations('folder123', retry, []);
  });

  test('holds successful filename reservations until the Drive cache can refresh', () => {
    jest.useFakeTimers();
    const bot = new DiscordBot();
    bot.successfulFilenameReservationMs = 100;

    try {
      const uploaded = bot.reserveUploadFilenames('folder123', ['photo.png'], []);
      bot.finalizeFilenameReservations('folder123', uploaded, uploaded);

      const whileDriveListMayBeStale = bot.reserveUploadFilenames(
        'folder123',
        ['photo.png'],
        []
      );
      expect(whileDriveListMayBeStale).toEqual(['photo_1.png']);

      jest.advanceTimersByTime(100);
      bot.finalizeFilenameReservations('folder123', whileDriveListMayBeStale, []);
      expect(bot.reserveUploadFilenames('folder123', ['photo.png'], []))
        .toEqual(['photo.png']);
    } finally {
      jest.useRealTimers();
    }
  });

  test('reuses a Drive service only while the access token is unchanged', () => {
    const bot = new DiscordBot();

    const firstService = bot.getDriveService({ access_token: 'token-a' });
    const reusedService = bot.getDriveService({ access_token: 'token-a' });
    const replacementService = bot.getDriveService({ access_token: 'token-b' });

    expect(reusedService).toBe(firstService);
    expect(replacementService).not.toBe(firstService);
  });
});
