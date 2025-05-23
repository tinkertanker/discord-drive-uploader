import { generateFileName, sanitizeForFilename, handleDuplicateFilename } from '../../src/utils/file-namer.js';

describe('File Namer Utilities', () => {
  describe('sanitizeForFilename', () => {
    test('removes special characters', () => {
      expect(sanitizeForFilename('Hello@World!')).toBe('helloworld');
    });

    test('replaces spaces with underscores', () => {
      expect(sanitizeForFilename('hello world test')).toBe('hello_world_test');
    });

    test('handles multiple spaces', () => {
      expect(sanitizeForFilename('hello   world')).toBe('hello_world');
    });

    test('removes leading and trailing hyphens', () => {
      expect(sanitizeForFilename('-hello-world-')).toBe('hello-world');
    });

    test('truncates to 50 characters', () => {
      const longText = 'a'.repeat(60);
      expect(sanitizeForFilename(longText)).toHaveLength(50);
    });

    test('handles empty string', () => {
      expect(sanitizeForFilename('')).toBe('');
      expect(sanitizeForFilename(null)).toBe('');
      expect(sanitizeForFilename(undefined)).toBe('');
    });

    test('preserves numbers and hyphens', () => {
      expect(sanitizeForFilename('test-123-abc')).toBe('test-123-abc');
    });
  });

  describe('generateFileName', () => {
    const fixedDate = new Date('2025-05-23T14:30:45.000Z');

    test('generates filename with message content', () => {
      const result = generateFileName('photo.jpg', 'Check this out!', fixedDate);
      expect(result).toBe('2025-05-23-14-30-45-check_this_out.jpg');
    });

    test('generates filename without message content', () => {
      const result = generateFileName('photo.jpg', '', fixedDate);
      expect(result).toBe('2025-05-23-14-30-45.jpg');
    });

    test('handles different file extensions', () => {
      expect(generateFileName('video.mp4', 'test', fixedDate)).toContain('.mp4');
      expect(generateFileName('image.PNG', 'test', fixedDate)).toContain('.png');
      expect(generateFileName('file.webm', 'test', fixedDate)).toContain('.webm');
    });

    test('truncates long filenames', () => {
      const longMessage = 'a'.repeat(150);
      const result = generateFileName('photo.jpg', longMessage, fixedDate);
      expect(result.length).toBeLessThanOrEqual(104); // 100 + .jpg
    });

    test('handles files with multiple dots', () => {
      const result = generateFileName('my.photo.backup.jpg', 'test', fixedDate);
      expect(result).toContain('.jpg');
      expect(result).toContain('test');
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
});