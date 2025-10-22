# ARIA Web Server - External Access Configuration Guide

## Overview
This document describes the improvements made to the ARIA web server for reliable external access through tunneling services.

## Issues Fixed

### 1. Missing CORS Support
**Problem**: The original server had no CORS (Cross-Origin Resource Sharing) headers, which blocked external access when using tunneling services.

**Solution**: Added comprehensive CORS middleware that:
- Accepts requests from any origin
- Handles preflight OPTIONS requests
- Sets proper Access-Control headers
- Supports credentials for secure connections

### 2. No Health Check Endpoints
**Problem**: No way to verify server status or monitor connections remotely.

**Solution**: Added three monitoring endpoints:
- `/health` - Basic health check with uptime and memory info
- `/status` - Detailed server status including active sessions
- `/ping` - Simple connectivity test

### 3. WebSocket Connection Issues
**Problem**: WebSocket connections could fail through proxies/tunnels and had no reconnection logic.

**Solution**:
- Added WebSocket heartbeat mechanism to detect stale connections
- Implemented automatic client-side reconnection with exponential backoff
- Better error handling for WebSocket failures
- Connection status indicators in the UI

### 4. Poor Error Handling
**Problem**: Limited error handling could cause silent failures.

**Solution**:
- Added comprehensive error handling middleware
- Better logging of client connections and errors
- Graceful shutdown handling
- Uncaught exception handlers

### 5. No Connection Monitoring
**Problem**: Users couldn't see connection status or reconnection attempts.

**Solution**:
- Added visual connection status indicator
- Shows connection state (Connected/Connecting/Disconnected)
- Displays reconnection countdown
- System messages for important events

## Configuration

### Environment Variables

```bash
PORT=3002              # Server port (default: 3002)
HOST=0.0.0.0          # Bind address (0.0.0.0 for external access)
```

### Running the Server

#### Standard Mode
```bash
PORT=3002 node aria-mobile-server-improved.js
```

#### With Tunneling Service

Using localtunnel:
```bash
# Terminal 1: Start the server
PORT=3002 node aria-mobile-server-improved.js

# Terminal 2: Start the tunnel
npx localtunnel --port 3002 --subdomain aria-gary
```

Using ngrok:
```bash
# Terminal 1: Start the server
PORT=3002 node aria-mobile-server-improved.js

# Terminal 2: Start ngrok
ngrok http 3002
```

## Testing

### Quick Test
```bash
# Run the test script
./test-server.sh 3002 localhost
```

### Manual Testing

1. **Health Check**:
```bash
curl http://localhost:3002/health
```

2. **CORS Test**:
```bash
curl -H "Origin: https://example.com" -I http://localhost:3002/
```

3. **WebSocket Test**:
```javascript
// In browser console
const ws = new WebSocket('ws://localhost:3002');
ws.onopen = () => console.log('Connected');
ws.onmessage = (e) => console.log('Message:', e.data);
ws.send(JSON.stringify({type: 'message', content: '/help'}));
```

## Features Comparison

| Feature | Original | Improved |
|---------|----------|----------|
| CORS Support | ❌ No | ✅ Full support |
| Health Checks | ❌ No | ✅ 3 endpoints |
| WebSocket Heartbeat | ❌ No | ✅ Yes (30s interval) |
| Auto Reconnection | ❌ Basic | ✅ Smart backoff |
| Error Handling | ⚠️ Basic | ✅ Comprehensive |
| Connection Status | ❌ No | ✅ Visual indicators |
| Graceful Shutdown | ❌ No | ✅ Yes |
| Tunnel Compatible | ⚠️ Partial | ✅ Full support |
| Request Logging | ❌ No | ✅ Yes |
| Security Headers | ❌ No | ✅ Yes |

## Architecture Improvements

### Middleware Stack
1. **CORS Middleware** - Handles cross-origin requests
2. **Security Headers** - XSS protection, content type sniffing prevention
3. **Request Logging** - Logs all incoming requests
4. **Body Parsing** - JSON request parsing
5. **Static Files** - Serves public directory
6. **Error Handling** - Catches and logs errors

### WebSocket Enhancements
- Heartbeat/ping-pong mechanism (30s interval)
- Automatic stale connection detection
- Per-session ARIA instance management
- Better cleanup on disconnect
- Error recovery

### Client-Side Improvements
- Automatic WebSocket reconnection
- Exponential backoff (1s to 30s)
- Connection status display
- System message notifications
- Tab visibility handling (reconnect when tab becomes visible)

## Mobile Access Setup

### For Local Network
1. Start the server: `PORT=3002 node aria-mobile-server-improved.js`
2. Note the local IP address shown in console
3. On mobile, open browser and go to `http://<local-ip>:3002`

### For External Access (Recommended)
1. Start the server: `PORT=3002 node aria-mobile-server-improved.js`
2. Start tunnel: `npx localtunnel --port 3002 --subdomain aria-gary`
3. Access from anywhere: `https://aria-gary.loca.lt`

### Add to Home Screen (PWA)
1. Open the web app in mobile browser
2. Tap browser menu
3. Select "Add to Home Screen"
4. The app will now work like a native app

## Troubleshooting

### Connection Fails Immediately
- Check server is running: `curl http://localhost:3002/ping`
- Check firewall settings
- Verify PORT environment variable

### WebSocket Fails
- Check browser console for errors
- Verify WebSocket protocol (ws:// or wss://)
- Check tunnel service supports WebSocket

### CORS Errors
- Verify Origin header is being sent
- Check CORS middleware is loaded
- Review browser console for specific CORS error

### Tunnel Connection Issues
- Try different tunnel service (localtunnel, ngrok, bore)
- Check tunnel service status
- Verify server is accessible locally first

## Performance Considerations

- **Heartbeat Interval**: 30s (configurable in code)
- **Reconnect Delay**: 1s initial, exponential backoff to 30s max
- **Max Reconnect Attempts**: 10 before giving up
- **WebSocket Payload Limit**: 100MB
- **Session Management**: Automatic cleanup on disconnect

## Security Notes

1. **Production Deployment**:
   - Add authentication middleware
   - Restrict CORS to specific origins
   - Use HTTPS/WSS in production
   - Add rate limiting

2. **Tunnel Services**:
   - Tunnel URLs may change on restart
   - Consider paid tunneling services for stability
   - Don't expose sensitive data without authentication

3. **Environment**:
   - Use environment variables for configuration
   - Don't commit .env files
   - Rotate tunnel subdomains if needed

## Monitoring

### Check Active Connections
```bash
curl http://localhost:3002/status | jq .websocketConnections
```

### View Server Health
```bash
curl http://localhost:3002/health | jq .
```

### Monitor Logs
The improved server logs all connections and errors to console. Pipe to a file for analysis:
```bash
PORT=3002 node aria-mobile-server-improved.js 2>&1 | tee server.log
```

## Next Steps

1. **Test the improved server**: Run `./test-server.sh`
2. **Update systemd service** (if applicable): Use new server file
3. **Configure reverse proxy** (if using nginx/Apache)
4. **Set up monitoring** (optional): Use health endpoints
5. **Deploy to production**: Add authentication and use HTTPS

## Files

- `aria-mobile-server-improved.js` - Enhanced server with all improvements
- `test-server.sh` - Automated testing script
- `EXTERNAL_ACCESS_GUIDE.md` - This documentation

## Support

For issues or questions:
1. Check server logs for error messages
2. Run test script to diagnose problems
3. Verify network connectivity
4. Review browser console for client-side errors
