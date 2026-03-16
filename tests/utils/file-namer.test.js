import {
  formatUploadDate,
  formatUploadTime,
  generateFileName,
  getUploadTimeZone,
  sanitizeForFilename,
  handleDuplicateFilename,
  reserveDuplicateFilename
} from '../../src/utils/file-namer.js';

describe('File Namer Utilities', () => {
  describe('sanitizeForFilename', () => {
    test('removes special characters', () => {
      expect(sanitizeForFilename('Hello:World?/Test')).toBe('HelloWorldTest');
    });

    test('preserves spaces', () => {
      expect(sanitizeForFilename('hello world test')).toBe('hello world test');
    });

    test('handles multiple spaces', () => {
      expect(sanitizeForFilename('hello   world')).toBe('hello world');
    });

    test('trims leading and trailing whitespace', () => {
      expect(sanitizeForFilename('  hello world  ')).toBe('hello world');
    });

    test('truncates to provided length', () => {
      const longText = 'a'.repeat(60);
      expect(sanitizeForFilename(longText, 50)).toHaveLength(50);
    });

    test('handles empty string', () => {
      expect(sanitizeForFilename('')).toBe('');
      expect(sanitizeForFilename(null)).toBe('');
      expect(sanitizeForFilename(undefined)).toBe('');
    });

    test('preserves numbers and hyphens', () => {
      expect(sanitizeForFilename('Test-123-abc')).toBe('Test-123-abc');
    });

    test('removes trailing dots', () => {
      expect(sanitizeForFilename('hello...')).toBe('hello');
    });
  });

  describe('generateFileName', () => {
    const fixedDate = new Date('2025-05-23T14:30:45.000Z');
    const boundaryDate = new Date('2025-05-23T23:30:45.000Z');

    test('formats the upload date for Drive folders', () => {
      expect(formatUploadDate(fixedDate, 'UTC')).toBe('2025-05-23');
    });

    test('formats the upload time for file names', () => {
      expect(formatUploadTime(fixedDate, 'UTC')).toBe('14-30-45');
    });

    test('uses the supplied timezone for folder dates and file times', () => {
      expect(formatUploadDate(boundaryDate, 'Asia/Singapore')).toBe('2025-05-24');
      expect(formatUploadTime(boundaryDate, 'Asia/Singapore')).toBe('07-30-45');
    });

    test('generates filename with author and message content', () => {
      const result = generateFileName('photo.jpg', 'Check this out!', fixedDate, 'Alice Example', 'UTC');
      expect(result).toBe('Alice Example - 14-30-45 - Check this out!.jpg');
    });

    test('generates filename without message content', () => {
      const result = generateFileName('photo.jpg', '', fixedDate, 'Alice Example', 'UTC');
      expect(result).toBe('Alice Example - 14-30-45.jpg');
    });

    test('handles different file extensions', () => {
      expect(generateFileName('video.mp4', 'test', fixedDate, 'Alice', 'UTC')).toContain('.mp4');
      expect(generateFileName('image.PNG', 'test', fixedDate, 'Alice', 'UTC')).toContain('.png');
      expect(generateFileName('file.webm', 'test', fixedDate, 'Alice', 'UTC')).toContain('.webm');
    });

    test('truncates comment text to first 100 characters', () => {
      const longMessage = 'a'.repeat(150);
      const result = generateFileName('photo.jpg', longMessage, fixedDate, 'Alice', 'UTC');
      expect(result).toBe(`Alice - 14-30-45 - ${'a'.repeat(100)}.jpg`);
    });

    test('handles files with multiple dots', () => {
      const result = generateFileName('my.photo.backup.jpg', 'test', fixedDate, 'Alice', 'UTC');
      expect(result).toContain('.jpg');
      expect(result).toContain('test');
    });

    test('falls back to Unknown user when author name is missing', () => {
      const result = generateFileName('photo.jpg', 'hello', fixedDate, '', 'UTC');
      expect(result).toBe('Unknown user - 14-30-45 - hello.jpg');
    });

    test('uses the runtime timezone by default', () => {
      expect(typeof getUploadTimeZone()).toBe('string');
      expect(getUploadTimeZone().length).toBeGreaterThan(0);
    });
  });

  describe('handleDuplicateFilename', () => {
    test('returns original filename if not duplicate', () => {
      const existing = ['file1.jpg', 'file2.jpg'];
      expect(handleDuplicateFilename('file3.jpg', existing)).toBe('file3.jpg');
    });

    test('adds counter for duplicate filename', () => {
      const existing = ['photo.jpg', 'photo_1.jpg'];
      expect(handleDuplicateFilename('photo.jpg', existing)).toBe('photo_2.jpg');
    });

    test('finds next available counter', () => {
      const existing = ['test.mp4', 'test_1.mp4', 'test_2.mp4', 'test_4.mp4'];
      expect(handleDuplicateFilename('test.mp4', existing)).toBe('test_3.mp4');
    });

    test('handles files with multiple dots', () => {
      const existing = ['my.photo.jpg'];
      expect(handleDuplicateFilename('my.photo.jpg', existing)).toBe('my.photo_1.jpg');
    });

    test('handles empty existing files array', () => {
      expect(handleDuplicateFilename('file.jpg', [])).toBe('file.jpg');
    });
  });

  describe('reserveDuplicateFilename', () => {
    test('reserves unique filenames across sequential allocations', () => {
      const existing = ['photo.jpg'];

      expect(reserveDuplicateFilename('photo.jpg', existing)).toBe('photo_1.jpg');
      expect(reserveDuplicateFilename('photo.jpg', existing)).toBe('photo_2.jpg');
      expect(existing).toEqual(['photo.jpg', 'photo_1.jpg', 'photo_2.jpg']);
    });
  });
});
