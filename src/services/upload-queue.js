import { createLogger } from '../utils/logger.js';

const logger = createLogger('UploadQueue');

export class UploadQueue {
  constructor() {
    this.queue = [];
    this.processing = false;
    this.maxRetries = 3;
    this.concurrentUploads = 3;
  }

  async add(uploadTask) {
    const queueItem = {
      id: Date.now() + Math.random(),
      task: uploadTask,
      retries: 0,
      status: 'pending',
      addedAt: Date.now()
    };

    this.queue.push(queueItem);
    logger.info(`Added upload task to queue. Queue size: ${this.queue.length}`);

    // Start processing if not already running
    if (!this.processing) {
      this.processQueue();
    }

    return queueItem.id;
  }

  async processQueue() {
    if (this.processing) return;
    
    this.processing = true;
    logger.info('Starting queue processing');

    while (this.queue.length > 0) {
      // Get pending items
      const pendingItems = this.queue
        .filter(item => item.status === 'pending')
        .slice(0, this.concurrentUploads);

      if (pendingItems.length === 0) {
        // No pending items, check for failed items to retry
        const failedItems = this.queue.filter(
          item => item.status === 'failed' && item.retries < this.maxRetries
        );

        if (failedItems.length === 0) {
          break; // Nothing to process
        }

        // Reset failed items for retry
        failedItems.forEach(item => {
          item.status = 'pending';
          item.retries++;
        });
        continue;
      }

      // Process items concurrently
      const promises = pendingItems.map(item => this.processItem(item));
      await Promise.allSettled(promises);

      // Remove completed items
      this.queue = this.queue.filter(item => item.status !== 'completed');
    }

    this.processing = false;
    logger.info('Queue processing completed');
  }

  async processItem(item) {
    try {
      item.status = 'processing';
      logger.info(`Processing upload task ${item.id}`);

      const result = await item.task();
      
      item.status = 'completed';
      item.completedAt = Date.now();
      logger.info(`Upload task ${item.id} completed successfully`);
      
      return result;
    } catch (error) {
      logger.error(`Upload task ${item.id} failed:`, error);
      
      if (item.retries < this.maxRetries) {
        item.status = 'failed';
        item.lastError = error.message;
        logger.info(`Will retry upload task ${item.id}. Retries: ${item.retries + 1}/${this.maxRetries}`);
      } else {
        item.status = 'failed-permanent';
        logger.error(`Upload task ${item.id} failed permanently after ${this.maxRetries} retries`);
      }
      
      throw error;
    }
  }

  getQueueStatus() {
    const status = {
      total: this.queue.length,
      pending: this.queue.filter(item => item.status === 'pending').length,
      processing: this.queue.filter(item => item.status === 'processing').length,
      failed: this.queue.filter(item => item.status === 'failed').length,
      failedPermanent: this.queue.filter(item => item.status === 'failed-permanent').length
    };

    logger.debug('Queue status:', status);
    return status;
  }

  clearQueue() {
    const previousSize = this.queue.length;
    this.queue = [];
    logger.info(`Cleared queue. Removed ${previousSize} items`);
  }
}

// Singleton instance
let queueInstance = null;

export function getUploadQueue() {
  if (!queueInstance) {
    queueInstance = new UploadQueue();
  }
  return queueInstance;
}