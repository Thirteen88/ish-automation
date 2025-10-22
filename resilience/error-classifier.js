#!/usr/bin/env node

/**
 * Error Classifier with Pattern Learning
 *
 * Features:
 * - Classify errors: transient, permanent, rate-limit, auth, network
 * - Define recovery strategies per error type
 * - Pattern learning from historical errors
 * - Confidence scoring for classifications
 * - Custom error patterns
 * - Statistical analysis of error trends
 */

const EventEmitter = require('events');
const fs = require('fs').promises;
const path = require('path');

/**
 * Error Categories
 */
const ErrorCategory = {
    TRANSIENT: 'transient',       // Temporary, retry likely to succeed
    PERMANENT: 'permanent',       // Permanent, retry won't help
    RATE_LIMIT: 'rate_limit',    // Rate limit, retry after delay
    AUTH: 'auth',                // Authentication/authorization
    NETWORK: 'network',          // Network connectivity
    TIMEOUT: 'timeout',          // Request timeout
    VALIDATION: 'validation',    // Input validation
    BROWSER: 'browser',          // Browser automation
    PARSING: 'parsing',          // Response parsing
    RESOURCE: 'resource',        // Resource not found
    UNKNOWN: 'unknown'           // Unknown error
};

/**
 * Recovery Strategies
 */
const RecoveryStrategy = {
    RETRY: 'retry',
    RETRY_WITH_BACKOFF: 'retry_with_backoff',
    RETRY_AFTER_DELAY: 'retry_after_delay',
    FALLBACK: 'fallback',
    MANUAL_INTERVENTION: 'manual_intervention',
    IGNORE: 'ignore',
    RESTART: 'restart',
    NO_RETRY: 'no_retry'
};

/**
 * Error Pattern
 */
class ErrorPattern {
    constructor(options = {}) {
        this.category = options.category;
        this.patterns = options.patterns || [];
        this.statusCodes = options.statusCodes || [];
        this.keywords = options.keywords || [];
        this.strategy = options.strategy;
        this.retryable = options.retryable !== false;
        this.retryDelay = options.retryDelay || 0;
        this.maxRetries = options.maxRetries || 3;
        this.confidence = options.confidence || 1.0;
    }

    matches(error) {
        const message = (error.message || '').toLowerCase();
        const code = error.code || '';
        const statusCode = error.statusCode || error.status;

        // Check status codes
        if (statusCode && this.statusCodes.includes(statusCode)) {
            return true;
        }

        // Check error codes
        if (code && this.patterns.includes(code)) {
            return true;
        }

        // Check keywords
        for (const keyword of this.keywords) {
            if (message.includes(keyword.toLowerCase())) {
                return true;
            }
        }

        return false;
    }

    getRecoveryAction() {
        return {
            category: this.category,
            strategy: this.strategy,
            retryable: this.retryable,
            retryDelay: this.retryDelay,
            maxRetries: this.maxRetries
        };
    }
}

/**
 * Error Classifier
 */
class ErrorClassifier extends EventEmitter {
    constructor(options = {}) {
        super();

        this.patterns = [];
        this.learningEnabled = options.learningEnabled !== false;
        this.confidenceThreshold = options.confidenceThreshold || 0.7;
        this.historySize = options.historySize || 1000;
        this.persistPath = options.persistPath || './error-patterns.json';

        // Error history for learning
        this.history = [];
        this.patternStats = new Map();

        // Initialize default patterns
        this.initializeDefaultPatterns();

        // Load learned patterns
        this.loadLearnedPatterns();
    }

    /**
     * Initialize default error patterns
     */
    initializeDefaultPatterns() {
        // Network errors
        this.addPattern(new ErrorPattern({
            category: ErrorCategory.NETWORK,
            patterns: ['ECONNREFUSED', 'ENOTFOUND', 'ECONNRESET', 'ENETUNREACH'],
            keywords: ['network', 'connection refused', 'connection reset', 'dns'],
            strategy: RecoveryStrategy.RETRY_WITH_BACKOFF,
            retryable: true,
            retryDelay: 2000,
            maxRetries: 5
        }));

        // Timeout errors
        this.addPattern(new ErrorPattern({
            category: ErrorCategory.TIMEOUT,
            patterns: ['ETIMEDOUT', 'ESOCKETTIMEDOUT'],
            statusCodes: [408, 504],
            keywords: ['timeout', 'timed out'],
            strategy: RecoveryStrategy.RETRY_WITH_BACKOFF,
            retryable: true,
            retryDelay: 1000,
            maxRetries: 3
        }));

        // Rate limit errors
        this.addPattern(new ErrorPattern({
            category: ErrorCategory.RATE_LIMIT,
            statusCodes: [429],
            keywords: ['rate limit', 'too many requests', 'quota exceeded'],
            strategy: RecoveryStrategy.RETRY_AFTER_DELAY,
            retryable: true,
            retryDelay: 60000,
            maxRetries: 3
        }));

        // Authentication errors
        this.addPattern(new ErrorPattern({
            category: ErrorCategory.AUTH,
            statusCodes: [401, 403],
            keywords: ['unauthorized', 'forbidden', 'authentication', 'api key', 'token expired'],
            strategy: RecoveryStrategy.MANUAL_INTERVENTION,
            retryable: false
        }));

        // Browser errors
        this.addPattern(new ErrorPattern({
            category: ErrorCategory.BROWSER,
            keywords: ['selector', 'element not found', 'page crash', 'browser', 'captcha', 'navigation'],
            strategy: RecoveryStrategy.RESTART,
            retryable: true,
            retryDelay: 3000,
            maxRetries: 3
        }));

        // Parsing errors
        this.addPattern(new ErrorPattern({
            category: ErrorCategory.PARSING,
            keywords: ['parse', 'json', 'invalid response', 'malformed'],
            strategy: RecoveryStrategy.NO_RETRY,
            retryable: false
        }));

        // Validation errors
        this.addPattern(new ErrorPattern({
            category: ErrorCategory.VALIDATION,
            statusCodes: [400, 422],
            keywords: ['validation', 'invalid input', 'bad request'],
            strategy: RecoveryStrategy.NO_RETRY,
            retryable: false
        }));

        // Resource errors
        this.addPattern(new ErrorPattern({
            category: ErrorCategory.RESOURCE,
            statusCodes: [404, 410],
            keywords: ['not found', 'resource not found'],
            strategy: RecoveryStrategy.FALLBACK,
            retryable: false
        }));

        // Server errors (transient)
        this.addPattern(new ErrorPattern({
            category: ErrorCategory.TRANSIENT,
            statusCodes: [500, 502, 503],
            keywords: ['internal server error', 'bad gateway', 'service unavailable'],
            strategy: RecoveryStrategy.RETRY_WITH_BACKOFF,
            retryable: true,
            retryDelay: 5000,
            maxRetries: 3
        }));
    }

    /**
     * Add error pattern
     */
    addPattern(pattern) {
        this.patterns.push(pattern);
        this.patternStats.set(pattern.category, {
            matches: 0,
            correctPredictions: 0,
            incorrectPredictions: 0
        });
    }

    /**
     * Classify error
     */
    classify(error, context = {}) {
        const classification = {
            error,
            category: ErrorCategory.UNKNOWN,
            confidence: 0,
            strategy: RecoveryStrategy.NO_RETRY,
            retryable: false,
            retryDelay: 0,
            maxRetries: 0,
            matchedPattern: null,
            timestamp: Date.now(),
            context
        };

        // Try to match against patterns
        for (const pattern of this.patterns) {
            if (pattern.matches(error)) {
                const action = pattern.getRecoveryAction();

                classification.category = action.category;
                classification.strategy = action.strategy;
                classification.retryable = action.retryable;
                classification.retryDelay = action.retryDelay;
                classification.maxRetries = action.maxRetries;
                classification.confidence = pattern.confidence;
                classification.matchedPattern = pattern;

                // Update stats
                const stats = this.patternStats.get(pattern.category);
                if (stats) {
                    stats.matches++;
                }

                break;
            }
        }

        // Apply learning if enabled
        if (this.learningEnabled) {
            const learned = this.applyLearning(error, classification);
            if (learned && learned.confidence > classification.confidence) {
                classification.category = learned.category;
                classification.confidence = learned.confidence;
            }
        }

        // Add to history
        this.addToHistory(classification);

        // Emit event
        this.emit('classified', classification);

        return classification;
    }

    /**
     * Apply machine learning to improve classification
     */
    applyLearning(error, classification) {
        if (this.history.length < 10) return null;

        const message = (error.message || '').toLowerCase();
        const similar = this.findSimilarErrors(message);

        if (similar.length === 0) return null;

        // Calculate most common category among similar errors
        const categoryCount = {};
        for (const item of similar) {
            categoryCount[item.category] = (categoryCount[item.category] || 0) + 1;
        }

        const categories = Object.entries(categoryCount)
            .sort((a, b) => b[1] - a[1]);

        if (categories.length === 0) return null;

        const [category, count] = categories[0];
        const confidence = count / similar.length;

        if (confidence >= this.confidenceThreshold) {
            return { category, confidence };
        }

        return null;
    }

    /**
     * Find similar errors in history
     */
    findSimilarErrors(message, threshold = 0.6) {
        const similar = [];

        for (const item of this.history) {
            const itemMessage = (item.error.message || '').toLowerCase();
            const similarity = this.calculateSimilarity(message, itemMessage);

            if (similarity >= threshold) {
                similar.push(item);
            }
        }

        return similar;
    }

    /**
     * Calculate string similarity (simple Jaccard index)
     */
    calculateSimilarity(str1, str2) {
        const words1 = new Set(str1.split(/\s+/));
        const words2 = new Set(str2.split(/\s+/));

        const intersection = new Set([...words1].filter(x => words2.has(x)));
        const union = new Set([...words1, ...words2]);

        return intersection.size / union.size;
    }

    /**
     * Add classification to history
     */
    addToHistory(classification) {
        this.history.push(classification);

        // Trim history if too large
        if (this.history.length > this.historySize) {
            this.history.shift();
        }
    }

    /**
     * Provide feedback on classification
     */
    feedback(classificationId, actualCategory) {
        const item = this.history.find(h => h.timestamp === classificationId);
        if (!item) return;

        item.actualCategory = actualCategory;
        item.feedbackProvided = true;

        // Update pattern stats
        if (item.matchedPattern) {
            const stats = this.patternStats.get(item.category);
            if (stats) {
                if (item.category === actualCategory) {
                    stats.correctPredictions++;
                } else {
                    stats.incorrectPredictions++;
                }
            }
        }

        // Learn from feedback
        if (this.learningEnabled && item.category !== actualCategory) {
            this.learnFromFeedback(item, actualCategory);
        }

        this.emit('feedback_received', {
            predicted: item.category,
            actual: actualCategory,
            correct: item.category === actualCategory
        });
    }

    /**
     * Learn from feedback
     */
    learnFromFeedback(item, actualCategory) {
        // Find or create pattern for this error type
        const message = item.error.message || '';
        const words = message.toLowerCase().split(/\s+/).filter(w => w.length > 3);

        // Extract keywords from error message
        const keywords = words.slice(0, 5);

        // Check if we should create a new pattern
        const existingPattern = this.patterns.find(p =>
            p.category === actualCategory &&
            keywords.some(k => p.keywords.includes(k))
        );

        if (!existingPattern && keywords.length > 0) {
            // Create new learned pattern
            const strategy = this.getDefaultStrategy(actualCategory);
            const newPattern = new ErrorPattern({
                category: actualCategory,
                keywords,
                strategy: strategy.strategy,
                retryable: strategy.retryable,
                retryDelay: strategy.retryDelay,
                maxRetries: strategy.maxRetries,
                confidence: 0.8 // Start with lower confidence
            });

            this.addPattern(newPattern);
            this.emit('pattern_learned', { pattern: newPattern });

            // Persist learned patterns
            this.persistLearnedPatterns();
        }
    }

    /**
     * Get default strategy for category
     */
    getDefaultStrategy(category) {
        const defaults = {
            [ErrorCategory.TRANSIENT]: {
                strategy: RecoveryStrategy.RETRY_WITH_BACKOFF,
                retryable: true,
                retryDelay: 2000,
                maxRetries: 3
            },
            [ErrorCategory.NETWORK]: {
                strategy: RecoveryStrategy.RETRY_WITH_BACKOFF,
                retryable: true,
                retryDelay: 2000,
                maxRetries: 5
            },
            [ErrorCategory.TIMEOUT]: {
                strategy: RecoveryStrategy.RETRY_WITH_BACKOFF,
                retryable: true,
                retryDelay: 1000,
                maxRetries: 3
            },
            [ErrorCategory.RATE_LIMIT]: {
                strategy: RecoveryStrategy.RETRY_AFTER_DELAY,
                retryable: true,
                retryDelay: 60000,
                maxRetries: 3
            },
            [ErrorCategory.PERMANENT]: {
                strategy: RecoveryStrategy.NO_RETRY,
                retryable: false,
                retryDelay: 0,
                maxRetries: 0
            }
        };

        return defaults[category] || defaults[ErrorCategory.PERMANENT];
    }

    /**
     * Get classification statistics
     */
    getStats() {
        const stats = {
            totalClassifications: this.history.length,
            byCategory: {},
            patternAccuracy: {}
        };

        // Count by category
        for (const item of this.history) {
            stats.byCategory[item.category] = (stats.byCategory[item.category] || 0) + 1;
        }

        // Pattern accuracy
        for (const [category, patternStat] of this.patternStats) {
            const total = patternStat.correctPredictions + patternStat.incorrectPredictions;
            stats.patternAccuracy[category] = {
                matches: patternStat.matches,
                accuracy: total > 0 ? patternStat.correctPredictions / total : 0,
                correctPredictions: patternStat.correctPredictions,
                incorrectPredictions: patternStat.incorrectPredictions
            };
        }

        // Overall accuracy
        const withFeedback = this.history.filter(h => h.feedbackProvided);
        const correct = withFeedback.filter(h => h.category === h.actualCategory);
        stats.overallAccuracy = withFeedback.length > 0 ? correct.length / withFeedback.length : 0;

        return stats;
    }

    /**
     * Persist learned patterns
     */
    async persistLearnedPatterns() {
        try {
            const learned = this.patterns
                .filter(p => p.confidence < 1.0)
                .map(p => ({
                    category: p.category,
                    keywords: p.keywords,
                    strategy: p.strategy,
                    retryable: p.retryable,
                    retryDelay: p.retryDelay,
                    maxRetries: p.maxRetries,
                    confidence: p.confidence
                }));

            await fs.writeFile(this.persistPath, JSON.stringify(learned, null, 2));
        } catch (error) {
            console.error('Failed to persist patterns:', error.message);
        }
    }

    /**
     * Load learned patterns
     */
    async loadLearnedPatterns() {
        try {
            const data = await fs.readFile(this.persistPath, 'utf8');
            const learned = JSON.parse(data);

            for (const pattern of learned) {
                this.addPattern(new ErrorPattern(pattern));
            }

            this.emit('patterns_loaded', { count: learned.length });
        } catch (error) {
            // File doesn't exist or invalid, skip
        }
    }
}

// Export
module.exports = {
    ErrorClassifier,
    ErrorPattern,
    ErrorCategory,
    RecoveryStrategy
};

// Demo
if (require.main === module) {
    async function demo() {
        console.log('=== Error Classifier Demo ===\n');

        const classifier = new ErrorClassifier({
            learningEnabled: true,
            confidenceThreshold: 0.7
        });

        // Listen to events
        classifier.on('classified', (classification) => {
            console.log(`[CLASSIFIED] ${classification.category} (confidence: ${classification.confidence.toFixed(2)})`);
            console.log(`  Strategy: ${classification.strategy}`);
            console.log(`  Retryable: ${classification.retryable}`);
        });

        classifier.on('pattern_learned', ({ pattern }) => {
            console.log(`[LEARNED] New pattern for ${pattern.category} with keywords: ${pattern.keywords.join(', ')}`);
        });

        // Test various errors
        const testErrors = [
            new Error('ECONNREFUSED: Connection refused'),
            new Error('ETIMEDOUT: Request timeout'),
            { message: 'Rate limit exceeded', statusCode: 429 },
            { message: 'Unauthorized access', statusCode: 401 },
            new Error('Element not found in browser'),
            new Error('Invalid JSON response'),
            { message: 'Internal server error', statusCode: 500 },
            new Error('Network connection lost')
        ];

        console.log('Classifying errors:\n');
        const classifications = [];

        for (const error of testErrors) {
            const classification = classifier.classify(error);
            classifications.push(classification);
            console.log(`Error: ${error.message || error}`);
            console.log(`  Category: ${classification.category}`);
            console.log(`  Confidence: ${classification.confidence.toFixed(2)}`);
            console.log(`  Strategy: ${classification.strategy}`);
            console.log();
        }

        // Simulate feedback
        console.log('\nProviding feedback:\n');
        classifier.feedback(classifications[0].timestamp, ErrorCategory.NETWORK);
        classifier.feedback(classifications[7].timestamp, ErrorCategory.NETWORK);

        // Show stats
        console.log('\n\nClassification Statistics:');
        console.log(JSON.stringify(classifier.getStats(), null, 2));
    }

    demo().catch(console.error);
}
