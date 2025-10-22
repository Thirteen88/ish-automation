# Configuration Management System

Complete production-ready configuration management system for the AI orchestrator with hot reload, secrets management, feature flags, and comprehensive monitoring.

## 🚀 Features

### Configuration Management (`config-manager.js`)
- **Environment-Based Configuration**: Separate configs for development, staging, and production
- **JSON Schema Validation**: Automatic validation of configuration structure
- **Hot Reload**: Dynamic configuration updates without restart
- **File Watching**: Automatic reload when config files change
- **Configuration Versioning**: Track and rollback configuration changes
- **Deep Merge**: Intelligent merging of configuration layers (default → environment → override)
- **Type-Safe Access**: Get/set configuration values with path notation

### Secrets Management (`secrets-manager.js`)
- **Encrypted Storage**: AES-256-GCM encryption for sensitive data
- **Environment Variables**: Automatic loading of common API keys
- **Key Rotation**: Automated rotation tracking and warnings
- **Access Control**: Permission-based access to secrets
- **Audit Logging**: Complete audit trail of secret access
- **Multiple Backends**: File, memory, or environment variable storage
- **Expiration Support**: Set expiration dates for secrets

### Feature Flags (`feature-flags.js`)
- **Dynamic Enabling/Disabling**: Toggle features without restart
- **Gradual Rollout**: Percentage-based rollout (0-100%)
- **A/B Testing**: Multi-variant testing with custom weights
- **User Targeting**: Enable features for specific users or groups
- **Condition-Based**: Complex conditions for feature activation
- **Date Ranges**: Schedule feature activation/deactivation
- **Real-Time Updates**: Instant flag changes via file watching
- **Analytics**: Track feature usage and variant distribution

### Production Orchestrator (`production-orchestrator.js`)
- **Integrated System**: All components working together
- **Error Recovery**: Automatic retry and fallback mechanisms
- **Health Monitoring**: Continuous system health checks
- **Resource Management**: Automatic cleanup and limits
- **Performance Metrics**: Track latency, throughput, and errors
- **Graceful Shutdown**: Clean resource cleanup on exit
- **Production Ready**: Optimized for production workloads

## 📁 File Structure

```
/home/gary/ish-automation/
├── config/
│   ├── schema.json           # JSON schema for validation
│   ├── default.json          # Default configuration
│   ├── development.json      # Development overrides
│   ├── production.json       # Production overrides
│   └── feature-flags.json    # Feature flags config
├── config-manager.js         # Configuration management
├── secrets-manager.js        # Secrets management
├── feature-flags.js          # Feature flags system
├── production-orchestrator.js # Main orchestrator
└── production-example.js     # Complete demo
```

## 🔧 Installation

1. **Install Dependencies**:
```bash
npm install ajv playwright winston
```

2. **Set Environment Variables**:
```bash
export NODE_ENV=development
export ENCRYPTION_KEY=your-secure-encryption-key-here
```

3. **Initialize Configuration**:
```bash
# Config files will be created automatically on first run
node production-example.js
```

## 📖 Usage

### Basic Usage

```javascript
const ProductionOrchestrator = require('./production-orchestrator');

const orchestrator = new ProductionOrchestrator({
    environment: 'production',
    enableHealthMonitoring: true,
    enableFeatureFlags: true,
    autoRecovery: true
});

await orchestrator.initialize();

// Execute requests
const result = await orchestrator.execute({
    type: 'text',
    prompt: 'Your prompt here',
    model: 'gpt-4'
}, {
    userId: 'user-123'
});

console.log(result);
```

### Configuration Management

```javascript
// Get configuration values
const port = orchestrator.configManager.get('server.port');
const timeout = orchestrator.configManager.get('orchestrator.timeout');

// Set runtime values (not persisted)
orchestrator.configManager.set('server.port', 4000);

// Listen for configuration changes
orchestrator.configManager.on('reloaded', (event) => {
    console.log('Config reloaded:', event.timestamp);
});

// Rollback to previous version
await orchestrator.configManager.rollback('1.0.0');

// Export configuration
await orchestrator.configManager.export('./backup.json');
```

### Secrets Management

```javascript
// Set a secret
await orchestrator.secretsManager.setSecret('API_KEY', 'sk-abc123', {
    description: 'OpenAI API Key',
    tags: ['api', 'openai'],
    userId: 'admin'
});

// Get a secret
const apiKey = await orchestrator.secretsManager.getSecret('API_KEY', {
    userId: 'admin'
});

// Rotate a secret
await orchestrator.secretsManager.rotateSecret('API_KEY', 'sk-new-key', {
    userId: 'admin'
});

// List secrets
const secrets = orchestrator.secretsManager.listSecrets();

// Check rotation status
const needRotation = orchestrator.secretsManager.getSecretsNeedingRotation();
```

### Feature Flags

```javascript
// Check if feature is enabled
const enabled = orchestrator.featureFlags.isEnabled('newFeature', {
    userId: 'user-123',
    groups: ['beta']
});

// Get A/B test variant
const variant = orchestrator.featureFlags.getVariant('experimentFeature', {
    userId: 'user-123'
});

// Update flag at runtime
await orchestrator.featureFlags.updateFlag('newFeature', {
    enabled: true,
    rolloutPercentage: 50
});

// Add new flag
await orchestrator.featureFlags.addFlag('anotherFeature', {
    enabled: true,
    rolloutPercentage: 100,
    description: 'Another feature'
});

// Get analytics
const analytics = orchestrator.featureFlags.getAnalytics('newFeature');
console.log(analytics);
```

### Health Monitoring

```javascript
// Get system health
const health = await orchestrator.healthMonitor.checkHealth();
console.log(health);

// Get metrics
const metrics = orchestrator.healthMonitor.collectMetrics();
console.log(`CPU: ${metrics.cpu}%`);
console.log(`Memory: ${metrics.memory}%`);

// Listen for alerts
orchestrator.on('health-alert', (alert) => {
    console.log('Alert:', alert);
});
```

## 🔒 Security Best Practices

1. **Encryption Keys**: Always use strong encryption keys in production
   ```bash
   export ENCRYPTION_KEY=$(openssl rand -base64 32)
   ```

2. **Secrets Rotation**: Rotate secrets regularly (default: 90 days)
   ```javascript
   rotationWarningDays: 30,
   maxRotationDays: 90
   ```

3. **Access Control**: Enable access control for sensitive secrets
   ```javascript
   enableAccessControl: true
   ```

4. **Audit Logging**: Always enable audit logs in production
   ```javascript
   enableAuditLog: true
   ```

5. **HTTPS**: Use HTTPS for all production deployments

## 📊 Configuration Schema

The system uses JSON Schema for validation. Key sections:

```json
{
  "environment": "production",
  "version": "1.0.0",
  "server": {
    "port": 8080,
    "host": "0.0.0.0",
    "timeout": 120000,
    "maxConnections": 1000
  },
  "orchestrator": {
    "headless": true,
    "timeout": 120000,
    "maxConcurrent": 20,
    "retryAttempts": 5,
    "enableCache": true
  },
  "security": {
    "enableEncryption": true,
    "enableAuditLog": true,
    "secretRotationDays": 30
  },
  "logging": {
    "level": "warn",
    "format": "json",
    "enableFile": true
  },
  "monitoring": {
    "enabled": true,
    "healthCheckInterval": 15000,
    "alertThresholds": {
      "cpuPercent": 70,
      "memoryPercent": 75,
      "errorRate": 0.01
    }
  }
}
```

## 🎯 Feature Flags Configuration

```json
{
  "flags": {
    "ultraParallelExecution": {
      "enabled": true,
      "rolloutPercentage": 100,
      "enabledUsers": [],
      "description": "Ultra-parallel execution mode"
    },
    "experimentalFeature": {
      "enabled": true,
      "rolloutPercentage": 50,
      "enabledUsers": ["user-1", "user-2"],
      "variants": [
        { "name": "control", "weight": 0.5 },
        { "name": "variant-a", "weight": 0.5 }
      ],
      "conditions": [
        {
          "property": "subscription",
          "operator": "equals",
          "value": "premium"
        }
      ],
      "startDate": "2025-01-01T00:00:00Z",
      "endDate": "2025-12-31T23:59:59Z"
    }
  }
}
```

## 📈 Monitoring & Metrics

### Available Metrics

```javascript
const metrics = orchestrator.getMetrics();

// Output:
{
  uptime: "2h 15m",
  requests: {
    total: 1000,
    successful: 950,
    failed: 50,
    errorRate: "5.00%"
  },
  performance: {
    averageLatency: "234.56ms",
    p95Latency: "456.78ms",
    p99Latency: "678.90ms"
  },
  resources: {
    pages: 5,
    contexts: 2,
    browserConnected: true
  },
  health: {
    status: "healthy",
    lastCheck: "2025-10-20T23:30:00Z"
  }
}
```

### Health Checks

Built-in health checks:
- **Browser**: Check if browser is connected
- **Configuration**: Validate configuration integrity
- **Secrets**: Verify secrets are loaded
- **Resources**: Check resource usage against limits

## 🔄 Hot Reload

Configuration files are watched for changes and automatically reloaded:

1. Edit any config file:
   - `config/development.json`
   - `config/production.json`
   - `config/feature-flags.json`

2. Changes are automatically detected and applied

3. Events are emitted:
   ```javascript
   orchestrator.on('config-reloaded', (event) => {
       console.log('Config reloaded at:', event.timestamp);
   });
   ```

## 🧪 Testing

Run the comprehensive demo:

```bash
# Development environment
NODE_ENV=development node production-example.js

# Production environment
NODE_ENV=production node production-example.js

# With custom encryption key
ENCRYPTION_KEY=my-secret-key NODE_ENV=production node production-example.js
```

## 🚀 Production Deployment

### 1. Environment Setup

```bash
# Set production environment
export NODE_ENV=production

# Set encryption key (CRITICAL!)
export ENCRYPTION_KEY=$(openssl rand -base64 32)

# Set API keys
export OPENAI_API_KEY=sk-...
export ANTHROPIC_API_KEY=sk-ant-...
export GOOGLE_API_KEY=...
```

### 2. Configuration

Update `config/production.json`:
- Set appropriate timeouts
- Configure connection limits
- Set logging levels
- Configure monitoring thresholds

### 3. Start the Orchestrator

```bash
node production-orchestrator.js
```

### 4. Monitor Health

```bash
# Check health endpoint
curl http://localhost:8080/health

# View metrics
curl http://localhost:8080/metrics
```

## 🔧 Troubleshooting

### Configuration Not Loading

```bash
# Check config file syntax
node -c config/production.json

# Validate against schema
npm install -g ajv-cli
ajv validate -s config/schema.json -d config/production.json
```

### Secrets Decryption Failed

```bash
# Verify encryption key is set
echo $ENCRYPTION_KEY

# Re-encrypt secrets with new key
node secrets-manager.js
```

### Feature Flags Not Working

```bash
# Check feature flags file
cat config/feature-flags.json

# Reload flags
# Edit the file to trigger hot reload
```

## 📚 Advanced Usage

### Custom Health Checks

```javascript
orchestrator.healthMonitor.addHealthCheck('custom', async () => {
    // Your custom logic
    return {
        healthy: true,
        message: 'Custom check passed'
    };
});
```

### Custom Error Handlers

```javascript
orchestrator.errorHandler.on('error', (error) => {
    // Custom error handling
    console.error('Custom handler:', error);
});
```

### Configuration Versioning

```javascript
// List all versions
const versions = orchestrator.configManager.listVersions();

// Rollback to specific version
await orchestrator.configManager.rollback('1.0.0');
```

## 🤝 Integration Examples

### Express Server

```javascript
const express = require('express');
const app = express();

const orchestrator = new ProductionOrchestrator();
await orchestrator.initialize();

app.post('/query', async (req, res) => {
    try {
        const result = await orchestrator.execute(req.body, {
            userId: req.user.id
        });
        res.json(result);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.listen(3000);
```

### Microservice Architecture

```javascript
// Service A
const orchestratorA = new ProductionOrchestrator({
    environment: 'production',
    configDir: './config/service-a'
});

// Service B
const orchestratorB = new ProductionOrchestrator({
    environment: 'production',
    configDir: './config/service-b'
});
```

## 📝 License

MIT

## 🙋 Support

For issues or questions:
1. Check the troubleshooting section
2. Review the demo examples
3. Check configuration schema
4. Enable debug logging

## 🎉 Summary

This configuration management system provides:

✅ **Production-Ready**: Battle-tested patterns and best practices
✅ **Secure**: Encrypted secrets, audit logs, access control
✅ **Flexible**: Feature flags, gradual rollouts, A/B testing
✅ **Resilient**: Error recovery, health monitoring, auto-recovery
✅ **Observable**: Comprehensive metrics and logging
✅ **Zero-Downtime**: Hot reload without restart
✅ **Developer-Friendly**: Easy to use, well-documented

Get started with: `node production-example.js`
