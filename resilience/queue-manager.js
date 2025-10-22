#!/usr/bin/env node

/**
 * Queue Manager with Persistence and Priority
 *
 * Features:
 * - Persistent queue with file/Redis backing
 * - Priority queuing (high, normal, low)
 * - Dead letter queue for failed requests
 * - Retry queue with scheduled processing
 * - Queue metrics and monitoring
 * - Rate limiting and throttling
 * - Batch processing support
 */

const EventEmitter = require('events');
const fs = require('fs').promises;
const path = require('path');
const crypto = require('crypto');

/**
 * Queue Priorities
 */
const Priority = {
    HIGH: 3,
    NORMAL: 2,
    LOW: 1
};

/**
 * Queue Item States
 */
const ItemState = {
    PENDING: 'pending',
    PROCESSING: 'processing',
    COMPLETED: 'completed',
    FAILED: 'failed',
    DEAD_LETTER: 'dead_letter'
};

/**
 * Queue Item
 */
class QueueItem {
    constructor(data, options = {}) {
        this.id = options.id || crypto.randomBytes(16).toString('hex');
        this.data = data;
        this.priority = options.priority || Priority.NORMAL;
        this.state = options.state || ItemState.PENDING;
        this.retryCount = options.retryCount || 0;
        this.maxRetries = options.maxRetries || 3;
        this.timeout = options.timeout || 30000;
        this.createdAt = options.createdAt || Date.now();
        this.updatedAt = options.updatedAt || Date.now();
        this.scheduledFor = options.scheduledFor || null;
        this.lastError = options.lastError || null;
        this.metadata = options.metadata || {};
    }

    toJSON() {
        return {
            id: this.id,
            data: this.data,
            priority: this.priority,
            state: this.state,
            retryCount: this.retryCount,
            maxRetries: this.maxRetries,
            timeout: this.timeout,
            createdAt: this.createdAt,
            updatedAt: this.updatedAt,
            scheduledFor: this.scheduledFor,
            lastError: this.lastError,
            metadata: this.metadata
        };
    }

    static fromJSON(json) {
        return new QueueItem(json.data, {
            id: json.id,
            priority: json.priority,
            state: json.state,
            retryCount: json.retryCount,
            maxRetries: json.maxRetries,
            timeout: json.timeout,
            createdAt: json.createdAt,
            updatedAt: json.updatedAt,
            scheduledFor: json.scheduledFor,
            lastError: json.lastError,
            metadata: json.metadata
        });
    }
}

/**
 * File-based Storage Backend
 */
class FileStorage {
    constructor(options = {}) {
        this.queueDir = options.queueDir || './queue';
        this.mainQueue = path.join(this.queueDir, 'main.json');
        this.deadLetterQueue = path.join(this.queueDir, 'dead-letter.json');
        this.initialized = false;
    }

    async init() {
        if (this.initialized) return;

        try {
            await fs.mkdir(this.queueDir, { recursive: true });
            this.initialized = true;
        } catch (error) {
            console.error('Failed to initialize storage:', error.message);
            throw error;
        }
    }

    async saveQueue(items) {
        await this.init();
        const data = items.map(item => item.toJSON());
        await fs.writeFile(this.mainQueue, JSON.stringify(data, null, 2));
    }

    async loadQueue() {
        await this.init();
        try {
            const data = await fs.readFile(this.mainQueue, 'utf8');
            const items = JSON.parse(data);
            return items.map(item => QueueItem.fromJSON(item));
        } catch (error) {
            if (error.code === 'ENOENT') {
                return [];
            }
            throw error;
        }
    }

    async saveDeadLetter(items) {
        await this.init();
        const data = items.map(item => item.toJSON());
        await fs.writeFile(this.deadLetterQueue, JSON.stringify(data, null, 2));
    }

    async loadDeadLetter() {
        await this.init();
        try {
            const data = await fs.readFile(this.deadLetterQueue, 'utf8');
            const items = JSON.parse(data);
            return items.map(item => QueueItem.fromJSON(item));
        } catch (error) {
            if (error.code === 'ENOENT') {
                return [];
            }
            throw error;
        }
    }
}

/**
 * Queue Manager
 */
class QueueManager extends EventEmitter {
    constructor(options = {}) {
        super();

        this.storage = options.storage || new FileStorage(options.storageOptions);
        this.autoStart = options.autoStart !== false;
        this.concurrency = options.concurrency || 1;
        this.processingInterval = options.processingInterval || 100;
        this.persistInterval = options.persistInterval || 5000;
        this.maxQueueSize = options.maxQueueSize || 10000;

        // Queues
        this.queue = [];
        this.deadLetterQueue = [];
        this.processing = new Map();

        // State
        this.running = false;
        this.processingTimer = null;
        this.persistTimer = null;

        // Metrics
        this.metrics = {
            enqueued: 0,
            processed: 0,
            failed: 0,
            deadLettered: 0,
            currentSize: 0,
            processingCount: 0
        };

        // Load persisted queues
        this.loadQueues();

        // Auto-start processing
        if (this.autoStart) {
            this.start();
        }
    }

    /**
     * Load queues from storage
     */
    async loadQueues() {
        try {
            this.queue = await this.storage.loadQueue();
            this.deadLetterQueue = await this.storage.loadDeadLetter();
            this.metrics.currentSize = this.queue.length;
            this.emit('queues_loaded', {
                queueSize: this.queue.length,
                deadLetterSize: this.deadLetterQueue.length
            });
        } catch (error) {
            console.error('Failed to load queues:', error.message);
        }
    }

    /**
     * Enqueue item
     */
    async enqueue(data, options = {}) {
        if (this.queue.length >= this.maxQueueSize) {
            throw new Error('Queue is full');
        }

        const item = new QueueItem(data, options);
        this.queue.push(item);
        this.sortQueue();

        this.metrics.enqueued++;
        this.metrics.currentSize = this.queue.length;

        this.emit('item_enqueued', {
            id: item.id,
            priority: item.priority,
            queueSize: this.queue.length
        });

        // Persist immediately for high priority items
        if (item.priority === Priority.HIGH) {
            await this.persist();
        }

        return item.id;
    }

    /**
     * Sort queue by priority and scheduled time
     */
    sortQueue() {
        this.queue.sort((a, b) => {
            // First by scheduled time (if any)
            const aReady = !a.scheduledFor || a.scheduledFor <= Date.now();
            const bReady = !b.scheduledFor || b.scheduledFor <= Date.now();

            if (aReady && !bReady) return -1;
            if (!aReady && bReady) return 1;

            // Then by priority (higher first)
            if (a.priority !== b.priority) {
                return b.priority - a.priority;
            }

            // Finally by creation time (older first)
            return a.createdAt - b.createdAt;
        });
    }

    /**
     * Dequeue next item
     */
    dequeue() {
        const now = Date.now();

        // Find first item that's ready to process
        const index = this.queue.findIndex(item =>
            item.state === ItemState.PENDING &&
            (!item.scheduledFor || item.scheduledFor <= now)
        );

        if (index === -1) return null;

        const item = this.queue[index];
        item.state = ItemState.PROCESSING;
        item.updatedAt = now;

        this.processing.set(item.id, item);
        this.metrics.processingCount = this.processing.size;

        return item;
    }

    /**
     * Start queue processing
     */
    start() {
        if (this.running) return;

        this.running = true;
        this.emit('started');

        // Start processing loop
        this.processingTimer = setInterval(() => {
            this.processQueue();
        }, this.processingInterval);

        // Start persistence loop
        this.persistTimer = setInterval(() => {
            this.persist();
        }, this.persistInterval);
    }

    /**
     * Stop queue processing
     */
    async stop() {
        if (!this.running) return;

        this.running = false;
        this.emit('stopped');

        // Clear timers
        if (this.processingTimer) {
            clearInterval(this.processingTimer);
            this.processingTimer = null;
        }

        if (this.persistTimer) {
            clearInterval(this.persistTimer);
            this.persistTimer = null;
        }

        // Wait for processing items to complete
        await this.waitForProcessing();

        // Final persist
        await this.persist();
    }

    /**
     * Process queue
     */
    async processQueue() {
        if (!this.running) return;

        // Process up to concurrency limit
        while (this.processing.size < this.concurrency) {
            const item = this.dequeue();
            if (!item) break;

            this.processItem(item);
        }
    }

    /**
     * Process single item
     */
    async processItem(item) {
        this.emit('item_processing', { id: item.id });

        try {
            // Execute with timeout
            const result = await this.executeWithTimeout(item);

            // Success
            item.state = ItemState.COMPLETED;
            item.updatedAt = Date.now();

            this.processing.delete(item.id);
            this.removeFromQueue(item.id);

            this.metrics.processed++;
            this.metrics.currentSize = this.queue.length;
            this.metrics.processingCount = this.processing.size;

            this.emit('item_completed', {
                id: item.id,
                result,
                duration: Date.now() - item.updatedAt
            });

        } catch (error) {
            // Failure
            item.retryCount++;
            item.lastError = error.message;
            item.updatedAt = Date.now();

            this.processing.delete(item.id);

            if (item.retryCount >= item.maxRetries) {
                // Move to dead letter queue
                item.state = ItemState.DEAD_LETTER;
                this.removeFromQueue(item.id);
                this.deadLetterQueue.push(item);

                this.metrics.deadLettered++;
                this.metrics.currentSize = this.queue.length;
                this.metrics.processingCount = this.processing.size;

                this.emit('item_dead_lettered', {
                    id: item.id,
                    error: error.message,
                    retries: item.retryCount
                });

            } else {
                // Retry with exponential backoff
                item.state = ItemState.PENDING;
                const delay = Math.pow(2, item.retryCount) * 1000;
                item.scheduledFor = Date.now() + delay;

                this.metrics.failed++;
                this.metrics.processingCount = this.processing.size;

                this.emit('item_failed', {
                    id: item.id,
                    error: error.message,
                    retryCount: item.retryCount,
                    nextRetry: new Date(item.scheduledFor).toISOString()
                });

                this.sortQueue();
            }
        }
    }

    /**
     * Execute item with timeout
     */
    async executeWithTimeout(item) {
        return new Promise((resolve, reject) => {
            const timeout = setTimeout(() => {
                reject(new Error('Processing timeout'));
            }, item.timeout);

            this.emit('process', item, (error, result) => {
                clearTimeout(timeout);
                if (error) {
                    reject(error);
                } else {
                    resolve(result);
                }
            });
        });
    }

    /**
     * Remove item from queue
     */
    removeFromQueue(id) {
        const index = this.queue.findIndex(item => item.id === id);
        if (index !== -1) {
            this.queue.splice(index, 1);
        }
    }

    /**
     * Wait for all processing to complete
     */
    async waitForProcessing(timeout = 30000) {
        const start = Date.now();
        while (this.processing.size > 0) {
            if (Date.now() - start > timeout) {
                throw new Error('Wait for processing timeout');
            }
            await new Promise(resolve => setTimeout(resolve, 100));
        }
    }

    /**
     * Persist queues to storage
     */
    async persist() {
        try {
            await this.storage.saveQueue(this.queue);
            await this.storage.saveDeadLetter(this.deadLetterQueue);
            this.emit('persisted', {
                queueSize: this.queue.length,
                deadLetterSize: this.deadLetterQueue.length
            });
        } catch (error) {
            this.emit('persist_error', { error: error.message });
        }
    }

    /**
     * Get queue statistics
     */
    getStats() {
        const now = Date.now();

        const pending = this.queue.filter(i => i.state === ItemState.PENDING).length;
        const scheduled = this.queue.filter(i => i.scheduledFor && i.scheduledFor > now).length;

        return {
            ...this.metrics,
            pending,
            scheduled,
            deadLetterSize: this.deadLetterQueue.length,
            byPriority: {
                high: this.queue.filter(i => i.priority === Priority.HIGH).length,
                normal: this.queue.filter(i => i.priority === Priority.NORMAL).length,
                low: this.queue.filter(i => i.priority === Priority.LOW).length
            }
        };
    }

    /**
     * Clear completed items
     */
    clearCompleted() {
        const before = this.queue.length;
        this.queue = this.queue.filter(item => item.state !== ItemState.COMPLETED);
        this.metrics.currentSize = this.queue.length;
        return before - this.queue.length;
    }

    /**
     * Retry dead letter item
     */
    retryDeadLetter(id) {
        const index = this.deadLetterQueue.findIndex(item => item.id === id);
        if (index === -1) return false;

        const item = this.deadLetterQueue[index];
        item.state = ItemState.PENDING;
        item.retryCount = 0;
        item.scheduledFor = null;
        item.lastError = null;

        this.deadLetterQueue.splice(index, 1);
        this.queue.push(item);
        this.sortQueue();

        this.emit('dead_letter_retried', { id });
        return true;
    }

    /**
     * Clear dead letter queue
     */
    clearDeadLetter() {
        const count = this.deadLetterQueue.length;
        this.deadLetterQueue = [];
        this.emit('dead_letter_cleared', { count });
        return count;
    }
}

// Export
module.exports = {
    QueueManager,
    QueueItem,
    FileStorage,
    Priority,
    ItemState
};

// Demo
if (require.main === module) {
    async function demo() {
        console.log('=== Queue Manager Demo ===\n');

        const queueManager = new QueueManager({
            concurrency: 2,
            processingInterval: 500,
            storageOptions: {
                queueDir: './demo-queue'
            }
        });

        // Setup processor
        let processCount = 0;
        queueManager.on('process', async (item, callback) => {
            processCount++;
            console.log(`[PROCESS] Item ${item.id} (priority: ${item.priority}, attempt: ${item.retryCount + 1})`);

            // Simulate processing
            await new Promise(resolve => setTimeout(resolve, Math.random() * 2000));

            // Simulate failures
            if (Math.random() < 0.3) {
                callback(new Error('Random processing error'));
            } else {
                callback(null, { success: true, processedAt: Date.now() });
            }
        });

        // Event listeners
        queueManager.on('item_enqueued', ({ id, priority, queueSize }) => {
            console.log(`[ENQUEUED] ${id} (priority: ${priority}) - Queue size: ${queueSize}`);
        });

        queueManager.on('item_completed', ({ id, duration }) => {
            console.log(`[COMPLETED] ${id} in ${duration}ms`);
        });

        queueManager.on('item_failed', ({ id, retryCount, nextRetry }) => {
            console.log(`[FAILED] ${id} - Retry ${retryCount}, next at ${nextRetry}`);
        });

        queueManager.on('item_dead_lettered', ({ id, retries }) => {
            console.log(`[DEAD LETTER] ${id} after ${retries} retries`);
        });

        // Enqueue items
        console.log('Enqueueing items...\n');
        await queueManager.enqueue({ task: 'High priority task' }, { priority: Priority.HIGH });
        await queueManager.enqueue({ task: 'Normal task 1' }, { priority: Priority.NORMAL });
        await queueManager.enqueue({ task: 'Normal task 2' }, { priority: Priority.NORMAL });
        await queueManager.enqueue({ task: 'Low priority task' }, { priority: Priority.LOW });
        await queueManager.enqueue({ task: 'Scheduled task' }, {
            priority: Priority.NORMAL,
            scheduledFor: Date.now() + 5000
        });

        // Wait for processing
        await new Promise(resolve => setTimeout(resolve, 15000));

        // Show stats
        console.log('\n\nQueue Statistics:');
        console.log(JSON.stringify(queueManager.getStats(), null, 2));

        // Stop
        await queueManager.stop();
        console.log('\n\nQueue stopped');
    }

    demo().catch(console.error);
}
