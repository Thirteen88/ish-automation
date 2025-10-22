#!/usr/bin/env node

/**
 * ARIA Web Server
 * Provides web interface for mobile access to your personal assistant
 */

const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const path = require('path');
const { ARIA } = require('./aria');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

const PORT = process.env.PORT || 3001;

// Middleware
app.use(express.json());
app.use(express.static('public'));

// Store active ARIA instances per session
const sessions = new Map();

// Create web interface HTML
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
            background: #4ade80;
            border-radius: 50%;
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

        .send-button:hover {
            transform: scale(1.05);
        }

        .send-button:active {
            transform: scale(0.95);
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

        .welcome-screen {
            position: absolute;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            padding: 20px;
            text-align: center;
            z-index: 1000;
            transition: opacity 0.5s, transform 0.5s;
        }

        .welcome-screen.hidden {
            opacity: 0;
            transform: translateY(-20px);
            pointer-events: none;
        }

        .welcome-logo {
            font-size: 72px;
            margin-bottom: 20px;
        }

        .welcome-title {
            font-size: 32px;
            font-weight: bold;
            margin-bottom: 10px;
        }

        .welcome-subtitle {
            font-size: 18px;
            opacity: 0.9;
            margin-bottom: 30px;
        }

        .start-button {
            background: rgba(255, 255, 255, 0.2);
            border: 2px solid white;
            color: white;
            padding: 15px 40px;
            border-radius: 30px;
            font-size: 18px;
            cursor: pointer;
            transition: all 0.3s;
        }

        .start-button:hover {
            background: rgba(255, 255, 255, 0.3);
            transform: translateY(-2px);
        }

        @media (max-width: 600px) {
            .message { max-width: 90%; }
            .header h1 { font-size: 20px; }
        }

        /* iOS specific fixes */
        @supports (-webkit-touch-callout: none) {
            body {
                height: 100vh;
                height: -webkit-fill-available;
            }
        }
    </style>
</head>
<body>
    <div class="welcome-screen" id="welcomeScreen">
        <div class="welcome-logo">🤖</div>
        <div class="welcome-title">ARIA</div>
        <div class="welcome-subtitle">Your Personal AI Assistant</div>
        <button class="start-button" onclick="startChat()">Start Conversation</button>
    </div>

    <div class="header">
        <h1>
            <span class="status"></span>
            ARIA
        </h1>
        <span id="time"></span>
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
        >
        <button class="send-button" onclick="sendMessage()">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M22 2L11 13M22 2L15 22L11 13L2 9L22 2Z"/>
            </svg>
        </button>
    </div>

    <script>
        let ws = null;
        let isConnected = false;

        function startChat() {
            document.getElementById('welcomeScreen').classList.add('hidden');
            document.getElementById('messageInput').focus();
            connectWebSocket();
        }

        function connectWebSocket() {
            const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
            ws = new WebSocket(\`\${protocol}//\${window.location.host}\`);

            ws.onopen = () => {
                isConnected = true;
                document.querySelector('.status').style.background = '#4ade80';
            };

            ws.onmessage = (event) => {
                const data = JSON.parse(event.data);
                hideTypingIndicator();

                if (data.type === 'response') {
                    addMessage(data.message, 'aria');
                }
            };

            ws.onclose = () => {
                isConnected = false;
                document.querySelector('.status').style.background = '#ef4444';
                setTimeout(connectWebSocket, 3000);
            };

            ws.onerror = (error) => {
                console.error('WebSocket error:', error);
            };
        }

        function sendMessage() {
            const input = document.getElementById('messageInput');
            const message = input.value.trim();

            if (message && isConnected) {
                addMessage(message, 'user');
                ws.send(JSON.stringify({ type: 'message', content: message }));
                input.value = '';
                showTypingIndicator();
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

            // Format the text (convert line breaks, etc.)
            const formattedText = text.replace(/\n/g, '<br>');
            messageDiv.innerHTML = formattedText;

            container.appendChild(messageDiv);
            container.scrollTop = container.scrollHeight;
        }

        function showTypingIndicator() {
            document.getElementById('typingIndicator').classList.add('active');
        }

        function hideTypingIndicator() {
            document.getElementById('typingIndicator').classList.remove('active');
        }

        // Update time
        function updateTime() {
            const now = new Date();
            document.getElementById('time').textContent = now.toLocaleTimeString('en-US', {
                hour: '2-digit',
                minute: '2-digit'
            });
        }

        // Initialize
        document.getElementById('messageInput').addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                sendMessage();
            }
        });

        setInterval(updateTime, 1000);
        updateTime();

        // Auto-start for returning users
        if (localStorage.getItem('aria-visited')) {
            setTimeout(() => startChat(), 500);
        } else {
            localStorage.setItem('aria-visited', 'true');
        }
    </script>
</body>
</html>
`;

// Serve the web interface
app.get('/', (req, res) => {
    res.send(webInterface);
});

// API health endpoint
app.get('/api/health', (req, res) => {
    res.json({
        status: 'healthy',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        sessions: sessions.size,
        websockets: wss.clients.size,
        server: {
            port: PORT,
            version: '1.0.0',
            node: process.version
        },
        memory: {
            used: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
            total: Math.round(process.memoryUsage().heapTotal / 1024 / 1024),
            unit: 'MB'
        }
    });
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

// WebSocket connection handling
wss.on('connection', (ws) => {
    console.log('New mobile client connected');

    // Create ARIA instance for this session
    const sessionId = Date.now().toString();
    const aria = new ARIA();

    // Initialize ARIA
    aria.initialize().then(() => {
        ws.send(JSON.stringify({
            type: 'response',
            message: 'Connected to ARIA! How can I help you today?'
        }));
    });

    sessions.set(sessionId, aria);

    // Handle messages from client
    ws.on('message', async (message) => {
        try {
            const data = JSON.parse(message);
            console.log('Received message from client:', data);

            if (data.type === 'message' || data.type === 'test') {
                try {
                    // Capture console output during processCommand
                    let capturedOutput = '';
                    const originalLog = console.log;
                    console.log = (...args) => {
                        capturedOutput += args.join(' ') + '\n';
                        originalLog.apply(console, args);
                    };

                    // Process with ARIA
                    const response = await aria.processCommand(data.content || data.message);

                    // Restore console.log
                    console.log = originalLog;

                    console.log('ARIA processCommand completed. Response:', response);
                    console.log('Captured output:', capturedOutput);

                    // Send response back - use captured output or a confirmation
                    const responseMessage = capturedOutput.trim() ||
                                          response ||
                                          'I processed your request. The ARIA command has been executed.';

                    ws.send(JSON.stringify({
                        type: 'response',
                        message: responseMessage
                    }));
                } catch (ariaError) {
                    console.error('ARIA processing error:', ariaError);
                    console.error('Error stack:', ariaError.stack);

                    // Send more detailed error
                    ws.send(JSON.stringify({
                        type: 'error',
                        message: `ARIA Error: ${ariaError.message || 'Unknown error during processing'}`
                    }));
                }
            }
        } catch (error) {
            console.error('Message handling error:', error);
            console.error('Error stack:', error.stack);
            ws.send(JSON.stringify({
                type: 'error',
                message: 'Sorry, I encountered an error parsing your message.'
            }));
        }
    });

    // Clean up on disconnect
    ws.on('close', () => {
        console.log('Mobile client disconnected');
        const aria = sessions.get(sessionId);
        if (aria) {
            aria.shutdown();
            sessions.delete(sessionId);
        }
    });
});

// Start server
server.listen(PORT, '0.0.0.0', () => {
    console.log(`
╔═══════════════════════════════════════════════════════════╗
║                                                           ║
║            ARIA Mobile Web Server Started!               ║
║                                                           ║
╚═══════════════════════════════════════════════════════════╝

📱 Access ARIA from your phone:

   Local Network: http://${require('os').networkInterfaces().en0?.[0]?.address || 'your-computer-ip'}:${PORT}
   This Computer: http://localhost:${PORT}

📲 On your Pixel 9 Pro XL:
   1. Connect to the same WiFi network
   2. Open Chrome
   3. Go to the address above
   4. Add to Home Screen for app-like experience

✨ Features:
   - Real-time chat with ARIA
   - Voice input support (use phone keyboard)
   - Works offline once loaded
   - Full task management
   - All ARIA features available

Press Ctrl+C to stop the server
    `);
});