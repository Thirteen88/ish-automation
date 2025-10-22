#!/usr/bin/env node

/**
 * Request Batch Processor
 *
 * Intelligently batches similar queries to reduce overhead and improve
 * throughput. Implements time-window batching, size-based batching,
 * and automatic batch optimization.
 *
 * Features:
 * - Time-window batching
 * - Size-based batch optimization
 * - Query similarity detection
 * - Automatic response distribution
 * - Batch priority queuing
 * - Performance metrics
 */

const EventEmitter = require('events');
const crypto = require('crypto');

class BatchRequest {
    constructor(id, query, platformName, options = {}) {
        this.id = id;
        this.query = query;
        this.platformName = platformName;
        this.options = options;
        this.priority = options.priority || 5; // 1-10 scale
        this.createdAt = Date.now();
        this.promise = null;
        this.resolve = null;
        this.reject = null;
        this.fingerprint = this.generateFingerprint();
    }

    generateFingerprint() {
        // Generate a fingerprint for similarity detection
        const normalized = this.query.toLowerCase().trim();
        return crypto.createHash('md5').update(normalized).digest('hex');
    }

    createPromise() {
        this.promise = new Promise((resolve, reject) => {
            this.resolve = resolve;
            this.reject = reject;
        });
        return this.promise;
    }

    getWaitTime() {
        return Date.now() - this.createdAt;
    }
}

class Batch {
    constructor(id, platformName) {
        this.id = id;
        this.platformName = platformName;
        this.requests = [];
        this.createdAt = Date.now();
        this.status = 'pending'; // pending, processing, completed, failed
        this.result = null;
        this.error = null;
    }

    addRequest(request) {
        this.requests.push(request);
    }

    size() {
        return this.requests.length;
    }

    getAge() {
        return Date.now() - this.createdAt;
    }

    getAveragePriority() {
        if (this.requests.length === 0) return 0;
        return this.requests.reduce((sum, r) => sum + r.priority, 0) / this.requests.length;
    }

    async execute(executor) {
        this.status = 'processing';

        try {
            // Execute the batch
            const results = await executor(this.requests);

            // Distribute results
            for (let i = 0; i < this.requests.length; i++) {
                const request = this.requests[i];
                const result = results[i];

                if (result && result.success) {
                    request.resolve(result);
                } else {
                    request.reject(new Error(result?.error || 'Batch execution failed'));
                }
            }

            this.status = 'completed';
            this.result = results;
        } catch (error) {
            this.status = 'failed';
            this.error = error;

            // Reject all requests in the batch
            for (const request of this.requests) {
                request.reject(error);
            }

            throw error;
        }
    }
}

class BatchProcessor extends EventEmitter {
    constructor(config = {}) {
        super();

        this.config = {
            maxBatchSize: config.maxBatchSize || 10,
            minBatchSize: config.minBatchSize || 2,
            batchTimeout: config.batchTimeout || 2000, // 2 seconds
            maxWaitTime: config.maxWaitTime || 5000, // 5 seconds
            enableSimilarityGrouping: config.enableSimilarityGrouping !== false,
            similarityThreshold: config.similarityThreshold || 0.8,
            maxConcurrentBatches: config.maxConcurrentBatches || 5,
            ...config
        };

        this.pendingRequests = new Map(); // platformName -> requests[]
        this.processingBatches = new Map(); // batchId -> Batch
        this.completedBatches = [];
        this.nextRequestId = 1;
        this.nextBatchId = 1;
        this.processingTimer = null;

        // Metrics
        this.metrics = {
            totalRequests: 0,
            totalBatches: 0,
            batchedRequests: 0,
            averageBatchSize: 0,
            averageWaitTime: 0,
            completedBatches: 0,
            failedBatches: 0,
            currentPending: 0,
            currentProcessing: 0
        };
    }

    async submit(query, platformName, options = {}) {
        const requestId = this.nextRequestId++;
        this.metrics.totalRequests++;

        console.log(`[Batch] Submitting request #${requestId} to ${platformName}`);

        // Create request
        const request = new BatchRequest(requestId, query, platformName, options);
        const promise = request.createPromise();

        // Add to pending queue
        if (!this.pendingRequests.has(platformName)) {
            this.pendingRequests.set(platformName, []);
        }
        this.pendingRequests.get(platformName).push(request);
        this.metrics.currentPending++;

        this.emit('requestSubmitted', request);

        // Start processing if not already running
        this.startProcessing();

        return promise;
    }

    startProcessing() {
        if (this.processingTimer) return;

        console.log('[Batch] Starting batch processor...');

        this.processingTimer = setInterval(() => {
            this.processPendingRequests();
        }, 100); // Check every 100ms
    }

    stopProcessing() {
        if (this.processingTimer) {
            clearInterval(this.processingTimer);
            this.processingTimer = null;
            console.log('[Batch] Batch processor stopped');
        }
    }

    async processPendingRequests() {
        for (const [platformName, requests] of this.pendingRequests) {
            if (requests.length === 0) continue;

            // Check if we should create a batch
            const shouldBatch = this.shouldCreateBatch(requests);

            if (shouldBatch) {
                await this.createAndExecuteBatch(platformName, requests);
            }
        }
    }

    shouldCreateBatch(requests) {
        if (requests.length === 0) return false;

        // Check if we have enough requests
        if (requests.length >= this.config.maxBatchSize) {
            return true;
        }

        // Check if oldest request is about to timeout
        const oldestRequest = requests[0];
        if (oldestRequest.getWaitTime() >= this.config.maxWaitTime) {
            return true;
        }

        // Check if we have minimum batch size and timeout elapsed
        if (requests.length >= this.config.minBatchSize) {
            const age = Date.now() - requests[0].createdAt;
            if (age >= this.config.batchTimeout) {
                return true;
            }
        }

        // Check if we're at max concurrent batches capacity
        if (this.processingBatches.size >= this.config.maxConcurrentBatches) {
            return false;
        }

        return false;
    }

    async createAndExecuteBatch(platformName, requests) {
        // Determine batch size
        const batchSize = Math.min(requests.length, this.config.maxBatchSize);

        // Group by similarity if enabled
        let batchRequests;
        if (this.config.enableSimilarityGrouping) {
            batchRequests = this.groupBySimilarity(requests, batchSize);
        } else {
            // Take requests by priority
            batchRequests = requests
                .sort((a, b) => b.priority - a.priority)
                .slice(0, batchSize);
        }

        // Remove from pending
        for (const request of batchRequests) {
            const index = requests.indexOf(request);
            if (index !== -1) {
                requests.splice(index, 1);
                this.metrics.currentPending--;
            }
        }

        // Create batch
        const batchId = this.nextBatchId++;
        const batch = new Batch(batchId, platformName);

        for (const request of batchRequests) {
            batch.addRequest(request);
        }

        console.log(`[Batch] Created batch #${batchId} with ${batch.size()} requests for ${platformName}`);

        this.processingBatches.set(batchId, batch);
        this.metrics.totalBatches++;
        this.metrics.batchedRequests += batch.size();
        this.metrics.currentProcessing++;

        this.emit('batchCreated', batch);

        // Execute batch
        try {
            await batch.execute(this.executeBatch.bind(this));

            this.metrics.completedBatches++;
            this.metrics.currentProcessing--;

            const avgWaitTime = batch.requests.reduce((sum, r) => sum + r.getWaitTime(), 0) / batch.size();
            this.metrics.averageWaitTime = (this.metrics.averageWaitTime + avgWaitTime) / 2;

            console.log(`[Batch] Completed batch #${batchId} (avg wait: ${avgWaitTime.toFixed(0)}ms)`);
            this.emit('batchCompleted', batch);

            // Move to completed
            this.processingBatches.delete(batchId);
            this.completedBatches.push(batch);

            // Keep only last 100 completed batches
            if (this.completedBatches.length > 100) {
                this.completedBatches.shift();
            }
        } catch (error) {
            this.metrics.failedBatches++;
            this.metrics.currentProcessing--;

            console.error(`[Batch] Failed batch #${batchId}:`, error.message);
            this.emit('batchFailed', batch, error);

            this.processingBatches.delete(batchId);
        }

        // Update average batch size
        if (this.metrics.totalBatches > 0) {
            this.metrics.averageBatchSize = this.metrics.batchedRequests / this.metrics.totalBatches;
        }
    }

    groupBySimilarity(requests, maxSize) {
        // Group requests by similarity
        const groups = new Map();

        for (const request of requests) {
            let foundGroup = false;

            for (const [fingerprint, group] of groups) {
                if (this.areSimilar(request.fingerprint, fingerprint)) {
                    group.push(request);
                    foundGroup = true;
                    break;
                }
            }

            if (!foundGroup) {
                groups.set(request.fingerprint, [request]);
            }
        }

        // Find largest group
        let largestGroup = [];
        for (const group of groups.values()) {
            if (group.length > largestGroup.length) {
                largestGroup = group;
            }
        }

        // Return up to maxSize from largest group
        return largestGroup
            .sort((a, b) => b.priority - a.priority)
            .slice(0, maxSize);
    }

    areSimilar(fingerprint1, fingerprint2) {
        // Simple similarity check based on fingerprint
        // In production, could use more sophisticated NLP techniques
        return fingerprint1 === fingerprint2;
    }

    async executeBatch(requests) {
        // This method should be overridden by the user
        // For now, simulate batch execution

        console.log(`[Batch] Executing batch with ${requests.length} requests...`);

        // Simulate processing time based on batch size
        const processingTime = 1000 + (requests.length * 200);
        await new Promise(resolve => setTimeout(resolve, processingTime));

        // Return simulated results
        return requests.map((request, index) => ({
            requestId: request.id,
            query: request.query,
            platform: request.platformName,
            response: `Batch response for request #${request.id}`,
            batchIndex: index,
            success: true,
            timestamp: new Date().toISOString()
        }));
    }

    setExecutor(executor) {
        // Allow setting custom batch executor
        this.executeBatch = executor;
    }

    getMetrics() {
        return {
            ...this.metrics,
            averageBatchSize: this.metrics.averageBatchSize.toFixed(2),
            averageWaitTime: `${this.metrics.averageWaitTime.toFixed(0)}ms`,
            batchingEfficiency: this.metrics.totalRequests > 0
                ? `${((this.metrics.batchedRequests / this.metrics.totalRequests) * 100).toFixed(2)}%`
                : '0%',
            pendingByPlatform: Object.fromEntries(
                Array.from(this.pendingRequests.entries()).map(([platform, reqs]) => [platform, reqs.length])
            ),
            timestamp: new Date().toISOString()
        };
    }

    async drain() {
        console.log('[Batch] Draining pending requests...');

        while (this.metrics.currentPending > 0 || this.metrics.currentProcessing > 0) {
            console.log(`[Batch] Waiting: ${this.metrics.currentPending} pending, ${this.metrics.currentProcessing} processing...`);
            await new Promise(resolve => setTimeout(resolve, 500));
        }

        console.log('[Batch] All requests processed');
    }

    async shutdown() {
        console.log('[Batch] Shutting down batch processor...');

        this.stopProcessing();

        // Reject all pending requests
        for (const [platformName, requests] of this.pendingRequests) {
            for (const request of requests) {
                request.reject(new Error('Batch processor shutting down'));
            }
        }

        this.pendingRequests.clear();

        this.emit('shutdown', this.getMetrics());
        console.log('[Batch] Batch processor shut down successfully');
    }
}

module.exports = { BatchProcessor, Batch, BatchRequest };

// Demo
if (require.main === module) {
    async function demo() {
        const processor = new BatchProcessor({
            maxBatchSize: 5,
            minBatchSize: 2,
            batchTimeout: 1000,
            maxWaitTime: 3000
        });

        // Listen to events
        processor.on('requestSubmitted', (request) => {
            console.log(`✓ Request #${request.id} submitted (priority: ${request.priority})`);
        });

        processor.on('batchCreated', (batch) => {
            console.log(`✓ Batch #${batch.id} created with ${batch.size()} requests`);
        });

        processor.on('batchCompleted', (batch) => {
            console.log(`✓ Batch #${batch.id} completed`);
        });

        console.log('=== Testing batch processor ===\n');

        // Submit requests with different priorities
        const promises = [];

        console.log('Submitting 15 requests...\n');

        for (let i = 1; i <= 15; i++) {
            const priority = Math.floor(Math.random() * 10) + 1;
            const promise = processor.submit(
                `Query ${i}: What is the meaning of life?`,
                'huggingchat',
                { priority }
            );
            promises.push(promise);

            // Small delay between submissions
            await new Promise(resolve => setTimeout(resolve, 100));
        }

        console.log('\nWaiting for all requests to complete...\n');

        // Wait for all requests
        const results = await Promise.all(promises);

        console.log(`\nReceived ${results.length} responses`);

        console.log('\n=== Batch metrics ===\n');
        console.log(JSON.stringify(processor.getMetrics(), null, 2));

        await processor.shutdown();
    }

    demo().catch(console.error);
}
