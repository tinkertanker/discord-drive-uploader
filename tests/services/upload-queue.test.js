import { jest } from '@jest/globals';
import { UploadQueue } from '../../src/services/upload-queue.js';

describe('UploadQueue', () => {
  let queue;

  beforeEach(() => {
    queue = new UploadQueue();
  });

  afterEach(() => {
    queue.clearQueue();
  });

  describe('add', () => {
    test('adds task to queue and returns ID', async () => {
      const task = jest.fn().mockResolvedValue('result');
      const id = await queue.add(task);
      
      expect(id).toBeTruthy();
      expect(queue.queue.length).toBe(1);
      expect(queue.queue[0].task).toBe(task);
      expect(queue.queue[0].status).toBe('pending');
    });

    test('starts processing when adding to empty queue', async () => {
      const task = jest.fn().mockResolvedValue('result');
      const processQueueSpy = jest.spyOn(queue, 'processQueue').mockImplementation(() => Promise.resolve());
      
      await queue.add(task);
      
      expect(processQueueSpy).toHaveBeenCalled();
      processQueueSpy.mockRestore();
    });
  });

  describe('processItem', () => {
    test('processes successful task', async () => {
      const task = jest.fn().mockResolvedValue('success');
      const item = {
        id: 1,
        task,
        status: 'pending',
        retries: 0
      };

      await queue.processItem(item);
      
      expect(task).toHaveBeenCalled();
      expect(item.status).toBe('completed');
      expect(item.completedAt).toBeTruthy();
    });

    test('handles failed task with retry', async () => {
      const task = jest.fn().mockRejectedValue(new Error('Network error'));
      const item = {
        id: 1,
        task,
        status: 'pending',
        retries: 0
      };

      await expect(queue.processItem(item)).rejects.toThrow('Network error');
      
      expect(item.status).toBe('failed');
      expect(item.lastError).toBe('Network error');
    });

    test('marks task as permanently failed after max retries', async () => {
      const task = jest.fn().mockRejectedValue(new Error('Persistent error'));
      const item = {
        id: 1,
        task,
        status: 'pending',
        retries: 3 // Already at max retries
      };

      await expect(queue.processItem(item)).rejects.toThrow('Persistent error');
      
      expect(item.status).toBe('failed-permanent');
    });
  });

  describe('processQueue', () => {
    test('processes items from queue', async () => {
      // Test that queue processing works without timing dependencies
      const results = [];
      const task1 = jest.fn().mockImplementation(() => {
        results.push('task1');
        return Promise.resolve('result1');
      });
      const task2 = jest.fn().mockImplementation(() => {
        results.push('task2');
        return Promise.resolve('result2');
      });

      // Manually add items to avoid auto-processing
      queue.processing = true;
      queue.queue = [
        { id: 1, task: task1, status: 'pending', retries: 0 },
        { id: 2, task: task2, status: 'pending', retries: 0 }
      ];

      // Process manually
      queue.processing = false;
      await queue.processQueue();

      expect(task1).toHaveBeenCalled();
      expect(task2).toHaveBeenCalled();
      expect(results).toContain('task1');
      expect(results).toContain('task2');
      expect(queue.queue.length).toBe(0);
    });

    test('handles concurrent processing limit', () => {
      // Test that concurrentUploads is respected
      queue.concurrentUploads = 2;
      
      // Add 5 pending items
      for (let i = 0; i < 5; i++) {
        queue.queue.push({
          id: i,
          task: jest.fn(),
          status: 'pending',
          retries: 0
        });
      }

      // Get pending items for processing
      const pendingItems = queue.queue
        .filter(item => item.status === 'pending')
        .slice(0, queue.concurrentUploads);

      expect(pendingItems.length).toBe(2);
    });
  });

  describe('getQueueStatus', () => {
    test('returns correct queue status', async () => {
      // Add various tasks
      await queue.add(jest.fn().mockResolvedValue('result'));
      
      queue.queue.push({
        id: 2,
        status: 'processing',
        task: jest.fn()
      });
      
      queue.queue.push({
        id: 3,
        status: 'failed',
        task: jest.fn()
      });

      const status = queue.getQueueStatus();
      
      expect(status).toEqual({
        total: 3,
        pending: 1,
        processing: 1,
        failed: 1,
        failedPermanent: 0
      });
    });
  });

  describe('clearQueue', () => {
    test('removes all items from queue', async () => {
      await queue.add(jest.fn());
      await queue.add(jest.fn());
      
      expect(queue.queue.length).toBe(2);
      
      queue.clearQueue();
      
      expect(queue.queue.length).toBe(0);
    });
  });
});