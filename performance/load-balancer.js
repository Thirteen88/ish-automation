#!/usr/bin/env node

/**
 * Load Balancer
 *
 * Distributes requests across multiple AI platforms using various
 * load balancing algorithms. Supports health checks, sticky sessions,
 * rate limiting, and automatic failover.
 *
 * Features:
 * - Multiple algorithms: round-robin, least-connections, weighted, response-time
 * - Health-based routing
 * - Sticky sessions support
 * - Per-client rate limiting
 * - Platform weights and priorities
 * - Automatic failover
 * - Circuit breaker pattern
 */

const EventEmitter = require('events');
const crypto = require('crypto');

class Platform {
    constructor(name, config = {}) {
        this.name = name;
        this.weight = config.weight || 1;
        this.priority = config.priority || 5; // 1-10 scale
        this.maxConnections = config.maxConnections || 100;
        this.rateLimit = config.rateLimit || 60; // requests per minute
        this.enabled = config.enabled !== false;

        // State
        this.activeConnections = 0;
        this.totalRequests = 0;
        this.successfulRequests = 0;
        this.failedRequests = 0;
        this.totalResponseTime = 0;
        this.lastRequestTime = 0;
        this.healthy = true;
        this.healthCheckFailures = 0;

        // Circuit breaker
        this.circuitState = 'closed'; // closed, open, half-open
        this.circuitOpenedAt = null;
        this.circuitTimeout = config.circuitTimeout || 60000; // 1 minute

        // Rate limiting
        this.requestTimestamps = [];
    }

    canAcceptRequest() {
        if (!this.enabled) return false;
        if (!this.healthy) return false;
        if (this.circuitState === 'open') {
            // Check if circuit should be half-opened
            if (Date.now() - this.circuitOpenedAt >= this.circuitTimeout) {
                this.circuitState = 'half-open';
                console.log(`[LB] Circuit half-opened for ${this.name}`);
            } else {
                return false;
            }
        }
        if (this.activeConnections >= this.maxConnections) return false;
        if (!this.checkRateLimit()) return false;
        return true;
    }

    checkRateLimit() {
        const now = Date.now();
        const oneMinuteAgo = now - 60000;

        // Remove old timestamps
        this.requestTimestamps = this.requestTimestamps.filter(ts => ts > oneMinuteAgo);

        return this.requestTimestamps.length < this.rateLimit;
    }

    recordRequest() {
        this.activeConnections++;
        this.totalRequests++;
        this.lastRequestTime = Date.now();
        this.requestTimestamps.push(Date.now());
    }

    recordResponse(success, responseTime) {
        this.activeConnections--;
        this.totalResponseTime += responseTime;

        if (success) {
            this.successfulRequests++;

            // Close circuit if half-open and request succeeded
            if (this.circuitState === 'half-open') {
                this.circuitState = 'closed';
                this.healthCheckFailures = 0;
                console.log(`[LB] Circuit closed for ${this.name}`);
            }
        } else {
            this.failedRequests++;
            this.healthCheckFailures++;

            // Open circuit if too many failures
            if (this.healthCheckFailures >= 5 && this.circuitState === 'closed') {
                this.circuitState = 'open';
                this.circuitOpenedAt = Date.now();
                this.healthy = false;
                console.log(`[LB] Circuit opened for ${this.name}`);
            }
        }
    }

    getAverageResponseTime() {
        if (this.successfulRequests === 0) return Infinity;
        return this.totalResponseTime / this.successfulRequests;
    }

    getSuccessRate() {
        if (this.totalRequests === 0) return 1;
        return this.successfulRequests / this.totalRequests;
    }

    getLoad() {
        return this.activeConnections / this.maxConnections;
    }

    reset() {
        this.activeConnections = 0;
        this.healthCheckFailures = 0;
        this.healthy = true;
        this.circuitState = 'closed';
    }

    getStats() {
        return {
            name: this.name,
            enabled: this.enabled,
            healthy: this.healthy,
            weight: this.weight,
            priority: this.priority,
            activeConnections: this.activeConnections,
            maxConnections: this.maxConnections,
            load: `${(this.getLoad() * 100).toFixed(2)}%`,
            totalRequests: this.totalRequests,
            successfulRequests: this.successfulRequests,
            failedRequests: this.failedRequests,
            successRate: `${(this.getSuccessRate() * 100).toFixed(2)}%`,
            averageResponseTime: `${this.getAverageResponseTime().toFixed(0)}ms`,
            circuitState: this.circuitState,
            rateLimit: `${this.requestTimestamps.length}/${this.rateLimit} per minute`
        };
    }
}

class LoadBalancer extends EventEmitter {
    constructor(config = {}) {
        super();

        this.config = {
            algorithm: config.algorithm || 'least-connections', // round-robin, least-connections, weighted, response-time
            enableStickySession: config.enableStickySession !== false,
            sessionTimeout: config.sessionTimeout || 300000, // 5 minutes
            healthCheckInterval: config.healthCheckInterval || 60000, // 1 minute
            enableClientRateLimiting: config.enableClientRateLimiting !== false,
            clientRateLimit: config.clientRateLimit || 100, // requests per minute per client
            ...config
        };

        this.platforms = new Map();
        this.sessions = new Map(); // sessionId -> platformName
        this.clientRequests = new Map(); // clientId -> timestamps[]
        this.roundRobinIndex = 0;
        this.healthCheckTimer = null;

        // Metrics
        this.metrics = {
            totalRequests: 0,
            successfulRequests: 0,
            failedRequests: 0,
            routingErrors: 0,
            rateLimitedClients: 0,
            activeRoutes: 0
        };
    }

    registerPlatform(name, config = {}) {
        console.log(`[LB] Registering platform: ${name}`);
        const platform = new Platform(name, config);
        this.platforms.set(name, platform);
        this.emit('platformRegistered', name);
        return this;
    }

    async selectPlatform(options = {}) {
        const { clientId = null, sessionId = null, excludePlatforms = [] } = options;

        // Check client rate limit
        if (clientId && this.config.enableClientRateLimiting) {
            if (!this.checkClientRateLimit(clientId)) {
                this.metrics.rateLimitedClients++;
                throw new Error(`Client ${clientId} rate limited`);
            }
        }

        // Check for sticky session
        if (sessionId && this.config.enableStickySession) {
            const sessionPlatform = this.sessions.get(sessionId);
            if (sessionPlatform) {
                const platform = this.platforms.get(sessionPlatform);
                if (platform && platform.canAcceptRequest()) {
                    console.log(`[LB] Using sticky session: ${sessionPlatform}`);
                    return platform;
                } else {
                    // Session platform unavailable, remove session
                    this.sessions.delete(sessionId);
                }
            }
        }

        // Get available platforms
        const availablePlatforms = Array.from(this.platforms.values())
            .filter(p => p.canAcceptRequest() && !excludePlatforms.includes(p.name));

        if (availablePlatforms.length === 0) {
            this.metrics.routingErrors++;
            throw new Error('No available platforms');
        }

        // Select platform based on algorithm
        let selectedPlatform;

        switch (this.config.algorithm) {
            case 'round-robin':
                selectedPlatform = this.selectRoundRobin(availablePlatforms);
                break;

            case 'least-connections':
                selectedPlatform = this.selectLeastConnections(availablePlatforms);
                break;

            case 'weighted':
                selectedPlatform = this.selectWeighted(availablePlatforms);
                break;

            case 'response-time':
                selectedPlatform = this.selectByResponseTime(availablePlatforms);
                break;

            default:
                selectedPlatform = this.selectLeastConnections(availablePlatforms);
        }

        // Create sticky session if enabled
        if (sessionId && this.config.enableStickySession) {
            this.sessions.set(sessionId, selectedPlatform.name);
            setTimeout(() => {
                this.sessions.delete(sessionId);
            }, this.config.sessionTimeout);
        }

        // Record client request
        if (clientId) {
            this.recordClientRequest(clientId);
        }

        console.log(`[LB] Selected platform: ${selectedPlatform.name} (algorithm: ${this.config.algorithm})`);
        this.emit('platformSelected', selectedPlatform.name, this.config.algorithm);

        return selectedPlatform;
    }

    selectRoundRobin(platforms) {
        const platform = platforms[this.roundRobinIndex % platforms.length];
        this.roundRobinIndex++;
        return platform;
    }

    selectLeastConnections(platforms) {
        return platforms.reduce((min, p) =>
            p.activeConnections < min.activeConnections ? p : min
        );
    }

    selectWeighted(platforms) {
        // Weighted random selection
        const totalWeight = platforms.reduce((sum, p) => sum + p.weight, 0);
        let random = Math.random() * totalWeight;

        for (const platform of platforms) {
            random -= platform.weight;
            if (random <= 0) {
                return platform;
            }
        }

        return platforms[platforms.length - 1];
    }

    selectByResponseTime(platforms) {
        // Select platform with best average response time
        return platforms.reduce((best, p) =>
            p.getAverageResponseTime() < best.getAverageResponseTime() ? p : best
        );
    }

    checkClientRateLimit(clientId) {
        const now = Date.now();
        const oneMinuteAgo = now - 60000;

        if (!this.clientRequests.has(clientId)) {
            this.clientRequests.set(clientId, []);
        }

        const timestamps = this.clientRequests.get(clientId);

        // Remove old timestamps
        const filtered = timestamps.filter(ts => ts > oneMinuteAgo);
        this.clientRequests.set(clientId, filtered);

        return filtered.length < this.config.clientRateLimit;
    }

    recordClientRequest(clientId) {
        if (!this.clientRequests.has(clientId)) {
            this.clientRequests.set(clientId, []);
        }
        this.clientRequests.get(clientId).push(Date.now());
    }

    async route(query, options = {}) {
        this.metrics.totalRequests++;
        this.metrics.activeRoutes++;

        const startTime = Date.now();
        const sessionId = options.sessionId || this.generateSessionId(options.clientId);

        try {
            // Select platform
            const platform = await this.selectPlatform({
                ...options,
                sessionId
            });

            // Record request
            platform.recordRequest();

            this.emit('requestRouted', platform.name, query);

            // Return routing result
            return {
                platform: platform.name,
                sessionId: sessionId,
                routedAt: new Date().toISOString(),
                onComplete: (success, response) => {
                    const responseTime = Date.now() - startTime;
                    platform.recordResponse(success, responseTime);
                    this.metrics.activeRoutes--;

                    if (success) {
                        this.metrics.successfulRequests++;
                    } else {
                        this.metrics.failedRequests++;
                    }

                    this.emit('requestCompleted', platform.name, success, responseTime);
                }
            };
        } catch (error) {
            this.metrics.failedRequests++;
            this.metrics.activeRoutes--;
            throw error;
        }
    }

    generateSessionId(clientId) {
        const data = `${clientId || 'anonymous'}-${Date.now()}-${Math.random()}`;
        return crypto.createHash('sha256').update(data).digest('hex');
    }

    setPlatformEnabled(platformName, enabled) {
        const platform = this.platforms.get(platformName);
        if (platform) {
            platform.enabled = enabled;
            console.log(`[LB] Platform ${platformName} ${enabled ? 'enabled' : 'disabled'}`);
            this.emit('platformStatusChanged', platformName, enabled);
        }
    }

    setPlatformWeight(platformName, weight) {
        const platform = this.platforms.get(platformName);
        if (platform) {
            platform.weight = weight;
            console.log(`[LB] Platform ${platformName} weight set to ${weight}`);
        }
    }

    async healthCheck() {
        console.log('[LB] Running health checks...');

        for (const [name, platform] of this.platforms) {
            // Simple health check based on recent performance
            const successRate = platform.getSuccessRate();
            const wasHealthy = platform.healthy;

            if (successRate < 0.5 && platform.totalRequests > 10) {
                platform.healthy = false;
            } else if (platform.circuitState === 'closed' && successRate >= 0.8) {
                platform.healthy = true;
                platform.healthCheckFailures = 0;
            }

            if (wasHealthy !== platform.healthy) {
                console.log(`[LB] Platform ${name} health changed: ${platform.healthy ? 'healthy' : 'unhealthy'}`);
                this.emit('platformHealthChanged', name, platform.healthy);
            }
        }
    }

    startHealthChecks() {
        console.log(`[LB] Starting health checks (interval: ${this.config.healthCheckInterval}ms)`);

        this.healthCheckTimer = setInterval(() => {
            this.healthCheck();
        }, this.config.healthCheckInterval);
    }

    stopHealthChecks() {
        if (this.healthCheckTimer) {
            clearInterval(this.healthCheckTimer);
            this.healthCheckTimer = null;
        }
    }

    getMetrics() {
        const platformStats = Array.from(this.platforms.values()).map(p => p.getStats());

        return {
            ...this.metrics,
            algorithm: this.config.algorithm,
            platforms: platformStats,
            totalPlatforms: this.platforms.size,
            healthyPlatforms: platformStats.filter(p => p.healthy).length,
            activeSessions: this.sessions.size,
            trackedClients: this.clientRequests.size,
            successRate: this.metrics.totalRequests > 0
                ? `${(this.metrics.successfulRequests / this.metrics.totalRequests * 100).toFixed(2)}%`
                : '0%',
            timestamp: new Date().toISOString()
        };
    }

    async shutdown() {
        console.log('[LB] Shutting down load balancer...');

        this.stopHealthChecks();
        this.sessions.clear();
        this.clientRequests.clear();

        this.emit('shutdown', this.getMetrics());
        console.log('[LB] Load balancer shut down successfully');
    }
}

module.exports = { LoadBalancer, Platform };

// Demo
if (require.main === module) {
    async function demo() {
        const lb = new LoadBalancer({
            algorithm: 'least-connections',
            enableStickySession: true,
            healthCheckInterval: 5000
        });

        // Register platforms
        lb.registerPlatform('huggingchat', { weight: 3, priority: 10, maxConnections: 50 });
        lb.registerPlatform('claude', { weight: 2, priority: 9, maxConnections: 30 });
        lb.registerPlatform('chatgpt', { weight: 2, priority: 8, maxConnections: 30 });
        lb.registerPlatform('gemini', { weight: 1, priority: 7, maxConnections: 20 });

        // Listen to events
        lb.on('platformSelected', (platform, algorithm) => {
            console.log(`✓ Platform selected: ${platform} (${algorithm})`);
        });

        lb.on('requestCompleted', (platform, success, responseTime) => {
            console.log(`✓ Request completed on ${platform}: ${success ? 'success' : 'failed'} (${responseTime}ms)`);
        });

        lb.startHealthChecks();

        console.log('=== Testing load balancer ===\n');

        // Simulate requests
        const queries = [
            'What is AI?',
            'Explain machine learning',
            'How does neural network work?',
            'What is deep learning?',
            'Explain NLP'
        ];

        for (const query of queries) {
            try {
                const route = await lb.route(query, {
                    clientId: 'client-123'
                });

                console.log(`Query "${query}" routed to ${route.platform}`);

                // Simulate request completion
                setTimeout(() => {
                    const success = Math.random() > 0.1; // 90% success rate
                    route.onComplete(success);
                }, Math.random() * 2000 + 500);

            } catch (error) {
                console.error(`Failed to route query: ${error.message}`);
            }

            await new Promise(resolve => setTimeout(resolve, 500));
        }

        // Wait for requests to complete
        await new Promise(resolve => setTimeout(resolve, 3000));

        console.log('\n=== Load balancer metrics ===\n');
        console.log(JSON.stringify(lb.getMetrics(), null, 2));

        await lb.shutdown();
    }

    demo().catch(console.error);
}
