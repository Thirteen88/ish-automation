#!/usr/bin/env node

/**
 * Browser Instance Connection Pool
 *
 * Manages a pool of reusable browser instances for optimal resource usage
 * and performance. Implements health checks, connection reuse, and automatic
 * cleanup strategies.
 *
 * Features:
 * - Dynamic pool sizing (min: 2, max: 10)
 * - Connection health monitoring
 * - Automatic connection recycling
 * - Pool metrics and telemetry
 * - Graceful degradation
 */

const { chromium } = require('playwright');
const EventEmitter = require('events');

class BrowserConnection {
    constructor(id, browser, config = {}) {
        this.id = id;
        this.browser = browser;
        this.context = null;
        this.page = null;
        this.inUse = false;
        this.createdAt = Date.now();
        this.lastUsed = Date.now();
        this.useCount = 0;
        this.failureCount = 0;
        this.config = config;
        this.healthy = true;
    }

    async initialize() {
        try {
            this.context = await this.browser.newContext({
                viewport: { width: 1920, height: 1080 },
                userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                locale: 'en-US',
                permissions: ['clipboard-read', 'clipboard-write']
            });

            this.page = await this.context.newPage();
            this.healthy = true;
            return true;
        } catch (error) {
            console.error(`[Pool] Failed to initialize connection ${this.id}:`, error.message);
            this.healthy = false;
            return false;
        }
    }

    async healthCheck() {
        try {
            if (!this.browser || !this.browser.isConnected()) {
                this.healthy = false;
                return false;
            }

            if (this.page) {
                // Try a simple operation to verify page is responsive
                await this.page.evaluate(() => true);
            }

            this.healthy = true;
            return true;
        } catch (error) {
            this.healthy = false;
            return false;
        }
    }

    async reset() {
        try {
            if (this.page) {
                await this.page.close();
            }
            if (this.context) {
                await this.context.close();
            }

            await this.initialize();
            this.failureCount = 0;
            return true;
        } catch (error) {
            console.error(`[Pool] Failed to reset connection ${this.id}:`, error.message);
            return false;
        }
    }

    async close() {
        try {
            if (this.page) await this.page.close();
            if (this.context) await this.context.close();
            if (this.browser) await this.browser.close();
        } catch (error) {
            console.error(`[Pool] Error closing connection ${this.id}:`, error.message);
        }
    }

    markUsed() {
        this.inUse = true;
        this.lastUsed = Date.now();
        this.useCount++;
    }

    markAvailable() {
        this.inUse = false;
        this.lastUsed = Date.now();
    }

    markFailure() {
        this.failureCount++;
        if (this.failureCount >= 3) {
            this.healthy = false;
        }
    }

    getAge() {
        return Date.now() - this.createdAt;
    }

    getIdleTime() {
        return Date.now() - this.lastUsed;
    }
}

class ConnectionPool extends EventEmitter {
    constructor(config = {}) {
        super();

        this.config = {
            minConnections: config.minConnections || 2,
            maxConnections: config.maxConnections || 10,
            maxIdleTime: config.maxIdleTime || 300000, // 5 minutes
            maxConnectionAge: config.maxConnectionAge || 3600000, // 1 hour
            maxConnectionUses: config.maxConnectionUses || 100,
            healthCheckInterval: config.healthCheckInterval || 60000, // 1 minute
            acquisitionTimeout: config.acquisitionTimeout || 30000, // 30 seconds
            headless: config.headless !== false,
            ...config
        };

        this.connections = new Map();
        this.waitQueue = [];
        this.nextConnectionId = 1;
        this.healthCheckTimer = null;
        this.cleanupTimer = null;
        this.initialized = false;

        // Metrics
        this.metrics = {
            totalCreated: 0,
            totalDestroyed: 0,
            totalAcquisitions: 0,
            totalReleases: 0,
            totalFailures: 0,
            totalHealthChecks: 0,
            acquisitionTimeouts: 0,
            currentSize: 0,
            currentInUse: 0,
            waitQueueSize: 0
        };
    }

    async initialize() {
        console.log('[Pool] Initializing connection pool...');
        console.log(`[Pool] Config: min=${this.config.minConnections}, max=${this.config.maxConnections}`);

        // Create minimum connections
        for (let i = 0; i < this.config.minConnections; i++) {
            await this.createConnection();
        }

        // Start background tasks
        this.startHealthChecks();
        this.startCleanupTask();

        this.initialized = true;
        this.emit('initialized', this.getMetrics());
        console.log('[Pool] Connection pool initialized successfully');
    }

    async createConnection() {
        const connectionId = this.nextConnectionId++;
        console.log(`[Pool] Creating connection #${connectionId}...`);

        try {
            const browser = await chromium.launch({
                headless: this.config.headless,
                args: [
                    '--no-sandbox',
                    '--disable-setuid-sandbox',
                    '--disable-blink-features=AutomationControlled',
                    '--disable-dev-shm-usage'
                ]
            });

            const connection = new BrowserConnection(connectionId, browser, this.config);
            await connection.initialize();

            this.connections.set(connectionId, connection);
            this.metrics.totalCreated++;
            this.metrics.currentSize++;

            this.emit('connectionCreated', connectionId);
            console.log(`[Pool] Connection #${connectionId} created successfully`);

            return connection;
        } catch (error) {
            console.error(`[Pool] Failed to create connection #${connectionId}:`, error.message);
            this.metrics.totalFailures++;
            throw error;
        }
    }

    async acquire(timeout = null) {
        const acquisitionTimeout = timeout || this.config.acquisitionTimeout;
        const startTime = Date.now();

        console.log('[Pool] Acquiring connection from pool...');
        this.metrics.totalAcquisitions++;

        return new Promise((resolve, reject) => {
            const timeoutId = setTimeout(() => {
                this.metrics.acquisitionTimeouts++;
                const index = this.waitQueue.findIndex(item => item.resolve === resolve);
                if (index !== -1) {
                    this.waitQueue.splice(index, 1);
                    this.metrics.waitQueueSize = this.waitQueue.length;
                }
                reject(new Error(`Connection acquisition timeout after ${acquisitionTimeout}ms`));
            }, acquisitionTimeout);

            const tryAcquire = async () => {
                try {
                    // Find available healthy connection
                    for (const [id, conn] of this.connections) {
                        if (!conn.inUse && conn.healthy) {
                            // Verify health before use
                            const isHealthy = await conn.healthCheck();
                            if (isHealthy) {
                                conn.markUsed();
                                this.metrics.currentInUse++;
                                clearTimeout(timeoutId);

                                const acquisitionTime = Date.now() - startTime;
                                console.log(`[Pool] Acquired connection #${conn.id} (took ${acquisitionTime}ms)`);
                                this.emit('connectionAcquired', conn.id, acquisitionTime);

                                return resolve(conn);
                            } else {
                                // Connection unhealthy, reset it
                                await conn.reset();
                            }
                        }
                    }

                    // No available connections, try to create new one
                    if (this.connections.size < this.config.maxConnections) {
                        const conn = await this.createConnection();
                        conn.markUsed();
                        this.metrics.currentInUse++;
                        clearTimeout(timeoutId);

                        const acquisitionTime = Date.now() - startTime;
                        console.log(`[Pool] Created and acquired new connection #${conn.id} (took ${acquisitionTime}ms)`);
                        this.emit('connectionAcquired', conn.id, acquisitionTime);

                        return resolve(conn);
                    }

                    // Pool at capacity, add to wait queue
                    this.waitQueue.push({ resolve, reject, timestamp: Date.now() });
                    this.metrics.waitQueueSize = this.waitQueue.length;
                    console.log(`[Pool] No connections available, queued (queue size: ${this.waitQueue.length})`);
                } catch (error) {
                    clearTimeout(timeoutId);
                    reject(error);
                }
            };

            tryAcquire();
        });
    }

    async release(connection) {
        if (!connection) return;

        console.log(`[Pool] Releasing connection #${connection.id}...`);
        connection.markAvailable();
        this.metrics.currentInUse--;
        this.metrics.totalReleases++;

        // Check if connection should be retired
        const shouldRetire = this.shouldRetireConnection(connection);
        if (shouldRetire) {
            console.log(`[Pool] Connection #${connection.id} should be retired: ${shouldRetire}`);
            await this.destroyConnection(connection.id);

            // Create replacement if below minimum
            if (this.connections.size < this.config.minConnections) {
                await this.createConnection();
            }
        }

        this.emit('connectionReleased', connection.id);

        // Process wait queue
        if (this.waitQueue.length > 0) {
            const waiter = this.waitQueue.shift();
            this.metrics.waitQueueSize = this.waitQueue.length;

            console.log(`[Pool] Processing queued request (${this.waitQueue.length} remaining)`);

            try {
                const conn = await this.acquire(30000);
                waiter.resolve(conn);
            } catch (error) {
                waiter.reject(error);
            }
        }
    }

    shouldRetireConnection(connection) {
        // Check connection age
        if (connection.getAge() > this.config.maxConnectionAge) {
            return 'max age exceeded';
        }

        // Check use count
        if (connection.useCount >= this.config.maxConnectionUses) {
            return 'max uses exceeded';
        }

        // Check health
        if (!connection.healthy) {
            return 'unhealthy';
        }

        // Check failure count
        if (connection.failureCount >= 3) {
            return 'too many failures';
        }

        return null;
    }

    async destroyConnection(connectionId) {
        const connection = this.connections.get(connectionId);
        if (!connection) return;

        console.log(`[Pool] Destroying connection #${connectionId}...`);

        await connection.close();
        this.connections.delete(connectionId);
        this.metrics.totalDestroyed++;
        this.metrics.currentSize--;

        this.emit('connectionDestroyed', connectionId);
    }

    startHealthChecks() {
        console.log(`[Pool] Starting health checks (interval: ${this.config.healthCheckInterval}ms)`);

        this.healthCheckTimer = setInterval(async () => {
            console.log('[Pool] Running health checks...');
            this.metrics.totalHealthChecks++;

            for (const [id, conn] of this.connections) {
                if (!conn.inUse) {
                    const isHealthy = await conn.healthCheck();
                    if (!isHealthy) {
                        console.log(`[Pool] Connection #${id} failed health check, destroying...`);
                        await this.destroyConnection(id);

                        // Create replacement if below minimum
                        if (this.connections.size < this.config.minConnections) {
                            await this.createConnection();
                        }
                    }
                }
            }

            this.emit('healthCheckCompleted', this.getMetrics());
        }, this.config.healthCheckInterval);
    }

    startCleanupTask() {
        console.log('[Pool] Starting cleanup task...');

        this.cleanupTimer = setInterval(async () => {
            console.log('[Pool] Running cleanup task...');

            for (const [id, conn] of this.connections) {
                // Skip connections in use
                if (conn.inUse) continue;

                // Close idle connections above minimum
                const idleTime = conn.getIdleTime();
                if (idleTime > this.config.maxIdleTime && this.connections.size > this.config.minConnections) {
                    console.log(`[Pool] Connection #${id} idle for ${idleTime}ms, destroying...`);
                    await this.destroyConnection(id);
                }
            }

            this.emit('cleanupCompleted', this.getMetrics());
        }, this.config.maxIdleTime / 2);
    }

    getMetrics() {
        return {
            ...this.metrics,
            connections: Array.from(this.connections.values()).map(conn => ({
                id: conn.id,
                inUse: conn.inUse,
                healthy: conn.healthy,
                age: conn.getAge(),
                idleTime: conn.getIdleTime(),
                useCount: conn.useCount,
                failureCount: conn.failureCount
            })),
            timestamp: new Date().toISOString()
        };
    }

    async drain() {
        console.log('[Pool] Draining connection pool...');

        // Wait for all connections to be released
        const maxWaitTime = 30000;
        const startTime = Date.now();

        while (this.metrics.currentInUse > 0 && Date.now() - startTime < maxWaitTime) {
            console.log(`[Pool] Waiting for ${this.metrics.currentInUse} connections to be released...`);
            await new Promise(resolve => setTimeout(resolve, 1000));
        }

        if (this.metrics.currentInUse > 0) {
            console.warn(`[Pool] Timeout waiting for connections, ${this.metrics.currentInUse} still in use`);
        }
    }

    async shutdown() {
        console.log('[Pool] Shutting down connection pool...');

        // Stop background tasks
        if (this.healthCheckTimer) {
            clearInterval(this.healthCheckTimer);
        }
        if (this.cleanupTimer) {
            clearInterval(this.cleanupTimer);
        }

        // Drain the pool
        await this.drain();

        // Close all connections
        for (const [id, conn] of this.connections) {
            await this.destroyConnection(id);
        }

        // Reject all queued requests
        while (this.waitQueue.length > 0) {
            const waiter = this.waitQueue.shift();
            waiter.reject(new Error('Connection pool shutting down'));
        }

        this.initialized = false;
        this.emit('shutdown', this.getMetrics());
        console.log('[Pool] Connection pool shut down successfully');
    }
}

module.exports = { ConnectionPool, BrowserConnection };

// Demo
if (require.main === module) {
    async function demo() {
        const pool = new ConnectionPool({
            minConnections: 2,
            maxConnections: 5,
            headless: true
        });

        // Listen to events
        pool.on('connectionCreated', (id) => console.log(`✓ Connection #${id} created`));
        pool.on('connectionAcquired', (id, time) => console.log(`✓ Connection #${id} acquired in ${time}ms`));
        pool.on('connectionReleased', (id) => console.log(`✓ Connection #${id} released`));

        await pool.initialize();

        console.log('\n=== Testing connection acquisition ===');
        const conn1 = await pool.acquire();
        console.log(`Got connection #${conn1.id}`);

        const conn2 = await pool.acquire();
        console.log(`Got connection #${conn2.id}`);

        console.log('\n=== Pool metrics ===');
        console.log(JSON.stringify(pool.getMetrics(), null, 2));

        console.log('\n=== Releasing connections ===');
        await pool.release(conn1);
        await pool.release(conn2);

        console.log('\n=== Final metrics ===');
        console.log(JSON.stringify(pool.getMetrics(), null, 2));

        await pool.shutdown();
    }

    demo().catch(console.error);
}
