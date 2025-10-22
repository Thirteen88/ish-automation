#!/usr/bin/env node

/**
 * ARIA Web Server - Improved for External Access
 * Provides web interface for mobile access to your personal assistant
 * Enhanced with CORS, health checks, and proper tunneling support
 */

const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const path = require('path');
const { ARIA } = require('./aria');

const app = express();
const server = http.createServer(app);

// WebSocket server with proper configuration for proxies/tunnels
const wss = new WebSocket.Server({
    server,
    // Handle proxied connections
    verifyClient: (info) => {
        // Accept all connections (filter at application level if needed)
        return true;
    },
    // Disable per-message deflate for better compatibility
    perMessageDeflate: false,
    // Increase timeouts for tunneled connections
    clientTracking: true,
    maxPayload: 100 * 1024 * 1024 // 100MB
});

const PORT = process.env.PORT || 3002;
const HOST = process.env.HOST || '0.0.0.0';

// Store active ARIA instances per session
const sessions = new Map();

// ====================
// MIDDLEWARE SETUP
// ====================

// CORS Configuration - Essential for external access
app.use((req, res, next) => {
    // Allow all origins (or specify your tunnel domain)
    const origin = req.headers.origin || '*';
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With');
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    res.setHeader('Access-Control-Max-Age', '86400'); // 24 hours

    // Handle preflight
    if (req.method === 'OPTIONS') {
        res.sendStatus(204);
        return;
    }

    next();
});

// Security headers for external access
app.use((req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'SAMEORIGIN');
    res.setHeader('X-XSS-Protection', '1; mode=block');
    // Don't set strict HTTPS to allow tunneling services
    next();
});

// Request logging
app.use((req, res, next) => {
    const timestamp = new Date().toISOString();
    console.log(`[${timestamp}] ${req.method} ${req.path} - ${req.ip}`);
    next();
});

// Body parsing
app.use(express.json());
app.use(express.static('public'));

// Error handling middleware
app.use((err, req, res, next) => {
    console.error('Server error:', err);
    res.status(500).json({
        error: 'Internal server error',
        message: err.message
    });
});

// ====================
// HEALTH CHECK ENDPOINTS
// ====================

// Basic health check
app.get('/health', (req, res) => {
    res.json({
        status: 'healthy',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        connections: sessions.size,
        memory: process.memoryUsage()
    });
});

// Detailed status
app.get('/status', (req, res) => {
    res.json({
        server: 'ARIA Mobile Web Server',
        version: '2.0.0',
        status: 'running',
        port: PORT,
        host: HOST,
        activeSessions: sessions.size,
        websocketConnections: wss.clients.size,
        uptime: process.uptime(),
        timestamp: new Date().toISOString()
    });
});

// Ping endpoint for connectivity testing
app.get('/ping', (req, res) => {
    res.send('pong');
});

// ====================
// WEB INTERFACE
// ====================

// Create web interface HTML with improved WebSocket handling
const webInterface = `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
    <meta name="apple-mobile-web-app-capable" content="yes">
    <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
    <title>ARIA - Personal Assistant</title>
    <link rel="manifest" href="/manifest.json">
    <style>
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }

        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            height: 100vh;
            display: flex;
            flex-direction: column;
            color: #fff;
            overflow: hidden;
        }

        .header {
            background: rgba(255, 255, 255, 0.1);
            backdrop-filter: blur(10px);
            padding: 15px 20px;
            display: flex;
            align-items: center;
            justify-content: space-between;
            box-shadow: 0 2px 10px rgba(0,0,0,0.1);
        }

        .header h1 {
            font-size: 24px;
            font-weight: 600;
            display: flex;
            align-items: center;
            gap: 10px;
        }

        .status {
            width: 10px;
            height: 10px;
            background: #ef4444;
            border-radius: 50%;
            transition: background 0.3s;
        }

        .status.connected {
            background: #4ade80;
            animation: pulse 2s infinite;
        }

        @keyframes pulse {
            0% { transform: scale(1); opacity: 1; }
            50% { transform: scale(1.2); opacity: 0.8; }
            100% { transform: scale(1); opacity: 1; }
        }

        .chat-container {
            flex: 1;
            overflow-y: auto;
            padding: 20px;
            display: flex;
            flex-direction: column;
            gap: 15px;
            scrollbar-width: none;
        }

        .chat-container::-webkit-scrollbar {
            display: none;
        }

        .message {
            max-width: 85%;
            padding: 12px 16px;
            border-radius: 18px;
            word-wrap: break-word;
            animation: fadeIn 0.3s ease;
        }

        @keyframes fadeIn {
            from { opacity: 0; transform: translateY(10px); }
            to { opacity: 1; transform: translateY(0); }
        }

        .user-message {
            background: rgba(255, 255, 255, 0.2);
            backdrop-filter: blur(10px);
            align-self: flex-end;
            border-bottom-right-radius: 4px;
        }

        .aria-message {
            background: rgba(255, 255, 255, 0.95);
            color: #333;
            align-self: flex-start;
            border-bottom-left-radius: 4px;
            box-shadow: 0 2px 10px rgba(0,0,0,0.1);
        }

        .system-message {
            background: rgba(255, 165, 0, 0.2);
            color: #fff;
            align-self: center;
            text-align: center;
            font-size: 14px;
            padding: 8px 12px;
        }

        .input-container {
            background: rgba(255, 255, 255, 0.95);
            padding: 15px;
            display: flex;
            gap: 10px;
            box-shadow: 0 -2px 10px rgba(0,0,0,0.1);
        }

        .input-field {
            flex: 1;
            padding: 12px 16px;
            border: 2px solid #e5e7eb;
            border-radius: 25px;
            font-size: 16px;
            outline: none;
            transition: border-color 0.3s;
        }

        .input-field:focus {
            border-color: #667eea;
        }

        .input-field:disabled {
            background: #f3f4f6;
            cursor: not-allowed;
        }

        .send-button {
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
            border: none;
            border-radius: 50%;
            width: 45px;
            height: 45px;
            display: flex;
            align-items: center;
            justify-content: center;
            cursor: pointer;
            transition: transform 0.2s;
        }

        .send-button:hover:not(:disabled) {
            transform: scale(1.05);
        }

        .send-button:active:not(:disabled) {
            transform: scale(0.95);
        }

        .send-button:disabled {
            opacity: 0.5;
            cursor: not-allowed;
        }

        .quick-actions {
            padding: 10px 15px;
            background: rgba(255, 255, 255, 0.1);
            backdrop-filter: blur(10px);
            display: flex;
            gap: 10px;
            overflow-x: auto;
            scrollbar-width: none;
        }

        .quick-actions::-webkit-scrollbar {
            display: none;
        }

        .quick-action {
            background: rgba(255, 255, 255, 0.2);
            border: 1px solid rgba(255, 255, 255, 0.3);
            color: white;
            padding: 8px 16px;
            border-radius: 20px;
            white-space: nowrap;
            cursor: pointer;
            transition: all 0.3s;
            font-size: 14px;
        }

        .quick-action:hover {
            background: rgba(255, 255, 255, 0.3);
            transform: translateY(-2px);
        }

        .typing-indicator {
            display: none;
            align-self: flex-start;
            padding: 12px 16px;
            background: rgba(255, 255, 255, 0.95);
            color: #666;
            border-radius: 18px;
            border-bottom-left-radius: 4px;
        }

        .typing-indicator.active {
            display: block;
        }

        .typing-dot {
            display: inline-block;
            width: 8px;
            height: 8px;
            border-radius: 50%;
            background: #666;
            margin: 0 2px;
            animation: typing 1.4s infinite;
        }

        .typing-dot:nth-child(2) { animation-delay: 0.2s; }
        .typing-dot:nth-child(3) { animation-delay: 0.4s; }

        @keyframes typing {
            0%, 60%, 100% { transform: translateY(0); }
            30% { transform: translateY(-10px); }
        }

        .connection-status {
            font-size: 12px;
            color: rgba(255, 255, 255, 0.8);
        }

        @media (max-width: 600px) {
            .message { max-width: 90%; }
            .header h1 { font-size: 20px; }
        }

        @supports (-webkit-touch-callout: none) {
            body {
                height: 100vh;
                height: -webkit-fill-available;
            }
        }
    </style>
</head>
<body>
    <div class="header">
        <h1>
            <span class="status" id="statusIndicator"></span>
            ARIA
        </h1>
        <div>
            <div id="time"></div>
            <div class="connection-status" id="connectionStatus">Connecting...</div>
        </div>
    </div>

    <div class="quick-actions" id="quickActions">
        <button class="quick-action" onclick="sendQuickMessage('/help')">Help</button>
        <button class="quick-action" onclick="sendQuickMessage('/today')">Today</button>
        <button class="quick-action" onclick="sendQuickMessage('/tasks')">Tasks</button>
        <button class="quick-action" onclick="sendQuickMessage('/notes')">Notes</button>
        <button class="quick-action" onclick="sendQuickMessage('Help me plan my day')">Plan Day</button>
        <button class="quick-action" onclick="sendQuickMessage('What should I focus on?')">Focus</button>
    </div>

    <div class="chat-container" id="chatContainer">
        <div class="aria-message">
            Hello! I'm ARIA, your personal AI assistant. How can I help you today?
        </div>
    </div>

    <div class="typing-indicator" id="typingIndicator">
        <span class="typing-dot"></span>
        <span class="typing-dot"></span>
        <span class="typing-dot"></span>
    </div>

    <div class="input-container">
        <input
            type="text"
            class="input-field"
            id="messageInput"
            placeholder="Ask me anything..."
            autocomplete="off"
            enterkeyhint="send"
            disabled
        >
        <button class="send-button" id="sendButton" onclick="sendMessage()" disabled>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M22 2L11 13M22 2L15 22L11 13L2 9L22 2Z"/>
            </svg>
        </button>
    </div>

    <script>
        let ws = null;
        let isConnected = false;
        let reconnectAttempts = 0;
        let maxReconnectAttempts = 10;
        let reconnectDelay = 1000;

        function connectWebSocket() {
            try {
                // Determine WebSocket protocol
                const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
                const wsUrl = \`\${protocol}//\${window.location.host}\`;

                console.log('Connecting to WebSocket:', wsUrl);
                updateConnectionStatus('Connecting...');

                ws = new WebSocket(wsUrl);

                ws.onopen = () => {
                    console.log('WebSocket connected');
                    isConnected = true;
                    reconnectAttempts = 0;
                    reconnectDelay = 1000;

                    updateConnectionStatus('Connected');
                    document.getElementById('statusIndicator').classList.add('connected');
                    document.getElementById('messageInput').disabled = false;
                    document.getElementById('sendButton').disabled = false;

                    addSystemMessage('Connected to ARIA');
                };

                ws.onmessage = (event) => {
                    try {
                        const data = JSON.parse(event.data);
                        hideTypingIndicator();

                        if (data.type === 'response') {
                            addMessage(data.message, 'aria');
                        } else if (data.type === 'error') {
                            addSystemMessage('Error: ' + data.message);
                        }
                    } catch (error) {
                        console.error('Error parsing message:', error);
                    }
                };

                ws.onclose = (event) => {
                    console.log('WebSocket closed:', event.code, event.reason);
                    isConnected = false;

                    document.getElementById('statusIndicator').classList.remove('connected');
                    document.getElementById('messageInput').disabled = true;
                    document.getElementById('sendButton').disabled = true;

                    updateConnectionStatus('Disconnected');

                    // Attempt to reconnect
                    if (reconnectAttempts < maxReconnectAttempts) {
                        reconnectAttempts++;
                        const delay = Math.min(reconnectDelay * reconnectAttempts, 30000);
                        updateConnectionStatus(\`Reconnecting in \${delay/1000}s...\`);
                        setTimeout(connectWebSocket, delay);
                    } else {
                        updateConnectionStatus('Connection failed');
                        addSystemMessage('Unable to connect. Please refresh the page.');
                    }
                };

                ws.onerror = (error) => {
                    console.error('WebSocket error:', error);
                    updateConnectionStatus('Connection error');
                };
            } catch (error) {
                console.error('Error creating WebSocket:', error);
                updateConnectionStatus('Connection failed');
            }
        }

        function updateConnectionStatus(status) {
            document.getElementById('connectionStatus').textContent = status;
        }

        function sendMessage() {
            const input = document.getElementById('messageInput');
            const message = input.value.trim();

            if (!message) return;

            if (!isConnected) {
                addSystemMessage('Not connected. Please wait...');
                return;
            }

            try {
                addMessage(message, 'user');
                ws.send(JSON.stringify({ type: 'message', content: message }));
                input.value = '';
                showTypingIndicator();
            } catch (error) {
                console.error('Error sending message:', error);
                addSystemMessage('Failed to send message. Please try again.');
                hideTypingIndicator();
            }
        }

        function sendQuickMessage(message) {
            document.getElementById('messageInput').value = message;
            sendMessage();
        }

        function addMessage(text, sender) {
            const container = document.getElementById('chatContainer');
            const messageDiv = document.createElement('div');
            messageDiv.className = \`message \${sender}-message\`;

            const formattedText = text.replace(/\n/g, '<br>');
            messageDiv.innerHTML = formattedText;

            container.appendChild(messageDiv);
            container.scrollTop = container.scrollHeight;
        }

        function addSystemMessage(text) {
            const container = document.getElementById('chatContainer');
            const messageDiv = document.createElement('div');
            messageDiv.className = 'message system-message';
            messageDiv.textContent = text;
            container.appendChild(messageDiv);
            container.scrollTop = container.scrollHeight;
        }

        function showTypingIndicator() {
            document.getElementById('typingIndicator').classList.add('active');
        }

        function hideTypingIndicator() {
            document.getElementById('typingIndicator').classList.remove('active');
        }

        function updateTime() {
            const now = new Date();
            document.getElementById('time').textContent = now.toLocaleTimeString('en-US', {
                hour: '2-digit',
                minute: '2-digit'
            });
        }

        // Event listeners
        document.getElementById('messageInput').addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                sendMessage();
            }
        });

        // Initialize
        setInterval(updateTime, 1000);
        updateTime();
        connectWebSocket();

        // Visibility change handling - reconnect when tab becomes visible
        document.addEventListener('visibilitychange', () => {
            if (!document.hidden && !isConnected) {
                reconnectAttempts = 0;
                connectWebSocket();
            }
        });
    </script>
</body>
</html>
`;

// Serve the web interface
app.get('/', (req, res) => {
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.send(webInterface);
});

// Progressive Web App manifest
app.get('/manifest.json', (req, res) => {
    res.json({
        name: 'ARIA Personal Assistant',
        short_name: 'ARIA',
        description: 'Your AI-powered personal assistant',
        start_url: '/',
        display: 'standalone',
        background_color: '#667eea',
        theme_color: '#667eea',
        orientation: 'portrait',
        icons: [
            {
                src: '/icon-192.png',
                sizes: '192x192',
                type: 'image/png'
            },
            {
                src: '/icon-512.png',
                sizes: '512x512',
                type: 'image/png'
            }
        ]
    });
});

// ====================
// WEBSOCKET HANDLING
// ====================

// WebSocket connection heartbeat to detect stale connections
function heartbeat() {
    this.isAlive = true;
}

// Set up heartbeat interval to detect stale connections
const heartbeatInterval = setInterval(() => {
    wss.clients.forEach((ws) => {
        if (ws.isAlive === false) {
            console.log('Terminating stale connection');
            return ws.terminate();
        }

        ws.isAlive = false;
        ws.ping();
    });
}, 30000); // Check every 30 seconds

wss.on('close', () => {
    clearInterval(heartbeatInterval);
});

// WebSocket connection handling
wss.on('connection', (ws, req) => {
    const clientIp = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
    console.log(`New mobile client connected from ${clientIp}`);

    ws.isAlive = true;
    ws.on('pong', heartbeat);

    // Create ARIA instance for this session
    const sessionId = Date.now().toString() + Math.random().toString(36).substr(2, 9);
    const aria = new ARIA();

    // Initialize ARIA
    aria.initialize()
        .then(() => {
            if (ws.readyState === WebSocket.OPEN) {
                ws.send(JSON.stringify({
                    type: 'response',
                    message: 'Connected to ARIA! How can I help you today?'
                }));
            }
        })
        .catch((error) => {
            console.error('Error initializing ARIA:', error);
            if (ws.readyState === WebSocket.OPEN) {
                ws.send(JSON.stringify({
                    type: 'error',
                    message: 'Failed to initialize ARIA. Please try again.'
                }));
            }
        });

    sessions.set(sessionId, aria);

    // Handle messages from client
    ws.on('message', async (message) => {
        try {
            const data = JSON.parse(message);

            if (data.type === 'message') {
                console.log(`Processing message from ${sessionId}: ${data.content}`);

                // Process with ARIA
                const response = await aria.processCommand(data.content);

                // Send response back
                if (ws.readyState === WebSocket.OPEN) {
                    ws.send(JSON.stringify({
                        type: 'response',
                        message: response || 'I processed your request.'
                    }));
                }
            } else if (data.type === 'ping') {
                // Respond to client ping
                if (ws.readyState === WebSocket.OPEN) {
                    ws.send(JSON.stringify({
                        type: 'pong',
                        timestamp: Date.now()
                    }));
                }
            }
        } catch (error) {
            console.error('Error processing message:', error);
            if (ws.readyState === WebSocket.OPEN) {
                ws.send(JSON.stringify({
                    type: 'error',
                    message: 'Sorry, I encountered an error. Please try again.'
                }));
            }
        }
    });

    // Handle connection errors
    ws.on('error', (error) => {
        console.error('WebSocket error:', error);
    });

    // Clean up on disconnect
    ws.on('close', (code, reason) => {
        console.log(`Mobile client disconnected: ${code} - ${reason}`);
        const aria = sessions.get(sessionId);
        if (aria) {
            aria.shutdown().catch(err => console.error('Error shutting down ARIA:', err));
            sessions.delete(sessionId);
        }
    });
});

// ====================
// SERVER STARTUP
// ====================

// Graceful shutdown
process.on('SIGTERM', gracefulShutdown);
process.on('SIGINT', gracefulShutdown);

function gracefulShutdown() {
    console.log('\nShutting down gracefully...');

    // Close WebSocket server
    wss.close(() => {
        console.log('WebSocket server closed');
    });

    // Close HTTP server
    server.close(() => {
        console.log('HTTP server closed');

        // Shutdown all ARIA sessions
        const shutdownPromises = Array.from(sessions.values()).map(aria =>
            aria.shutdown().catch(err => console.error('Error shutting down ARIA:', err))
        );

        Promise.all(shutdownPromises).then(() => {
            console.log('All sessions closed');
            process.exit(0);
        });
    });

    // Force exit after timeout
    setTimeout(() => {
        console.error('Forced shutdown after timeout');
        process.exit(1);
    }, 10000);
}

// Get local IP address for display
function getLocalIpAddress() {
    const os = require('os');
    const interfaces = os.networkInterfaces();

    for (const name of Object.keys(interfaces)) {
        for (const iface of interfaces[name]) {
            // Skip internal and non-IPv4 addresses
            if (iface.family === 'IPv4' && !iface.internal) {
                return iface.address;
            }
        }
    }
    return 'localhost';
}

// Start server
server.listen(PORT, HOST, () => {
    const localIp = getLocalIpAddress();

    console.log(`
╔═══════════════════════════════════════════════════════════╗
║                                                           ║
║       ARIA Mobile Web Server Started! (Enhanced)         ║
║                                                           ║
╚═══════════════════════════════════════════════════════════╝

📱 Access ARIA from anywhere:

   Local Network: http://${localIp}:${PORT}
   This Computer: http://localhost:${PORT}
   External/Tunnel: Use your tunnel URL

🔍 Health Checks:
   http://localhost:${PORT}/health
   http://localhost:${PORT}/status
   http://localhost:${PORT}/ping

📲 On your Mobile Device:
   1. Open the URL in your browser
   2. Add to Home Screen for app-like experience
   3. Grant microphone permission for voice input

✨ Enhanced Features:
   - ✓ CORS enabled for cross-origin access
   - ✓ Health check endpoints
   - ✓ WebSocket heartbeat/reconnection
   - ✓ Tunnel service compatible
   - ✓ Better error handling
   - ✓ Connection status indicators
   - ✓ Automatic reconnection

🔧 Configuration:
   Port: ${PORT}
   Host: ${HOST}
   WebSocket: Enabled
   CORS: Enabled (all origins)

Press Ctrl+C to stop the server
    `);
});

// Handle uncaught errors
process.on('uncaughtException', (error) => {
    console.error('Uncaught Exception:', error);
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});
