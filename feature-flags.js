#!/usr/bin/env node

/**
 * Feature Flags System
 *
 * Advanced feature flag management with:
 * - Dynamic feature enabling/disabling without restart
 * - A/B testing configuration with percentage-based rollouts
 * - Gradual rollout with percentage control
 * - User-specific feature flags with targeting
 * - Real-time flag updates via file watching
 * - Flag analytics and usage tracking
 * - Multi-variant testing support
 */

const fs = require('fs').promises;
const fsSync = require('fs');
const path = require('path');
const EventEmitter = require('events');
const crypto = require('crypto');

class FeatureFlagsManager extends EventEmitter {
    constructor(options = {}) {
        super();

        this.options = {
            configPath: options.configPath || path.join(__dirname, 'config', 'feature-flags.json'),
            enableWatch: options.enableWatch !== false,
            enableAnalytics: options.enableAnalytics !== false,
            defaultEnabled: options.defaultEnabled || false,
            enableCaching: options.enableCaching !== false,
            cacheTTL: options.cacheTTL || 60000, // 1 minute
            enableOverrides: options.enableOverrides !== false,
            ...options
        };

        // Feature flags storage
        this.flags = new Map();

        // User overrides
        this.userOverrides = new Map();

        // Analytics data
        this.analytics = new Map();

        // Cache for flag evaluations
        this.cache = new Map();

        // File watcher
        this.watcher = null;

        // Last load time
        this.lastLoadTime = null;
    }

    /**
     * Initialize feature flags manager
     */
    async initialize() {
        console.log(`🚩 Initializing Feature Flags Manager`);
        console.log(`   Config Path: ${this.options.configPath}`);
        console.log(`   Watch: ${this.options.enableWatch ? 'Enabled' : 'Disabled'}`);
        console.log(`   Analytics: ${this.options.enableAnalytics ? 'Enabled' : 'Disabled'}`);

        try {
            // Load flags from config
            await this.loadFlags();

            // Setup file watching
            if (this.options.enableWatch) {
                this.setupFileWatching();
            }

            console.log(`✅ Feature Flags Manager initialized`);
            console.log(`   Flags Loaded: ${this.flags.size}`);

            this.emit('initialized');

            return true;
        } catch (error) {
            console.error(`❌ Failed to initialize feature flags:`, error.message);
            throw error;
        }
    }

    /**
     * Load feature flags from config file
     */
    async loadFlags() {
        try {
            const content = await fs.readFile(this.options.configPath, 'utf8');
            const config = JSON.parse(content);

            // Clear existing flags
            this.flags.clear();

            // Load flags
            if (config.flags) {
                for (const [key, value] of Object.entries(config.flags)) {
                    this.flags.set(key, this.normalizeFlag(value));
                }
            }

            this.lastLoadTime = new Date().toISOString();

            console.log(`   ✓ Loaded ${this.flags.size} feature flags`);
        } catch (error) {
            if (error.code === 'ENOENT') {
                console.log(`   ⚠️  Config file not found, creating default...`);
                await this.createDefaultConfig();
                await this.loadFlags();
            } else {
                throw new Error(`Failed to load feature flags: ${error.message}`);
            }
        }
    }

    /**
     * Normalize flag configuration
     */
    normalizeFlag(flag) {
        if (typeof flag === 'boolean') {
            return {
                enabled: flag,
                rolloutPercentage: flag ? 100 : 0,
                enabledUsers: [],
                disabledUsers: [],
                variants: null,
                conditions: [],
                metadata: {}
            };
        }

        return {
            enabled: flag.enabled !== undefined ? flag.enabled : this.options.defaultEnabled,
            rolloutPercentage: flag.rolloutPercentage !== undefined ? flag.rolloutPercentage : 100,
            enabledUsers: flag.enabledUsers || [],
            disabledUsers: flag.disabledUsers || [],
            enabledGroups: flag.enabledGroups || [],
            disabledGroups: flag.disabledGroups || [],
            variants: flag.variants || null,
            conditions: flag.conditions || [],
            startDate: flag.startDate || null,
            endDate: flag.endDate || null,
            metadata: flag.metadata || {},
            description: flag.description || ''
        };
    }

    /**
     * Check if feature is enabled for a user/context
     */
    isEnabled(flagKey, context = {}) {
        const userId = context.userId || context.user || 'anonymous';
        const cacheKey = `${flagKey}:${userId}`;

        // Check cache
        if (this.options.enableCaching && this.cache.has(cacheKey)) {
            const cached = this.cache.get(cacheKey);

            if (Date.now() - cached.timestamp < this.options.cacheTTL) {
                return cached.value;
            }
        }

        // Evaluate flag
        const result = this.evaluateFlag(flagKey, context);

        // Cache result
        if (this.options.enableCaching) {
            this.cache.set(cacheKey, {
                value: result,
                timestamp: Date.now()
            });
        }

        // Track analytics
        if (this.options.enableAnalytics) {
            this.trackFlagUsage(flagKey, userId, result);
        }

        return result;
    }

    /**
     * Evaluate a feature flag
     */
    evaluateFlag(flagKey, context) {
        const flag = this.flags.get(flagKey);

        if (!flag) {
            console.warn(`⚠️  Feature flag not found: ${flagKey}, using default: ${this.options.defaultEnabled}`);
            return this.options.defaultEnabled;
        }

        const userId = context.userId || context.user || 'anonymous';
        const userGroups = context.groups || [];

        // Check user-specific override
        if (this.options.enableOverrides && this.userOverrides.has(`${flagKey}:${userId}`)) {
            return this.userOverrides.get(`${flagKey}:${userId}`);
        }

        // Check if explicitly disabled for user
        if (flag.disabledUsers.includes(userId)) {
            return false;
        }

        // Check if explicitly enabled for user
        if (flag.enabledUsers.includes(userId)) {
            return true;
        }

        // Check group-based rules
        if (flag.disabledGroups.some(group => userGroups.includes(group))) {
            return false;
        }

        if (flag.enabledGroups.some(group => userGroups.includes(group))) {
            return true;
        }

        // Check date range
        if (!this.isWithinDateRange(flag)) {
            return false;
        }

        // Check conditions
        if (flag.conditions.length > 0) {
            if (!this.evaluateConditions(flag.conditions, context)) {
                return false;
            }
        }

        // Check if flag is enabled
        if (!flag.enabled) {
            return false;
        }

        // Check rollout percentage
        if (flag.rolloutPercentage < 100) {
            return this.isInRollout(userId, flagKey, flag.rolloutPercentage);
        }

        return true;
    }

    /**
     * Get variant for A/B testing
     */
    getVariant(flagKey, context = {}) {
        const flag = this.flags.get(flagKey);

        if (!flag || !flag.variants) {
            return null;
        }

        const userId = context.userId || context.user || 'anonymous';

        // Check if flag is enabled first
        if (!this.isEnabled(flagKey, context)) {
            return null;
        }

        // Determine variant based on user hash
        const variant = this.selectVariant(userId, flagKey, flag.variants);

        // Track analytics
        if (this.options.enableAnalytics) {
            this.trackVariantUsage(flagKey, userId, variant);
        }

        return variant;
    }

    /**
     * Select variant based on user hash and weights
     */
    selectVariant(userId, flagKey, variants) {
        // Calculate hash for consistent variant assignment
        const hash = this.hashUser(userId, flagKey);
        const hashValue = parseInt(hash.substring(0, 8), 16);
        const percentage = (hashValue % 100) / 100;

        let cumulative = 0;

        for (const variant of variants) {
            cumulative += variant.weight || 0;

            if (percentage < cumulative) {
                return variant.name;
            }
        }

        // Fallback to first variant
        return variants[0]?.name || null;
    }

    /**
     * Check if user is in rollout percentage
     */
    isInRollout(userId, flagKey, percentage) {
        if (percentage >= 100) return true;
        if (percentage <= 0) return false;

        const hash = this.hashUser(userId, flagKey);
        const hashValue = parseInt(hash.substring(0, 8), 16);

        return (hashValue % 100) < percentage;
    }

    /**
     * Hash user ID for consistent bucketing
     */
    hashUser(userId, flagKey) {
        return crypto
            .createHash('md5')
            .update(`${userId}:${flagKey}`)
            .digest('hex');
    }

    /**
     * Check if flag is within date range
     */
    isWithinDateRange(flag) {
        const now = new Date();

        if (flag.startDate) {
            const start = new Date(flag.startDate);
            if (now < start) return false;
        }

        if (flag.endDate) {
            const end = new Date(flag.endDate);
            if (now > end) return false;
        }

        return true;
    }

    /**
     * Evaluate conditions
     */
    evaluateConditions(conditions, context) {
        for (const condition of conditions) {
            if (!this.evaluateCondition(condition, context)) {
                return false;
            }
        }

        return true;
    }

    /**
     * Evaluate a single condition
     */
    evaluateCondition(condition, context) {
        const { property, operator, value } = condition;
        const contextValue = this.getNestedProperty(context, property);

        switch (operator) {
            case 'equals':
                return contextValue === value;
            case 'notEquals':
                return contextValue !== value;
            case 'contains':
                return Array.isArray(contextValue) && contextValue.includes(value);
            case 'greaterThan':
                return contextValue > value;
            case 'lessThan':
                return contextValue < value;
            case 'matches':
                return new RegExp(value).test(contextValue);
            default:
                return false;
        }
    }

    /**
     * Get nested property from object
     */
    getNestedProperty(obj, path) {
        return path.split('.').reduce((current, key) => current?.[key], obj);
    }

    /**
     * Set user-specific override
     */
    setUserOverride(flagKey, userId, enabled) {
        const key = `${flagKey}:${userId}`;
        this.userOverrides.set(key, enabled);

        // Clear cache for this user
        this.clearCache(flagKey, userId);

        this.emit('override-set', { flagKey, userId, enabled });
    }

    /**
     * Remove user override
     */
    removeUserOverride(flagKey, userId) {
        const key = `${flagKey}:${userId}`;
        this.userOverrides.delete(key);

        // Clear cache for this user
        this.clearCache(flagKey, userId);

        this.emit('override-removed', { flagKey, userId });
    }

    /**
     * Update flag at runtime
     */
    async updateFlag(flagKey, updates) {
        const flag = this.flags.get(flagKey);

        if (!flag) {
            throw new Error(`Flag not found: ${flagKey}`);
        }

        // Update flag
        const updatedFlag = { ...flag, ...updates };
        this.flags.set(flagKey, this.normalizeFlag(updatedFlag));

        // Clear cache for this flag
        this.clearCache(flagKey);

        // Persist changes
        await this.saveFlags();

        this.emit('flag-updated', { flagKey, updates });

        console.log(`✅ Flag updated: ${flagKey}`);
    }

    /**
     * Add new flag
     */
    async addFlag(flagKey, config) {
        if (this.flags.has(flagKey)) {
            throw new Error(`Flag already exists: ${flagKey}`);
        }

        this.flags.set(flagKey, this.normalizeFlag(config));

        await this.saveFlags();

        this.emit('flag-added', { flagKey, config });

        console.log(`✅ Flag added: ${flagKey}`);
    }

    /**
     * Remove flag
     */
    async removeFlag(flagKey) {
        if (!this.flags.has(flagKey)) {
            throw new Error(`Flag not found: ${flagKey}`);
        }

        this.flags.delete(flagKey);

        // Clear cache
        this.clearCache(flagKey);

        await this.saveFlags();

        this.emit('flag-removed', { flagKey });

        console.log(`✅ Flag removed: ${flagKey}`);
    }

    /**
     * Save flags to config file
     */
    async saveFlags() {
        const config = {
            flags: Object.fromEntries(this.flags),
            lastUpdated: new Date().toISOString()
        };

        await fs.writeFile(this.options.configPath, JSON.stringify(config, null, 2));
    }

    /**
     * Clear cache
     */
    clearCache(flagKey = null, userId = null) {
        if (flagKey && userId) {
            this.cache.delete(`${flagKey}:${userId}`);
        } else if (flagKey) {
            // Clear all cache entries for this flag
            for (const key of this.cache.keys()) {
                if (key.startsWith(`${flagKey}:`)) {
                    this.cache.delete(key);
                }
            }
        } else {
            this.cache.clear();
        }
    }

    /**
     * Track flag usage
     */
    trackFlagUsage(flagKey, userId, result) {
        if (!this.analytics.has(flagKey)) {
            this.analytics.set(flagKey, {
                enabled: 0,
                disabled: 0,
                users: new Set(),
                lastAccessed: null
            });
        }

        const stats = this.analytics.get(flagKey);

        if (result) {
            stats.enabled++;
        } else {
            stats.disabled++;
        }

        stats.users.add(userId);
        stats.lastAccessed = new Date().toISOString();
    }

    /**
     * Track variant usage
     */
    trackVariantUsage(flagKey, userId, variant) {
        const key = `${flagKey}:variants`;

        if (!this.analytics.has(key)) {
            this.analytics.set(key, new Map());
        }

        const variantStats = this.analytics.get(key);

        if (!variantStats.has(variant)) {
            variantStats.set(variant, {
                count: 0,
                users: new Set()
            });
        }

        const stats = variantStats.get(variant);
        stats.count++;
        stats.users.add(userId);
    }

    /**
     * Get analytics for a flag
     */
    getAnalytics(flagKey) {
        const stats = this.analytics.get(flagKey);

        if (!stats) {
            return null;
        }

        const result = {
            enabled: stats.enabled,
            disabled: stats.disabled,
            total: stats.enabled + stats.disabled,
            enabledPercentage: ((stats.enabled / (stats.enabled + stats.disabled)) * 100).toFixed(2),
            uniqueUsers: stats.users.size,
            lastAccessed: stats.lastAccessed
        };

        // Add variant stats if available
        const variantKey = `${flagKey}:variants`;
        if (this.analytics.has(variantKey)) {
            const variantStats = this.analytics.get(variantKey);
            result.variants = {};

            for (const [variant, data] of variantStats) {
                result.variants[variant] = {
                    count: data.count,
                    uniqueUsers: data.users.size
                };
            }
        }

        return result;
    }

    /**
     * Get all analytics
     */
    getAllAnalytics() {
        const analytics = {};

        for (const flagKey of this.flags.keys()) {
            const stats = this.getAnalytics(flagKey);
            if (stats) {
                analytics[flagKey] = stats;
            }
        }

        return analytics;
    }

    /**
     * List all flags
     */
    listFlags() {
        const flags = [];

        for (const [key, flag] of this.flags) {
            flags.push({
                key,
                enabled: flag.enabled,
                rolloutPercentage: flag.rolloutPercentage,
                hasVariants: !!flag.variants,
                description: flag.description,
                metadata: flag.metadata
            });
        }

        return flags;
    }

    /**
     * Setup file watching
     */
    setupFileWatching() {
        try {
            this.watcher = fsSync.watch(this.options.configPath, async (eventType) => {
                if (eventType === 'change') {
                    console.log(`\n🔄 Feature flags file changed, reloading...`);
                    await this.reload();
                }
            });

            console.log(`   ✓ Watching feature flags file`);
        } catch (error) {
            console.warn(`   ⚠️  Failed to watch feature flags file: ${error.message}`);
        }
    }

    /**
     * Reload flags from file
     */
    async reload() {
        try {
            await this.loadFlags();

            // Clear cache
            this.clearCache();

            console.log(`✅ Feature flags reloaded`);

            this.emit('reloaded');

            return true;
        } catch (error) {
            console.error(`❌ Failed to reload feature flags:`, error.message);
            this.emit('reload-error', error);
            return false;
        }
    }

    /**
     * Create default config
     */
    async createDefaultConfig() {
        const defaultConfig = {
            flags: {
                exampleFeature: {
                    enabled: true,
                    rolloutPercentage: 100,
                    description: 'Example feature flag',
                    metadata: {}
                },
                betaFeature: {
                    enabled: true,
                    rolloutPercentage: 50,
                    description: 'Beta feature with gradual rollout',
                    metadata: { beta: true }
                },
                abTestFeature: {
                    enabled: true,
                    rolloutPercentage: 100,
                    description: 'A/B test feature',
                    variants: [
                        { name: 'control', weight: 0.5 },
                        { name: 'variant-a', weight: 0.5 }
                    ],
                    metadata: { experiment: true }
                }
            },
            lastUpdated: new Date().toISOString()
        };

        await fs.mkdir(path.dirname(this.options.configPath), { recursive: true });
        await fs.writeFile(this.options.configPath, JSON.stringify(defaultConfig, null, 2));
    }

    /**
     * Cleanup resources
     */
    async cleanup() {
        console.log(`🧹 Cleaning up Feature Flags Manager...`);

        if (this.watcher) {
            this.watcher.close();
        }

        this.cache.clear();

        console.log(`✅ Feature Flags Manager cleaned up`);
    }
}

module.exports = FeatureFlagsManager;

// Demo
if (require.main === module) {
    async function demo() {
        const manager = new FeatureFlagsManager({
            enableWatch: true,
            enableAnalytics: true
        });

        try {
            await manager.initialize();

            // Test various scenarios
            console.log('\n🧪 Testing Feature Flags:');

            const contexts = [
                { userId: 'user-1', groups: ['beta'] },
                { userId: 'user-2', groups: ['standard'] },
                { userId: 'user-3', groups: ['standard'] }
            ];

            for (const context of contexts) {
                console.log(`\n   User: ${context.userId}`);

                for (const flag of manager.listFlags()) {
                    const enabled = manager.isEnabled(flag.key, context);
                    const variant = manager.getVariant(flag.key, context);

                    console.log(`     ${flag.key}: ${enabled ? '✅' : '❌'}${variant ? ` (${variant})` : ''}`);
                }
            }

            // Show analytics
            console.log('\n📊 Analytics:');
            const analytics = manager.getAllAnalytics();

            for (const [flagKey, stats] of Object.entries(analytics)) {
                console.log(`\n   ${flagKey}:`);
                console.log(`     Enabled: ${stats.enabled} (${stats.enabledPercentage}%)`);
                console.log(`     Disabled: ${stats.disabled}`);
                console.log(`     Unique Users: ${stats.uniqueUsers}`);

                if (stats.variants) {
                    console.log(`     Variants:`);
                    for (const [variant, data] of Object.entries(stats.variants)) {
                        console.log(`       ${variant}: ${data.count} uses, ${data.uniqueUsers} users`);
                    }
                }
            }

            await manager.cleanup();
        } catch (error) {
            console.error('Error:', error);
            await manager.cleanup();
            process.exit(1);
        }
    }

    demo().catch(console.error);
}
