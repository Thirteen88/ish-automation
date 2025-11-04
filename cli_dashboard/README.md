# ISH Chat CLI Status Dashboard

A comprehensive real-time terminal dashboard for monitoring the multi-instance ISH Chat AI system. Provides live visibility into AI provider status, performance metrics, health monitoring, and system management capabilities.

## 🚀 Features

### Real-time Monitoring
- **Live Instance Status**: Monitor all AI instances across providers (ZAI, OpenAI, Claude, Perplexity)
- **Health Monitoring**: Real-time health checks and status updates
- **Performance Metrics**: Response times, success rates, request volumes
- **Load Balancing**: View current load distribution and utilization
- **Auto-scaling Status**: Monitor auto-scaling events and group status

### Interactive Controls
- **Keyboard Navigation**: Navigate instances and trigger actions
- **Instance Management**: Health checks, detailed information views
- **System Controls**: Start/stop monitoring, auto-scaling controls
- **Alert Management**: Clear and acknowledge alerts
- **Configuration**: Adjust refresh rates and display options

### Rich Visualizations
- **ASCII Charts**: Historical performance trends
- **Provider Analytics**: Comparative performance analysis
- **Health Indicators**: Color-coded status and alerts
- **Load Distribution**: Visual representation of system load
- **Sparklines**: Compact performance indicators

### Advanced Features
- **Historical Data**: Configurable retention and trend analysis
- **Alert System**: Configurable thresholds and notifications
- **Provider Statistics**: Per-provider performance tracking
- **Export Capabilities**: Save dashboard data and configurations
- **Debug Mode**: Detailed logging and diagnostics

## 📋 Requirements

### System Requirements
- Python 3.8 or higher
- Terminal with ANSI color support
- Network access to ISH Chat backend API

### Dependencies
```bash
# Core dependencies
aiohttp>=3.8.0
asyncio-throttle>=1.0.2
pydantic>=2.0.0

# Rich UI (recommended)
rich>=13.0.0
textual>=0.41.0

# Optional: For interactive controls
readchar>=4.0.0

# Development dependencies
pytest>=7.0.0
pytest-asyncio>=0.21.0
black>=23.0.0
```

## 🛠️ Installation

### Method 1: Clone Repository
```bash
cd /home/gary/multi-model-orchestrator/ish-chat-backend/cli_dashboard
```

### Method 2: Install Dependencies
```bash
# Install all dependencies
pip install -r requirements.txt

# Or install manually
pip install aiohttp rich pydantic readchar
```

### Method 3: Development Setup
```bash
# Install in development mode
pip install -e .

# Install development dependencies
pip install -r requirements.txt
```

## 🎮 Usage

### Basic Usage

#### Start the Dashboard
```bash
# Basic startup
python main.py

# With custom configuration
python main.py --config /path/to/config.json

# Custom refresh rate
python main.py --refresh-rate 1.0

# Custom API endpoint
python main.py --api-base http://localhost:8080

# Debug mode
python main.py --debug
```

#### Command Line Options
```bash
usage: main.py [-h] [--config CONFIG] [--refresh-rate REFRESH_RATE]
               [--api-base API_BASE] [--log-level {DEBUG,INFO,WARNING,ERROR}]
               [--debug]

ISH Chat CLI Status Dashboard - Real-time AI System Monitoring

options:
  -h, --help            Show this help message and exit
  --config CONFIG, -c CONFIG
                        Path to configuration file
  --refresh-rate REFRESH_RATE, -r REFRESH_RATE
                        Refresh rate in seconds
  --api-base API_BASE   Base URL for ISH Chat API
  --log-level {DEBUG,INFO,WARNING,ERROR}
                        Logging level
  --debug, -d           Enable debug mode
```

### Interactive Controls

#### Navigation
```
↑/↓ or j/k     - Navigate through instances
←/→ or h/l     - Select previous/next instance
1-4           - Select provider (ZAI, OpenAI, Anthropic, Perplexity)
```

#### Instance Actions
```
d/D           - Show detailed information for selected instance
t/T           - Trigger health check for selected instance
```

#### System Controls
```
r/R           - Force refresh dashboard data
s/S           - Start health monitoring service
x/X           - Stop health monitoring service
a/A           - Start auto-scaling service
z/Z           - Stop auto-scaling service
c/C           - Clear all active alerts
```

#### Display Options
```
+/-           - Increase/decrease refresh rate
g/G           - Toggle debug mode
h/H/?         - Show/hide help screen
q/Q or Ctrl+C - Exit dashboard
```

### Configuration

#### Configuration File
Create a JSON configuration file:

```json
{
  "api_base_url": "http://localhost:8000",
  "refresh_rate": 2.0,
  "enable_instance_monitoring": true,
  "enable_health_monitoring": true,
  "enable_load_balancer_metrics": true,
  "enable_auto_scaling_metrics": true,
  "enable_external_agents": true,
  "color_enabled": true,
  "show_performance_graphs": true,
  "show_alerts": true,
  "alert_high_response_time": 5.0,
  "alert_low_success_rate": 90.0,
  "alert_high_load_threshold": 80.0,
  "history_retention_minutes": 60,
  "max_history_points": 100,
  "debug": false,
  "simulate_data": false
}
```

#### Environment Variables
```bash
export ISH_CHAT_API_URL="http://localhost:8000"
export ISH_CHAT_DASHBOARD_DEBUG="true"
export ISH_CHAT_DASHBOARD_REFRESH_RATE="1.0"
```

### Advanced Usage

#### Running with Simulated Data
```bash
# Useful for testing without backend
python main.py --debug --simulate-data
```

#### Custom Configuration Profiles
```bash
# Development configuration
python main.py --config configs/dev.json

# Production configuration
python main.py --config configs/prod.json

# Minimal configuration
python main.py --config configs/minimal.json
```

#### Logging and Debugging
```bash
# Enable debug logging
python main.py --log-level DEBUG --debug

# Save logs to file
export ISH_CHAT_DASHBOARD_LOG_FILE="/tmp/dashboard.log"
python main.py --debug
```

## 📊 Dashboard Components

### Main Sections

#### Header
- System title and status
- Last update timestamp
- Performance statistics

#### Instances Panel
- List of all AI instances
- Real-time status indicators
- Performance metrics
- Health and load information

#### System Status
- Overall system health
- Service status (health monitoring, auto-scaling)
- Performance statistics
- Error rates and success metrics

#### Alerts Panel
- Active system alerts
- Color-coded severity levels
- Alert details and recommendations

#### External Agents
- External AI agent status
- Connection status
- Performance metrics

#### Analytics
- Provider distribution charts
- Performance trends
- Historical data visualization

### Status Indicators

#### Instance Status
- 🟢 **Healthy**: Instance operating normally
- 🟡 **Warning**: Performance degradation
- 🔴 **Unhealthy**: Instance has issues
- ⚪ **Inactive**: Instance not active

#### Performance Metrics
- **Response Time**: Average request response time
- **Success Rate**: Percentage of successful requests
- **Load**: Current vs maximum concurrent requests
- **Health Score**: Overall instance health rating

#### Alert Severity
- 🔴 **Error**: Critical issues requiring immediate attention
- 🟡 **Warning**: Performance issues or degradations
- 🔵 **Info**: Informational notifications

## 🔧 Integration

### With ISH Chat Backend

The dashboard integrates seamlessly with the ISH Chat backend:

1. **API Integration**: Uses Instance Manager API endpoints
2. **Real-time Data**: Polls for updates every 1-10 seconds
3. **Health Monitoring**: Connects to health monitoring service
4. **Load Balancing**: Tracks load balancer metrics and distribution

### API Endpoints Used

```
GET  /api/instances/                    # List all instances
GET  /api/instances/{id}                # Get instance details
GET  /api/instances/{id}/health         # Get health status
GET  /api/instances/{id}/metrics        # Get performance metrics
POST /api/instances/{id}/health-check   # Trigger health check
GET  /api/instances/status              # Get system status
GET  /api/instances/health-summary      # Get health summary
GET  /api/instances/load-balancer/metrics  # Load balancer metrics
GET  /api/instances/auto-scaling/metrics   # Auto-scaling metrics
```

### External Services

The dashboard can also integrate with:

- **External Agent Delegator**: Monitor external AI agents
- **Android Service**: Track mobile device status
- **Prometheus**: Metrics collection (if enabled)
- **WebSocket**: Real-time updates (if available)

## 🚨 Troubleshooting

### Common Issues

#### Connection Errors
```bash
# Check if backend is running
curl http://localhost:8000/api/instances/status

# Verify API endpoint
python -c "import requests; print(requests.get('http://localhost:8000/health').status_code)"
```

#### Display Issues
```bash
# Check terminal capabilities
echo $TERM

# Force basic mode (no rich)
python main.py --no-color

# Check for rich library
python -c "import rich; print('Rich available')"
```

#### Performance Issues
```bash
# Reduce refresh rate
python main.py --refresh-rate 5.0

# Disable some features
# Edit config.json:
# "enable_external_agents": false
# "show_performance_graphs": false
```

### Debug Mode

Enable debug mode for detailed diagnostics:

```bash
python main.py --debug --log-level DEBUG
```

Debug mode provides:
- Detailed error messages
- API request/response logging
- Performance timing information
- Data validation warnings

### Log Files

Logs are written to:
- Console: Real-time log output
- File: If `log_file` is configured
- System logs: When running as service

## 🎯 Performance Optimization

### Memory Usage
- Limit historical data retention
- Reduce update frequency
- Disable unused features

### Network Usage
- Optimize API polling intervals
- Use efficient data structures
- Cache frequently accessed data

### Terminal Performance
- Use appropriate refresh rates
- Limit chart complexity
- Optimize string operations

## 🔐 Security

### API Security
- Use HTTPS in production
- Implement API key authentication
- Validate API responses

### Data Protection
- No sensitive data stored locally
- Secure API key handling
- Sanitized log output

## 📈 Monitoring and Metrics

### Dashboard Performance
- Update time tracking
- Success/error rate monitoring
- Memory usage tracking

### System Metrics
- API response times
- Error rate tracking
- Health check intervals

## 🤝 Contributing

### Development Setup
```bash
# Clone repository
git clone <repository-url>
cd cli_dashboard

# Install development dependencies
pip install -r requirements.txt
pip install -e .

# Run tests
pytest tests/

# Code formatting
black .
flake8 .
```

### Adding Features
1. Update configuration schema
2. Implement feature in core modules
3. Add UI components
4. Update documentation
5. Add tests

## 📄 License

This project is part of the ISH Chat system. See the main project license for details.

## 🆘 Support

For issues and support:
1. Check this documentation
2. Enable debug mode and review logs
3. Verify backend API is accessible
4. Check system requirements

## 🔄 Updates

To update the dashboard:
```bash
# Pull latest changes
git pull origin main

# Update dependencies
pip install -r requirements.txt

# Restart dashboard
python main.py
```