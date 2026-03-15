import { buildDriveFolderUrl, formatUploadStatusMessage } from '../../src/utils/upload-status.js';

describe('Upload status utilities', () => {
  test('builds a Google Drive folder URL', () => {
    expect(buildDriveFolderUrl('folder123')).toBe('https://drive.google.com/drive/folders/folder123');
  });

  test('formats a single-file success message', () => {
    expect(formatUploadStatusMessage({
      successfulCount: 1,
      totalCount: 1,
      folderName: '_From Discord',
      folderId: 'folder123',
      uploadedFilenames: ['2026-03-15-12-54 - t.png']
    })).toBe(
      'Uploaded to [_From Discord](https://drive.google.com/drive/folders/folder123).\n\n' +
      'File name:\n' +
      '- 2026-03-15-12-54 - t.png'
    );
  });

  test('formats a multi-file success message', () => {
    expect(formatUploadStatusMessage({
      successfulCount: 3,
      totalCount: 3,
      folderName: '_From Discord',
      folderId: 'folder123',
      uploadedFilenames: ['2026-03-15-12-42 - jiachenyee.jpg', '2026-03-15-12-42 - jiachenyee_1.jpg']
    })).toBe(
      'Uploaded to [_From Discord](https://drive.google.com/drive/folders/folder123).\n\n' +
      'File names starting from:\n' +
      '- 2026-03-15-12-42 - jiachenyee.jpg'
    );
  });

  test('formats a partial success message', () => {
    expect(formatUploadStatusMessage({
      successfulCount: 2,
      totalCount: 3,
      folderName: '_From Discord',
      folderId: 'folder123',
      uploadedFilenames: ['2026-03-15-12-42 - jiachenyee.jpg']
    })).toBe(
      'Uploaded 2/3 files to [_From Discord](https://drive.google.com/drive/folders/folder123).\n\n' +
      'File name:\n' +
      '- 2026-03-15-12-42 - jiachenyee.jpg'
    );
  });

  test('returns a failure message when nothing uploaded', () => {
    expect(formatUploadStatusMessage({
      successfulCount: 0,
      totalCount: 2,
      folderName: '_From Discord',
      folderId: 'folder123',
      uploadedFilenames: []
    })).toBe('❌ Upload failed');
  });
});
