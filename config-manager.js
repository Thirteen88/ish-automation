#!/usr/bin/env node

/**
 * Configuration Manager
 *
 * Comprehensive configuration management system with:
 * - Environment-based configuration (development, staging, production)
 * - Configuration validation with JSON schema
 * - Dynamic configuration reloading without restart
 * - Hot reload with file watching
 * - Configuration versioning and rollback
 * - Deep merge of configuration layers
 * - Type-safe configuration access
 */

const fs = require('fs').promises;
const fsSync = require('fs');
const path = require('path');
const EventEmitter = require('events');
const Ajv = require('ajv');

class ConfigurationManager extends EventEmitter {
    constructor(options = {}) {
        super();

        this.options = {
            environment: options.environment || process.env.NODE_ENV || 'development',
            configDir: options.configDir || path.join(__dirname, 'config'),
            enableWatch: options.enableWatch !== false,
            watchInterval: options.watchInterval || 5000,
            enableVersioning: options.enableVersioning !== false,
            maxVersions: options.maxVersions || 10,
            validateOnLoad: options.validateOnLoad !== false,
            ...options
        };

        // Current configuration
        this.config = null;

        // Configuration history for rollback
        this.configHistory = [];

        // File watchers
        this.watchers = new Map();

        // Validation
        this.ajv = new Ajv({ allErrors: true, verbose: true });
        this.schema = null;
        this.validate = null;

        // Metadata
        this.metadata = {
            loadedAt: null,
            environment: this.options.environment,
            version: null,
            lastReload: null,
            reloadCount: 0
        };

        // File paths
        this.paths = {
            schema: path.join(this.options.configDir, 'schema.json'),
            default: path.join(this.options.configDir, 'default.json'),
            environment: path.join(this.options.configDir, `${this.options.environment}.json`),
            override: path.join(this.options.configDir, 'override.json'),
            history: path.join(this.options.configDir, '.history')
        };
    }

    /**
     * Initialize configuration manager
     */
    async initialize() {
        console.log(`🚀 Initializing Configuration Manager`);
        console.log(`   Environment: ${this.options.environment}`);
        console.log(`   Config Dir: ${this.options.configDir}`);

        try {
            // Load schema
            await this.loadSchema();

            // Load configuration
            await this.loadConfiguration();

            // Setup file watching
            if (this.options.enableWatch) {
                await this.setupFileWatching();
            }

            // Load history
            if (this.options.enableVersioning) {
                await this.loadHistory();
            }

            this.metadata.loadedAt = new Date().toISOString();

            console.log(`✅ Configuration Manager initialized`);
            console.log(`   Version: ${this.metadata.version}`);
            console.log(`   Validation: ${this.options.validateOnLoad ? 'Enabled' : 'Disabled'}`);
            console.log(`   Watch: ${this.options.enableWatch ? 'Enabled' : 'Disabled'}`);

            this.emit('initialized', this.config);

            return true;
        } catch (error) {
            console.error(`❌ Failed to initialize configuration:`, error.message);
            throw error;
        }
    }

    /**
     * Load and compile JSON schema
     */
    async loadSchema() {
        try {
            const schemaContent = await fs.readFile(this.paths.schema, 'utf8');
            this.schema = JSON.parse(schemaContent);
            this.validate = this.ajv.compile(this.schema);

            console.log(`   ✓ Schema loaded and compiled`);
        } catch (error) {
            if (error.code === 'ENOENT') {
                console.warn(`   ⚠️  Schema file not found, validation disabled`);
                this.options.validateOnLoad = false;
            } else {
                throw new Error(`Failed to load schema: ${error.message}`);
            }
        }
    }

    /**
     * Load configuration from multiple sources
     */
    async loadConfiguration() {
        try {
            // Load default configuration
            const defaultConfig = await this.loadConfigFile(this.paths.default);

            // Load environment-specific configuration
            const envConfig = await this.loadConfigFile(this.paths.environment);

            // Load optional override configuration
            const overrideConfig = await this.loadConfigFile(this.paths.override, true);

            // Deep merge configurations (default < environment < override)
            this.config = this.deepMerge(
                defaultConfig,
                envConfig,
                overrideConfig || {}
            );

            // Validate configuration
            if (this.options.validateOnLoad && this.validate) {
                const valid = this.validate(this.config);

                if (!valid) {
                    const errors = this.validate.errors.map(err =>
                        `${err.instancePath || '/'}: ${err.message}`
                    ).join('\n  ');

                    throw new Error(`Configuration validation failed:\n  ${errors}`);
                }

                console.log(`   ✓ Configuration validated successfully`);
            }

            // Update metadata
            this.metadata.version = this.config.version || '1.0.0';
            this.metadata.lastReload = new Date().toISOString();
            this.metadata.reloadCount++;

            // Save to history
            if (this.options.enableVersioning) {
                await this.saveToHistory();
            }

            console.log(`   ✓ Configuration loaded`);

            return this.config;
        } catch (error) {
            throw new Error(`Failed to load configuration: ${error.message}`);
        }
    }

    /**
     * Load a single configuration file
     */
    async loadConfigFile(filePath, optional = false) {
        try {
            const content = await fs.readFile(filePath, 'utf8');
            return JSON.parse(content);
        } catch (error) {
            if (error.code === 'ENOENT' && optional) {
                return null;
            }

            if (error.code === 'ENOENT') {
                throw new Error(`Configuration file not found: ${filePath}`);
            }

            throw new Error(`Failed to parse configuration file ${filePath}: ${error.message}`);
        }
    }

    /**
     * Deep merge multiple objects
     */
    deepMerge(...objects) {
        const isObject = (obj) => obj && typeof obj === 'object' && !Array.isArray(obj);

        return objects.reduce((prev, obj) => {
            if (!obj) return prev;

            Object.keys(obj).forEach(key => {
                const pVal = prev[key];
                const oVal = obj[key];

                if (Array.isArray(pVal) && Array.isArray(oVal)) {
                    prev[key] = oVal; // Replace arrays
                } else if (isObject(pVal) && isObject(oVal)) {
                    prev[key] = this.deepMerge(pVal, oVal);
                } else {
                    prev[key] = oVal;
                }
            });

            return prev;
        }, {});
    }

    /**
     * Setup file watching for hot reload
     */
    async setupFileWatching() {
        const filesToWatch = [
            this.paths.default,
            this.paths.environment,
            this.paths.override
        ];

        for (const filePath of filesToWatch) {
            try {
                // Check if file exists
                await fs.access(filePath);

                // Watch for changes
                const watcher = fsSync.watch(filePath, async (eventType) => {
                    if (eventType === 'change') {
                        console.log(`\n🔄 Configuration file changed: ${path.basename(filePath)}`);
                        await this.reload();
                    }
                });

                this.watchers.set(filePath, watcher);
            } catch (error) {
                // File doesn't exist, skip watching
                if (error.code !== 'ENOENT') {
                    console.warn(`   ⚠️  Failed to watch ${filePath}: ${error.message}`);
                }
            }
        }

        if (this.watchers.size > 0) {
            console.log(`   ✓ Watching ${this.watchers.size} configuration files`);
        }
    }

    /**
     * Reload configuration dynamically
     */
    async reload() {
        try {
            console.log(`🔄 Reloading configuration...`);

            const oldConfig = JSON.parse(JSON.stringify(this.config));

            await this.loadConfiguration();

            console.log(`✅ Configuration reloaded successfully`);

            this.emit('reloaded', {
                old: oldConfig,
                new: this.config,
                timestamp: new Date().toISOString()
            });

            return true;
        } catch (error) {
            console.error(`❌ Failed to reload configuration:`, error.message);
            this.emit('reload-error', error);
            return false;
        }
    }

    /**
     * Get configuration value by path
     */
    get(path, defaultValue = undefined) {
        if (!this.config) {
            throw new Error('Configuration not loaded');
        }

        const keys = path.split('.');
        let value = this.config;

        for (const key of keys) {
            if (value && typeof value === 'object' && key in value) {
                value = value[key];
            } else {
                return defaultValue;
            }
        }

        return value;
    }

    /**
     * Set configuration value by path (runtime only, not persisted)
     */
    set(path, value) {
        if (!this.config) {
            throw new Error('Configuration not loaded');
        }

        const keys = path.split('.');
        const lastKey = keys.pop();
        let obj = this.config;

        for (const key of keys) {
            if (!(key in obj)) {
                obj[key] = {};
            }
            obj = obj[key];
        }

        obj[lastKey] = value;

        this.emit('config-changed', { path, value, timestamp: new Date().toISOString() });
    }

    /**
     * Check if configuration has a specific path
     */
    has(path) {
        return this.get(path, undefined) !== undefined;
    }

    /**
     * Get all configuration
     */
    getAll() {
        return JSON.parse(JSON.stringify(this.config));
    }

    /**
     * Get configuration metadata
     */
    getMetadata() {
        return { ...this.metadata };
    }

    /**
     * Validate current configuration
     */
    validateConfiguration() {
        if (!this.validate) {
            throw new Error('Schema not loaded');
        }

        const valid = this.validate(this.config);

        return {
            valid,
            errors: valid ? null : this.validate.errors
        };
    }

    /**
     * Save to configuration history
     */
    async saveToHistory() {
        try {
            // Ensure history directory exists
            await fs.mkdir(this.paths.history, { recursive: true });

            const timestamp = Date.now();
            const historyFile = path.join(
                this.paths.history,
                `config-${this.metadata.version}-${timestamp}.json`
            );

            const historyEntry = {
                config: this.config,
                metadata: this.metadata,
                timestamp: new Date().toISOString()
            };

            await fs.writeFile(historyFile, JSON.stringify(historyEntry, null, 2));

            // Add to history
            this.configHistory.unshift({
                file: historyFile,
                version: this.metadata.version,
                timestamp
            });

            // Trim history
            if (this.configHistory.length > this.options.maxVersions) {
                const toDelete = this.configHistory.splice(this.options.maxVersions);

                for (const entry of toDelete) {
                    try {
                        await fs.unlink(entry.file);
                    } catch (error) {
                        // Ignore errors
                    }
                }
            }
        } catch (error) {
            console.warn(`   ⚠️  Failed to save configuration history: ${error.message}`);
        }
    }

    /**
     * Load configuration history
     */
    async loadHistory() {
        try {
            const files = await fs.readdir(this.paths.history);

            this.configHistory = files
                .filter(f => f.startsWith('config-') && f.endsWith('.json'))
                .map(f => {
                    const match = f.match(/config-(.+)-(\d+)\.json$/);
                    return {
                        file: path.join(this.paths.history, f),
                        version: match ? match[1] : 'unknown',
                        timestamp: match ? parseInt(match[2]) : 0
                    };
                })
                .sort((a, b) => b.timestamp - a.timestamp);

            console.log(`   ✓ Loaded ${this.configHistory.length} configuration versions`);
        } catch (error) {
            if (error.code !== 'ENOENT') {
                console.warn(`   ⚠️  Failed to load configuration history: ${error.message}`);
            }
        }
    }

    /**
     * Rollback to a previous configuration version
     */
    async rollback(version = null) {
        try {
            let targetEntry;

            if (version) {
                targetEntry = this.configHistory.find(entry => entry.version === version);
            } else {
                // Rollback to previous version
                targetEntry = this.configHistory[1];
            }

            if (!targetEntry) {
                throw new Error(`Version ${version || 'previous'} not found in history`);
            }

            console.log(`🔄 Rolling back to version ${targetEntry.version}...`);

            const historyContent = await fs.readFile(targetEntry.file, 'utf8');
            const historyEntry = JSON.parse(historyContent);

            this.config = historyEntry.config;
            this.metadata = {
                ...historyEntry.metadata,
                rolledBackAt: new Date().toISOString(),
                rolledBackFrom: this.metadata.version
            };

            console.log(`✅ Rolled back to version ${targetEntry.version}`);

            this.emit('rollback', {
                from: this.metadata.rolledBackFrom,
                to: targetEntry.version,
                timestamp: this.metadata.rolledBackAt
            });

            return true;
        } catch (error) {
            console.error(`❌ Rollback failed:`, error.message);
            return false;
        }
    }

    /**
     * List all available versions
     */
    listVersions() {
        return this.configHistory.map(entry => ({
            version: entry.version,
            timestamp: new Date(entry.timestamp).toISOString(),
            file: path.basename(entry.file)
        }));
    }

    /**
     * Export configuration to file
     */
    async export(filePath, options = {}) {
        const exportData = {
            config: this.config,
            metadata: this.metadata,
            exportedAt: new Date().toISOString(),
            ...options
        };

        await fs.writeFile(filePath, JSON.stringify(exportData, null, 2));
        console.log(`✅ Configuration exported to ${filePath}`);
    }

    /**
     * Import configuration from file
     */
    async import(filePath, options = {}) {
        try {
            const content = await fs.readFile(filePath, 'utf8');
            const importData = JSON.parse(content);

            if (options.validate && this.validate) {
                const valid = this.validate(importData.config);

                if (!valid) {
                    throw new Error('Imported configuration is invalid');
                }
            }

            this.config = importData.config;
            this.metadata = {
                ...importData.metadata,
                importedAt: new Date().toISOString()
            };

            console.log(`✅ Configuration imported from ${filePath}`);

            this.emit('imported', { filePath, timestamp: this.metadata.importedAt });

            return true;
        } catch (error) {
            console.error(`❌ Import failed:`, error.message);
            return false;
        }
    }

    /**
     * Cleanup resources
     */
    async cleanup() {
        console.log(`🧹 Cleaning up Configuration Manager...`);

        // Close file watchers
        for (const [filePath, watcher] of this.watchers) {
            try {
                watcher.close();
            } catch (error) {
                console.warn(`   ⚠️  Failed to close watcher for ${filePath}`);
            }
        }

        this.watchers.clear();

        console.log(`✅ Configuration Manager cleaned up`);
    }

    /**
     * Get configuration summary
     */
    getSummary() {
        return {
            environment: this.metadata.environment,
            version: this.metadata.version,
            loadedAt: this.metadata.loadedAt,
            lastReload: this.metadata.lastReload,
            reloadCount: this.metadata.reloadCount,
            historySize: this.configHistory.length,
            watching: this.options.enableWatch,
            watchingFiles: this.watchers.size,
            validated: this.options.validateOnLoad
        };
    }
}

module.exports = ConfigurationManager;

// Demo
if (require.main === module) {
    async function demo() {
        const manager = new ConfigurationManager({
            environment: process.env.NODE_ENV || 'development',
            enableWatch: true,
            enableVersioning: true
        });

        try {
            await manager.initialize();

            // Get configuration values
            console.log('\n📋 Configuration Examples:');
            console.log(`   Server Port: ${manager.get('server.port')}`);
            console.log(`   Orchestrator Headless: ${manager.get('orchestrator.headless')}`);
            console.log(`   Logging Level: ${manager.get('logging.level')}`);
            console.log(`   Environment: ${manager.get('environment')}`);

            // Test runtime modification
            console.log('\n🔧 Runtime Modification:');
            manager.set('server.port', 4000);
            console.log(`   New Server Port: ${manager.get('server.port')}`);

            // Show summary
            console.log('\n📊 Configuration Summary:');
            const summary = manager.getSummary();
            Object.entries(summary).forEach(([key, value]) => {
                console.log(`   ${key}: ${value}`);
            });

            // List versions
            const versions = manager.listVersions();
            if (versions.length > 0) {
                console.log('\n📚 Available Versions:');
                versions.forEach((v, i) => {
                    console.log(`   ${i + 1}. ${v.version} - ${v.timestamp}`);
                });
            }

            // Listen for reload events
            manager.on('reloaded', (event) => {
                console.log('\n🔄 Configuration Reloaded Event:');
                console.log(`   Timestamp: ${event.timestamp}`);
            });

            // Keep running to demonstrate file watching
            if (manager.options.enableWatch) {
                console.log('\n👀 Watching for configuration changes... (Press Ctrl+C to exit)');

                process.on('SIGINT', async () => {
                    console.log('\n\n🛑 Shutting down...');
                    await manager.cleanup();
                    process.exit(0);
                });
            } else {
                await manager.cleanup();
            }
        } catch (error) {
            console.error('Error:', error);
            await manager.cleanup();
            process.exit(1);
        }
    }

    demo().catch(console.error);
}
