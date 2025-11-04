# ISH Chat CLI Dashboard - Quick Start Guide

## Overview

The ISH Chat CLI Dashboard is a real-time terminal dashboard for monitoring the multi-instance AI system. It provides live monitoring of AI instances, health status, load balancing, and external agents.

## Prerequisites

- Python 3.8+
- Required dependencies (automatically installed or available):
  - `rich` - Rich terminal UI formatting
  - `aiohttp` - Async HTTP client for API calls
  - `pydantic` - Data validation

## Installation & Setup

### 1. Navigate to the CLI Dashboard Directory

```bash
cd /home/gary/multi-model-orchestrator/ish-chat-backend/cli_dashboard
```

### 2. Verify Dependencies

The dashboard uses Python packages that should already be available. You can verify they're installed:

```bash
python3 -c "import rich, aiohttp, pydantic; print('All dependencies available')"
```

If any dependencies are missing, install them with:

```bash
pip install rich aiohttp pydantic python-dateutil
```

## Running the Dashboard

### Basic Usage

#### Simulation Mode (Recommended for testing)

```bash
# Run with simulated data (no backend required)
python3 main.py --simulate-data

# With debug output and faster refresh rate
python3 main.py --simulate-data --debug --refresh-rate 1

# Short form
python3 main.py -s -d -r 1
```

#### Production Mode (Requires running backend)

```bash
# Connect to default backend (http://localhost:8000)
python3 main.py

# Connect to custom backend URL
python3 main.py --api-base http://your-backend:8000

# With debug mode
python3 main.py --debug
```

### Command Line Options

| Option | Short | Description | Example |
|--------|-------|-------------|---------|
| `--help` | `-h` | Show help message | `python3 main.py --help` |
| `--config` | `-c` | Path to configuration file | `python3 main.py --config config.json` |
| `--refresh-rate` | `-r` | Refresh rate in seconds | `python3 main.py --refresh-rate 1.5` |
| `--api-base` | | Base URL for ISH Chat API | `python3 main.py --api-base http://localhost:8000` |
| `--log-level` | | Logging level | `python3 main.py --log-level DEBUG` |
| `--debug` | `-d` | Enable debug mode | `python3 main.py --debug` |
| `--simulate-data` | `-s` | Use simulated data | `python3 main.py --simulate-data` |

### Log Levels

- `DEBUG` - Detailed debugging information
- `INFO` - General information (default)
- `WARNING` - Warning messages
- `ERROR` - Error messages only

## Dashboard Features

### Main Sections

1. **AI Instances** - Real-time status of all AI instances
   - Instance name, provider, status
   - Health indicators ✓/✗
   - Current load and success rates
   - Response times

2. **System Status** - Overall system health
   - Performance metrics
   - Update statistics
   - Service status

3. **Analytics** - Visual charts and statistics
   - Provider distribution
   - Performance summary
   - Resource utilization

4. **Alerts** - Active system alerts
   - Health warnings
   - Performance issues
   - System notifications

5. **External Agents** - External AI agent status
   - Connection status
   - Active/b/offline counts
   - Individual agent details

### Interactive Features

- **Real-time Updates** - Dashboard auto-refreshes at configured interval
- **Color Coding** - Visual indicators for health status
- **Responsive Layout** - Adapts to terminal size
- **Graceful Shutdown** - Use Ctrl+C to exit cleanly

## Configuration

### Optional Configuration File

Create a JSON configuration file for advanced settings:

```json
{
  "api_base_url": "http://localhost:8000",
  "refresh_rate": 2.0,
  "enable_instance_monitoring": true,
  "enable_health_monitoring": true,
  "enable_load_balancer_metrics": true,
  "enable_auto_scaling_metrics": true,
  "enable_external_agents": true,
  "debug": false,
  "simulate_data": false,
  "show_debug_info": false,
  "show_performance_graphs": true,
  "color_enabled": true,
  "log_level": "INFO"
}
```

Use with:
```bash
python3 main.py --config /path/to/config.json
```

### Default Configuration

When no configuration file is provided, the dashboard uses sensible defaults:
- Refresh rate: 2.0 seconds
- API base URL: http://localhost:8000
- All monitoring features enabled
- Color output enabled

## Troubleshooting

### Common Issues

1. **Import Errors**
   ```
   ImportError: attempted relative import beyond top-level package
   ```
   - **Solution**: Make sure you're running from the cli_dashboard directory
   - **Solution**: Use `python3 main.py` not `python3 -m cli_dashboard.main`

2. **Missing Dependencies**
   ```
   ModuleNotFoundError: No module named 'rich'
   ```
   - **Solution**: Install with `pip install rich aiohttp pydantic`

3. **Backend Connection Failed**
   ```
   Failed to connect to API at http://localhost:8000
   ```
   - **Solution**: Ensure ISH Chat backend is running
   - **Solution**: Use simulation mode with `--simulate-data`
   - **Solution**: Check API URL with `--api-base`

4. **Permission Errors**
   ```
   Permission denied
   ```
   - **Solution**: Check file permissions in cli_dashboard directory
   - **Solution**: Ensure Python executable has proper permissions

### Debug Mode

Use debug mode to troubleshoot issues:

```bash
python3 main.py --debug --simulate-data
```

Debug mode provides:
- Detailed error messages
- Stack traces for exceptions
- Performance metrics
- API request details

### Terminal Compatibility

The dashboard works best with modern terminals that support:
- ANSI color codes
- Unicode characters
- Sufficient terminal size (minimum 80x24 recommended

Compatible terminals:
- Terminal (macOS)
- GNOME Terminal, Konsole (Linux)
- Windows Terminal, PowerShell (Windows)
- iTerm2 (macOS)
- VS Code integrated terminal

## Performance Tips

1. **Refresh Rate** - Adjust based on your needs:
   - Real-time monitoring: 0.5-1.0 seconds
   - Normal monitoring: 2.0-5.0 seconds
   - Background monitoring: 10+ seconds

2. **Resource Usage** - Dashboard is lightweight but:
   - Simulation mode uses minimal resources
   - Production mode makes HTTP requests every refresh cycle
   - Debug mode increases CPU usage slightly

3. **Network Usage** - In production mode:
   - Makes multiple API calls per refresh cycle
   - Recommend refresh rate of 5+ seconds for slow networks

## Examples

### Quick Development Test
```bash
cd /home/gary/multi-model-orchestrator/ish-chat-backend/cli_dashboard
python3 main.py --simulate-data --debug --refresh-rate 1
```

### Production Monitoring
```bash
cd /home/gary/multi-model-orchestrator/ish-chat-backend/cli_dashboard
python3 main.py --api-base http://production-backend:8000 --refresh-rate 5
```

### Background Monitoring (with nohup)
```bash
cd /home/gary/multi-model-orchestrator/ish-chat-backend/cli_dashboard
nohup python3 main.py --simulate-data --refresh-rate 10 > dashboard.log 2>&1 &
```

## Support

For issues or questions:
1. Check the troubleshooting section above
2. Try running with `--debug` flag for more information
3. Verify all dependencies are installed
4. Test with `--simulate-data` to isolate backend issues

## File Locations

- **Main executable**: `/home/gary/multi-model-orchestrator/ish-chat-backend/cli_dashboard/main.py`
- **Configuration**: Optional JSON file (see Configuration section)
- **Logs**: Output to console (can be redirected to file)
- **Requirements**: `/home/gary/multi-model-orchestrator/ish-chat-backend/cli_dashboard/requirements.txt`