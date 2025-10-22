#!/usr/bin/env node

/**
 * Secrets Manager
 *
 * Secure secret management system with:
 * - Encrypted storage of API keys and sensitive data
 * - Environment variable loading with fallback
 * - Secure key rotation with audit trail
 * - Access control and permissions
 * - Audit logging for secret access
 * - Multiple backend support (file, memory, environment)
 */

const crypto = require('crypto');
const fs = require('fs').promises;
const fsSync = require('fs');
const path = require('path');
const EventEmitter = require('events');

class SecretsManager extends EventEmitter {
    constructor(options = {}) {
        super();

        this.options = {
            backend: options.backend || 'file', // file, memory, env
            secretsDir: options.secretsDir || path.join(__dirname, '.secrets'),
            encryptionKey: options.encryptionKey || process.env.ENCRYPTION_KEY,
            enableEncryption: options.enableEncryption !== false,
            enableAuditLog: options.enableAuditLog !== false,
            auditLogPath: options.auditLogPath || path.join(__dirname, 'logs', 'secrets-audit.log'),
            rotationWarningDays: options.rotationWarningDays || 30,
            maxRotationDays: options.maxRotationDays || 90,
            enableAccessControl: options.enableAccessControl !== false,
            ...options
        };

        // In-memory secrets store
        this.secrets = new Map();

        // Secrets metadata
        this.metadata = new Map();

        // Access control rules
        this.accessControl = new Map();

        // Encryption settings
        this.algorithm = 'aes-256-gcm';
        this.keyLength = 32;
        this.ivLength = 16;
        this.saltLength = 64;

        // Derive encryption key
        if (this.options.enableEncryption && this.options.encryptionKey) {
            this.encryptionKey = this.deriveKey(this.options.encryptionKey);
        }

        // Audit log buffer
        this.auditBuffer = [];
        this.auditFlushInterval = null;
    }

    /**
     * Initialize secrets manager
     */
    async initialize() {
        console.log(`🔐 Initializing Secrets Manager`);
        console.log(`   Backend: ${this.options.backend}`);
        console.log(`   Encryption: ${this.options.enableEncryption ? 'Enabled' : 'Disabled'}`);
        console.log(`   Audit Log: ${this.options.enableAuditLog ? 'Enabled' : 'Disabled'}`);

        try {
            // Ensure directories exist
            if (this.options.backend === 'file') {
                await fs.mkdir(this.options.secretsDir, { recursive: true });
            }

            if (this.options.enableAuditLog) {
                await fs.mkdir(path.dirname(this.options.auditLogPath), { recursive: true });
                this.startAuditLogFlushing();
            }

            // Load secrets based on backend
            await this.loadSecrets();

            // Load environment variables
            await this.loadEnvironmentVariables();

            console.log(`✅ Secrets Manager initialized`);
            console.log(`   Secrets Loaded: ${this.secrets.size}`);

            this.emit('initialized');

            return true;
        } catch (error) {
            console.error(`❌ Failed to initialize secrets manager:`, error.message);
            throw error;
        }
    }

    /**
     * Derive encryption key from passphrase
     */
    deriveKey(passphrase) {
        return crypto.pbkdf2Sync(passphrase, 'salt', 100000, this.keyLength, 'sha256');
    }

    /**
     * Encrypt data
     */
    encrypt(text) {
        if (!this.options.enableEncryption || !this.encryptionKey) {
            return text;
        }

        const iv = crypto.randomBytes(this.ivLength);
        const cipher = crypto.createCipheriv(this.algorithm, this.encryptionKey, iv);

        let encrypted = cipher.update(text, 'utf8', 'hex');
        encrypted += cipher.final('hex');

        const authTag = cipher.getAuthTag();

        return JSON.stringify({
            encrypted: encrypted,
            iv: iv.toString('hex'),
            authTag: authTag.toString('hex'),
            algorithm: this.algorithm
        });
    }

    /**
     * Decrypt data
     */
    decrypt(encryptedData) {
        if (!this.options.enableEncryption || !this.encryptionKey) {
            return encryptedData;
        }

        try {
            const data = JSON.parse(encryptedData);
            const decipher = crypto.createDecipheriv(
                data.algorithm,
                this.encryptionKey,
                Buffer.from(data.iv, 'hex')
            );

            decipher.setAuthTag(Buffer.from(data.authTag, 'hex'));

            let decrypted = decipher.update(data.encrypted, 'hex', 'utf8');
            decrypted += decipher.final('utf8');

            return decrypted;
        } catch (error) {
            throw new Error(`Decryption failed: ${error.message}`);
        }
    }

    /**
     * Set a secret
     */
    async setSecret(key, value, options = {}) {
        try {
            // Check access control
            if (this.options.enableAccessControl) {
                const hasAccess = await this.checkAccess(key, 'write', options.userId);
                if (!hasAccess) {
                    throw new Error(`Access denied: ${key}`);
                }
            }

            // Encrypt value
            const encryptedValue = this.encrypt(value);

            // Store in memory
            this.secrets.set(key, encryptedValue);

            // Store metadata
            this.metadata.set(key, {
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
                rotationRequired: false,
                lastRotation: new Date().toISOString(),
                accessCount: 0,
                tags: options.tags || [],
                description: options.description || '',
                expiresAt: options.expiresAt || null
            });

            // Persist to backend
            if (this.options.backend === 'file') {
                await this.persistSecret(key, encryptedValue);
            }

            // Audit log
            await this.auditLog('set', key, options.userId);

            this.emit('secret-set', { key, userId: options.userId });

            return true;
        } catch (error) {
            console.error(`Failed to set secret ${key}:`, error.message);
            throw error;
        }
    }

    /**
     * Get a secret
     */
    async getSecret(key, options = {}) {
        try {
            // Check access control
            if (this.options.enableAccessControl) {
                const hasAccess = await this.checkAccess(key, 'read', options.userId);
                if (!hasAccess) {
                    throw new Error(`Access denied: ${key}`);
                }
            }

            // Get from memory
            const encryptedValue = this.secrets.get(key);

            if (!encryptedValue) {
                throw new Error(`Secret not found: ${key}`);
            }

            // Check expiration
            const meta = this.metadata.get(key);
            if (meta && meta.expiresAt) {
                if (new Date(meta.expiresAt) < new Date()) {
                    throw new Error(`Secret expired: ${key}`);
                }
            }

            // Decrypt value
            const value = this.decrypt(encryptedValue);

            // Update metadata
            if (meta) {
                meta.accessCount++;
                meta.lastAccessed = new Date().toISOString();
            }

            // Check rotation warning
            if (meta && this.needsRotation(meta)) {
                console.warn(`⚠️  Secret ${key} needs rotation (last rotated ${meta.lastRotation})`);
            }

            // Audit log
            await this.auditLog('get', key, options.userId);

            this.emit('secret-accessed', { key, userId: options.userId });

            return value;
        } catch (error) {
            console.error(`Failed to get secret ${key}:`, error.message);
            throw error;
        }
    }

    /**
     * Delete a secret
     */
    async deleteSecret(key, options = {}) {
        try {
            // Check access control
            if (this.options.enableAccessControl) {
                const hasAccess = await this.checkAccess(key, 'delete', options.userId);
                if (!hasAccess) {
                    throw new Error(`Access denied: ${key}`);
                }
            }

            // Remove from memory
            this.secrets.delete(key);
            this.metadata.delete(key);

            // Remove from backend
            if (this.options.backend === 'file') {
                await this.deletePersistedSecret(key);
            }

            // Audit log
            await this.auditLog('delete', key, options.userId);

            this.emit('secret-deleted', { key, userId: options.userId });

            return true;
        } catch (error) {
            console.error(`Failed to delete secret ${key}:`, error.message);
            throw error;
        }
    }

    /**
     * Rotate a secret
     */
    async rotateSecret(key, newValue, options = {}) {
        try {
            const oldValue = await this.getSecret(key, options);

            await this.setSecret(key, newValue, options);

            const meta = this.metadata.get(key);
            if (meta) {
                meta.lastRotation = new Date().toISOString();
                meta.rotationRequired = false;
            }

            // Audit log
            await this.auditLog('rotate', key, options.userId);

            this.emit('secret-rotated', { key, userId: options.userId });

            return {
                success: true,
                oldValue: options.returnOldValue ? oldValue : undefined
            };
        } catch (error) {
            console.error(`Failed to rotate secret ${key}:`, error.message);
            throw error;
        }
    }

    /**
     * Check if secret needs rotation
     */
    needsRotation(metadata) {
        if (!metadata.lastRotation) return true;

        const lastRotation = new Date(metadata.lastRotation);
        const daysSinceRotation = (Date.now() - lastRotation.getTime()) / (1000 * 60 * 60 * 24);

        return daysSinceRotation >= this.options.rotationWarningDays;
    }

    /**
     * List all secrets (keys only)
     */
    listSecrets(options = {}) {
        const secrets = [];

        for (const [key, _] of this.secrets) {
            const meta = this.metadata.get(key);

            secrets.push({
                key,
                createdAt: meta?.createdAt,
                updatedAt: meta?.updatedAt,
                lastAccessed: meta?.lastAccessed,
                accessCount: meta?.accessCount,
                needsRotation: meta ? this.needsRotation(meta) : false,
                tags: meta?.tags || [],
                description: meta?.description || ''
            });
        }

        // Filter by tags if specified
        if (options.tags && options.tags.length > 0) {
            return secrets.filter(s =>
                options.tags.some(tag => s.tags.includes(tag))
            );
        }

        return secrets;
    }

    /**
     * Persist secret to file
     */
    async persistSecret(key, encryptedValue) {
        const filePath = path.join(this.options.secretsDir, `${key}.enc`);
        const meta = this.metadata.get(key);

        const data = {
            value: encryptedValue,
            metadata: meta
        };

        await fs.writeFile(filePath, JSON.stringify(data, null, 2));
    }

    /**
     * Delete persisted secret
     */
    async deletePersistedSecret(key) {
        const filePath = path.join(this.options.secretsDir, `${key}.enc`);

        try {
            await fs.unlink(filePath);
        } catch (error) {
            if (error.code !== 'ENOENT') {
                throw error;
            }
        }
    }

    /**
     * Load secrets from backend
     */
    async loadSecrets() {
        if (this.options.backend === 'file') {
            await this.loadSecretsFromFiles();
        } else if (this.options.backend === 'env') {
            await this.loadSecretsFromEnv();
        }
    }

    /**
     * Load secrets from files
     */
    async loadSecretsFromFiles() {
        try {
            const files = await fs.readdir(this.options.secretsDir);

            for (const file of files) {
                if (file.endsWith('.enc')) {
                    const key = file.replace('.enc', '');
                    const filePath = path.join(this.options.secretsDir, file);

                    try {
                        const content = await fs.readFile(filePath, 'utf8');
                        const data = JSON.parse(content);

                        this.secrets.set(key, data.value);
                        if (data.metadata) {
                            this.metadata.set(key, data.metadata);
                        }
                    } catch (error) {
                        console.warn(`   ⚠️  Failed to load secret from ${file}: ${error.message}`);
                    }
                }
            }

            console.log(`   ✓ Loaded ${this.secrets.size} secrets from files`);
        } catch (error) {
            if (error.code !== 'ENOENT') {
                console.warn(`   ⚠️  Failed to load secrets from files: ${error.message}`);
            }
        }
    }

    /**
     * Load secrets from environment variables
     */
    async loadSecretsFromEnv() {
        const envPrefix = this.options.envPrefix || 'SECRET_';

        for (const [key, value] of Object.entries(process.env)) {
            if (key.startsWith(envPrefix)) {
                const secretKey = key.substring(envPrefix.length);
                this.secrets.set(secretKey, this.encrypt(value));
            }
        }

        console.log(`   ✓ Loaded ${this.secrets.size} secrets from environment`);
    }

    /**
     * Load environment variables as secrets
     */
    async loadEnvironmentVariables() {
        const commonKeys = [
            'OPENAI_API_KEY',
            'ANTHROPIC_API_KEY',
            'GOOGLE_API_KEY',
            'TOGETHER_API_KEY',
            'REPLICATE_API_TOKEN',
            'DATABASE_URL',
            'REDIS_URL',
            'JWT_SECRET'
        ];

        for (const key of commonKeys) {
            if (process.env[key] && !this.secrets.has(key)) {
                try {
                    await this.setSecret(key, process.env[key], {
                        description: `Loaded from environment variable`,
                        tags: ['env', 'auto-loaded']
                    });
                } catch (error) {
                    // Ignore errors
                }
            }
        }
    }

    /**
     * Check access control
     */
    async checkAccess(key, action, userId) {
        if (!this.options.enableAccessControl) {
            return true;
        }

        const rules = this.accessControl.get(key);

        if (!rules) {
            return true; // No rules = allow all
        }

        if (rules.allowedUsers && rules.allowedUsers.includes(userId)) {
            return true;
        }

        if (rules.allowedActions && !rules.allowedActions.includes(action)) {
            return false;
        }

        return !rules.denyAll;
    }

    /**
     * Set access control rules
     */
    setAccessControl(key, rules) {
        this.accessControl.set(key, rules);

        this.emit('access-control-updated', { key, rules });
    }

    /**
     * Audit log entry
     */
    async auditLog(action, key, userId = 'system') {
        if (!this.options.enableAuditLog) {
            return;
        }

        const entry = {
            timestamp: new Date().toISOString(),
            action,
            key,
            userId,
            ip: this.options.currentIp || 'unknown'
        };

        this.auditBuffer.push(entry);

        this.emit('audit-log', entry);
    }

    /**
     * Start audit log flushing
     */
    startAuditLogFlushing() {
        this.auditFlushInterval = setInterval(async () => {
            await this.flushAuditLog();
        }, 5000);
    }

    /**
     * Flush audit log to file
     */
    async flushAuditLog() {
        if (this.auditBuffer.length === 0) {
            return;
        }

        try {
            const entries = this.auditBuffer.splice(0);
            const logLines = entries.map(e => JSON.stringify(e)).join('\n') + '\n';

            await fs.appendFile(this.options.auditLogPath, logLines);
        } catch (error) {
            console.error(`Failed to flush audit log:`, error.message);
            // Put entries back
            this.auditBuffer.unshift(...entries);
        }
    }

    /**
     * Get secrets requiring rotation
     */
    getSecretsNeedingRotation() {
        const secrets = [];

        for (const [key, meta] of this.metadata) {
            if (this.needsRotation(meta)) {
                secrets.push({
                    key,
                    lastRotation: meta.lastRotation,
                    daysSinceRotation: Math.floor(
                        (Date.now() - new Date(meta.lastRotation).getTime()) / (1000 * 60 * 60 * 24)
                    )
                });
            }
        }

        return secrets;
    }

    /**
     * Export secrets (encrypted)
     */
    async exportSecrets(filePath) {
        const exportData = {
            secrets: Array.from(this.secrets.entries()),
            metadata: Array.from(this.metadata.entries()),
            exportedAt: new Date().toISOString(),
            encrypted: this.options.enableEncryption
        };

        await fs.writeFile(filePath, JSON.stringify(exportData, null, 2));
        console.log(`✅ Secrets exported to ${filePath}`);
    }

    /**
     * Import secrets
     */
    async importSecrets(filePath) {
        try {
            const content = await fs.readFile(filePath, 'utf8');
            const importData = JSON.parse(content);

            this.secrets = new Map(importData.secrets);
            this.metadata = new Map(importData.metadata);

            console.log(`✅ Imported ${this.secrets.size} secrets from ${filePath}`);

            this.emit('secrets-imported', { count: this.secrets.size });

            return true;
        } catch (error) {
            console.error(`Failed to import secrets:`, error.message);
            return false;
        }
    }

    /**
     * Cleanup resources
     */
    async cleanup() {
        console.log(`🧹 Cleaning up Secrets Manager...`);

        // Flush audit log
        if (this.auditFlushInterval) {
            clearInterval(this.auditFlushInterval);
            await this.flushAuditLog();
        }

        // Clear secrets from memory
        this.secrets.clear();
        this.metadata.clear();

        console.log(`✅ Secrets Manager cleaned up`);
    }
}

module.exports = SecretsManager;

// Demo
if (require.main === module) {
    async function demo() {
        const manager = new SecretsManager({
            backend: 'file',
            enableEncryption: true,
            enableAuditLog: true,
            encryptionKey: 'demo-encryption-key-change-in-production'
        });

        try {
            await manager.initialize();

            // Set some secrets
            console.log('\n🔐 Setting Secrets:');
            await manager.setSecret('OPENAI_API_KEY', 'sk-demo-key-123456', {
                description: 'OpenAI API Key',
                tags: ['api', 'openai']
            });

            await manager.setSecret('DATABASE_PASSWORD', 'super-secret-password', {
                description: 'Database Password',
                tags: ['database', 'credentials']
            });

            // Get secrets
            console.log('\n🔓 Getting Secrets:');
            const apiKey = await manager.getSecret('OPENAI_API_KEY');
            console.log(`   OPENAI_API_KEY: ${apiKey.substring(0, 10)}...`);

            // List secrets
            console.log('\n📋 List Secrets:');
            const secrets = manager.listSecrets();
            secrets.forEach(s => {
                console.log(`   ${s.key}:`);
                console.log(`     Created: ${s.createdAt}`);
                console.log(`     Accessed: ${s.accessCount} times`);
                console.log(`     Tags: ${s.tags.join(', ')}`);
            });

            // Check rotation
            console.log('\n🔄 Rotation Status:');
            const needRotation = manager.getSecretsNeedingRotation();
            if (needRotation.length > 0) {
                needRotation.forEach(s => {
                    console.log(`   ${s.key}: ${s.daysSinceRotation} days since rotation`);
                });
            } else {
                console.log(`   All secrets are up to date`);
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
