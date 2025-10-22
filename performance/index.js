#!/usr/bin/env node

/**
 * Performance Optimization Layer - Integration Module
 *
 * Integrates all performance optimization components into a unified system
 * for production deployment. Provides a single interface to manage connection
 * pooling, caching, batching, load balancing, query optimization, and monitoring.
 */

const { ConnectionPool } = require('./connection-pool');
const { CacheManager } = require('./cache-manager');
const { BatchProcessor } = require('./batch-processor');
const { LoadBalancer } = require('./load-balancer');
const { QueryOptimizer } = require('./query-optimizer');
const { PerformanceMonitor } = require('./perf-monitor');
const EventEmitter = require('events');

class PerformanceOptimizationLayer extends EventEmitter {
    constructor(config = {}) {
        super();

        this.config = {
            // Connection Pool
            connectionPool: {
                minConnections: 2,
                maxConnections: 10,
                healthCheckInterval: 60000,
                ...config.connectionPool
            },
            // Cache
            cache: {
                enableCompression: true,
                l1MaxSize: 1000,
                warmingEnabled: true,
                ...config.cache
            },
            // Batch Processor
            batchProcessor: {
                maxBatchSize: 10,
                batchTimeout: 2000,
                enableSimilarityGrouping: true,
                ...config.batchProcessor
            },
            // Load Balancer
            loadBalancer: {
                algorithm: 'least-connections',
                enableStickySession: true,
                healthCheckInterval: 60000,
                ...config.loadBalancer
            },
            // Query Optimizer
            queryOptimizer: {
                enableDeduplication: true,
                enablePrediction: true,
                enableSmartRouting: true,
                ...config.queryOptimizer
            },
            // Performance Monitor
            perfMonitor: {
                enableAlerts: true,
                reportInterval: 60000,
                ...config.perfMonitor
            },
            ...config
        };

        this.components = {
            connectionPool: null,
            cache: null,
            batchProcessor: null,
            loadBalancer: null,
            queryOptimizer: null,
            perfMonitor: null
        };

        this.initialized = false;
    }

    async initialize() {
        console.log('[Performance] Initializing performance optimization layer...');

        try {
            // Initialize Connection Pool
            this.components.connectionPool = new ConnectionPool(this.config.connectionPool);
            await this.components.connectionPool.initialize();
            console.log('[Performance] ✓ Connection pool initialized');

            // Initialize Cache Manager
            this.components.cache = new CacheManager(this.config.cache);
            this.components.cache.startWarming();
            console.log('[Performance] ✓ Cache manager initialized');

            // Initialize Batch Processor
            this.components.batchProcessor = new BatchProcessor(this.config.batchProcessor);
            console.log('[Performance] ✓ Batch processor initialized');

            // Initialize Load Balancer
            this.components.loadBalancer = new LoadBalancer(this.config.loadBalancer);

            // Register default platforms
            this.components.loadBalancer.registerPlatform('huggingchat', {
                weight: 3,
                priority: 10,
                maxConnections: 50,
                rateLimit: 60
            });
            this.components.loadBalancer.registerPlatform('claude', {
                weight: 2,
                priority: 9,
                maxConnections: 30,
                rateLimit: 50
            });
            this.components.loadBalancer.registerPlatform('chatgpt', {
                weight: 2,
                priority: 8,
                maxConnections: 30,
                rateLimit: 50
            });

            this.components.loadBalancer.startHealthChecks();
            console.log('[Performance] ✓ Load balancer initialized');

            // Initialize Query Optimizer
            this.components.queryOptimizer = new QueryOptimizer(this.config.queryOptimizer);
            console.log('[Performance] ✓ Query optimizer initialized');

            // Initialize Performance Monitor
            this.components.perfMonitor = new PerformanceMonitor(this.config.perfMonitor);
            this.components.perfMonitor.startMonitoring();
            console.log('[Performance] ✓ Performance monitor initialized');

            // Wire up event listeners
            this.setupEventListeners();

            this.initialized = true;
            this.emit('initialized');

            console.log('[Performance] Performance optimization layer initialized successfully');

            return true;
        } catch (error) {
            console.error('[Performance] Failed to initialize:', error.message);
            throw error;
        }
    }

    setupEventListeners() {
        // Monitor alerts
        this.components.perfMonitor.on('alert', (alert) => {
            this.emit('alert', alert);
        });

        this.components.perfMonitor.on('bottlenecksDetected', (bottlenecks) => {
            this.emit('bottlenecksDetected', bottlenecks);
        });

        // Connection pool events
        this.components.connectionPool.on('connectionCreated', (id) => {
            this.components.perfMonitor.recordComponentMetric('connectionPool', {
                value: this.components.connectionPool.getMetrics().currentSize
            });
        });

        // Cache events
        this.components.cache.on('hit', (tier, key) => {
            const metrics = this.components.cache.getMetrics();
            const hitRate = parseFloat(metrics.hitRate) / 100;
            this.components.perfMonitor.recordComponentMetric('cache', { value: hitRate });
        });
    }

    async processQuery(query, options = {}) {
        if (!this.initialized) {
            throw new Error('Performance layer not initialized');
        }

        const startTime = Date.now();
        const clientId = options.clientId || 'anonymous';

        try {
            // Step 1: Query Optimization
            const optimized = await this.components.queryOptimizer.optimize(query, options);

            // If result was predicted/cached, return immediately
            if (optimized.cached || optimized.predicted || optimized.duplicate) {
                const duration = Date.now() - startTime;
                return {
                    query,
                    response: optimized.result || optimized,
                    optimized: true,
                    cached: true,
                    duration,
                    metadata: optimized.metadata
                };
            }

            // Step 2: Load Balancing
            const route = await this.components.loadBalancer.route(query, {
                clientId,
                sessionId: options.sessionId,
                preferredPlatforms: optimized.recommendedPlatforms
            });

            // Step 3: Cache Check
            const cacheKey = `${route.platform}:${query}`;
            const cached = await this.components.cache.get(cacheKey);

            if (cached) {
                route.onComplete(true);
                const duration = Date.now() - startTime;

                return {
                    query,
                    response: cached,
                    platform: route.platform,
                    optimized: true,
                    cached: true,
                    duration,
                    metadata: optimized.metadata
                };
            }

            // Step 4: Batch Processing (optional)
            if (options.enableBatching) {
                const batchResult = await this.components.batchProcessor.submit(
                    query,
                    route.platform,
                    { priority: optimized.priority }
                );

                route.onComplete(batchResult.success);

                // Cache result
                if (batchResult.success) {
                    await this.components.cache.set(cacheKey, batchResult.response);
                }

                const duration = Date.now() - startTime;

                return {
                    query,
                    response: batchResult.response,
                    platform: route.platform,
                    optimized: true,
                    batched: true,
                    duration,
                    metadata: optimized.metadata
                };
            }

            // Step 5: Execute Query (would integrate with browser automation)
            // For now, simulate execution
            const connection = await this.components.connectionPool.acquire();

            try {
                // Simulate query execution
                await new Promise(resolve => setTimeout(resolve, Math.random() * 2000 + 500));

                const response = {
                    text: `Simulated response for: ${query}`,
                    platform: route.platform,
                    timestamp: new Date().toISOString()
                };

                // Cache result
                await this.components.cache.set(cacheKey, response);

                // Cache in optimizer
                this.components.queryOptimizer.cacheResult(
                    { hash: optimized.hash, text: query },
                    response
                );

                route.onComplete(true);

                const duration = Date.now() - startTime;

                return {
                    query,
                    response,
                    platform: route.platform,
                    optimized: true,
                    duration,
                    metadata: optimized.metadata
                };

            } finally {
                await this.components.connectionPool.release(connection);
            }

        } catch (error) {
            console.error('[Performance] Query processing error:', error.message);

            const duration = Date.now() - startTime;

            return {
                query,
                error: error.message,
                success: false,
                duration,
                metadata: options.metadata || {}
            };
        }
    }

    getMetrics() {
        return {
            connectionPool: this.components.connectionPool.getMetrics(),
            cache: this.components.cache.getMetrics(),
            batchProcessor: this.components.batchProcessor.getMetrics(),
            loadBalancer: this.components.loadBalancer.getMetrics(),
            queryOptimizer: this.components.queryOptimizer.getMetrics(),
            perfMonitor: this.components.perfMonitor.getReport(),
            timestamp: new Date().toISOString()
        };
    }

    async shutdown() {
        console.log('[Performance] Shutting down performance optimization layer...');

        if (this.components.connectionPool) {
            await this.components.connectionPool.shutdown();
        }

        if (this.components.cache) {
            await this.components.cache.shutdown();
        }

        if (this.components.batchProcessor) {
            await this.components.batchProcessor.shutdown();
        }

        if (this.components.loadBalancer) {
            await this.components.loadBalancer.shutdown();
        }

        if (this.components.queryOptimizer) {
            await this.components.queryOptimizer.shutdown();
        }

        if (this.components.perfMonitor) {
            await this.components.perfMonitor.shutdown();
        }

        this.initialized = false;
        this.emit('shutdown');

        console.log('[Performance] Performance optimization layer shut down successfully');
    }
}

module.exports = { PerformanceOptimizationLayer };

// Demo
if (require.main === module) {
    async function demo() {
        const perfLayer = new PerformanceOptimizationLayer({
            connectionPool: { minConnections: 2, maxConnections: 5 },
            cache: { l1MaxSize: 100 },
            batchProcessor: { maxBatchSize: 5 },
            loadBalancer: { algorithm: 'least-connections' }
        });

        // Listen to alerts
        perfLayer.on('alert', (alert) => {
            console.log(`\n🚨 ALERT [${alert.severity}]: ${alert.message}\n`);
        });

        await perfLayer.initialize();

        console.log('\n=== Testing integrated performance layer ===\n');

        // Process multiple queries
        const queries = [
            'What is AI?',
            'Explain machine learning',
            'What is AI?', // Duplicate - should be optimized
            'How does deep learning work?',
            'What is artificial intelligence?' // Similar - should be optimized
        ];

        for (const query of queries) {
            console.log(`\nProcessing: "${query}"`);
            const result = await perfLayer.processQuery(query);
            console.log(`Result: ${result.cached ? 'CACHED' : 'EXECUTED'} in ${result.duration}ms`);
        }

        console.log('\n=== Performance Metrics ===\n');
        const metrics = perfLayer.getMetrics();
        console.log(JSON.stringify(metrics, null, 2));

        await perfLayer.shutdown();
    }

    demo().catch(console.error);
}
