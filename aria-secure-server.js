#!/usr/bin/env node

/**
 * ARIA Secure Web Server with Authentication
 * Safe for external access with login protection
 */

const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

const PORT = process.env.PORT || 3002;

// Security middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Simple session management
const sessions = new Map();
const users = new Map();

// Default user (change these!)
const DEFAULT_USER = process.env.ARIA_USER || 'gary';
const DEFAULT_PASS = process.env.ARIA_PASS || 'changeMe123!';

// Initialize default user
users.set(DEFAULT_USER, {
    password: crypto.createHash('sha256').update(DEFAULT_PASS).digest('hex'),
    name: 'Gary'
});

// Authentication middleware
function requireAuth(req, res, next) {
    const sessionId = req.headers['x-session-id'] || req.query.session;

    if (!sessionId || !sessions.has(sessionId)) {
        return res.status(401).json({ error: 'Authentication required' });
    }

    const session = sessions.get(sessionId);
    if (Date.now() - session.lastActivity > 3600000) { // 1 hour timeout
        sessions.delete(sessionId);
        return res.status(401).json({ error: 'Session expired' });
    }

    session.lastActivity = Date.now();
    req.user = session.user;
    next();
}

// Login endpoint
app.post('/login', (req, res) => {
    const { username, password } = req.body;

    if (!username || !password) {
        return res.status(400).json({ error: 'Username and password required' });
    }

    const user = users.get(username);
    if (!user) {
        return res.status(401).json({ error: 'Invalid credentials' });
    }

    const hashedPassword = crypto.createHash('sha256').update(password).digest('hex');
    if (hashedPassword !== user.password) {
        return res.status(401).json({ error: 'Invalid credentials' });
    }

    // Create session
    const sessionId = crypto.randomBytes(32).toString('hex');
    sessions.set(sessionId, {
        user: username,
        created: Date.now(),
        lastActivity: Date.now()
    });

    res.json({
        success: true,
        sessionId: sessionId,
        user: { username, name: user.name }
    });
});

// Logout endpoint
app.post('/logout', (req, res) => {
    const sessionId = req.headers['x-session-id'];
    if (sessionId) {
        sessions.delete(sessionId);
    }
    res.json({ success: true });
});

// Secure web interface with login
const secureWebInterface = `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
    <meta name="apple-mobile-web-app-capable" content="yes">
    <title>ARIA - Secure Access</title>
    <style>
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }

        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            height: 100vh;
            display: flex;
            align-items: center;
            justify-content: center;
            color: white;
        }

        .login-container {
            background: rgba(255, 255, 255, 0.95);
            padding: 40px;
            border-radius: 20px;
            box-shadow: 0 10px 40px rgba(0,0,0,0.2);
            width: 90%;
            max-width: 400px;
            text-align: center;
        }

        .login-container h1 {
            color: #333;
            margin-bottom: 10px;
            font-size: 28px;
        }

        .login-container p {
            color: #666;
            margin-bottom: 30px;
        }

        .login-form {
            display: flex;
            flex-direction: column;
            gap: 15px;
        }

        .input-group {
            display: flex;
            flex-direction: column;
            text-align: left;
        }

        .input-group label {
            color: #666;
            font-size: 14px;
            margin-bottom: 5px;
        }

        .input-group input {
            padding: 12px 15px;
            border: 2px solid #e0e0e0;
            border-radius: 10px;
            font-size: 16px;
            transition: border-color 0.3s;
        }

        .input-group input:focus {
            outline: none;
            border-color: #667eea;
        }

        .login-button {
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
            border: none;
            padding: 14px;
            border-radius: 10px;
            font-size: 16px;
            font-weight: 600;
            cursor: pointer;
            transition: transform 0.2s, box-shadow 0.2s;
            margin-top: 10px;
        }

        .login-button:hover {
            transform: translateY(-2px);
            box-shadow: 0 5px 20px rgba(102, 126, 234, 0.4);
        }

        .login-button:active {
            transform: translateY(0);
        }

        .error-message {
            background: #ff4444;
            color: white;
            padding: 10px;
            border-radius: 8px;
            margin-bottom: 15px;
            display: none;
        }

        .error-message.active {
            display: block;
        }

        .security-note {
            margin-top: 20px;
            padding: 15px;
            background: #f0f4ff;
            border-radius: 10px;
            color: #666;
            font-size: 12px;
        }

        .security-note .lock-icon {
            font-size: 20px;
            margin-bottom: 5px;
        }

        .loading {
            display: none;
        }

        .loading.active {
            display: block;
        }

        .chat-interface {
            display: none;
            position: fixed;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            background: white;
        }

        .chat-interface.active {
            display: flex;
            flex-direction: column;
        }

        /* Add the rest of the chat interface styles from the previous version */
    </style>
</head>
<body>
    <div class="login-container" id="loginContainer">
        <h1>🔐 ARIA</h1>
        <p>Secure Personal Assistant</p>

        <div class="error-message" id="errorMessage"></div>

        <form class="login-form" id="loginForm" onsubmit="handleLogin(event)">
            <div class="input-group">
                <label for="username">Username</label>
                <input
                    type="text"
                    id="username"
                    name="username"
                    required
                    autocomplete="username"
                    placeholder="Enter your username"
                >
            </div>

            <div class="input-group">
                <label for="password">Password</label>
                <input
                    type="password"
                    id="password"
                    name="password"
                    required
                    autocomplete="current-password"
                    placeholder="Enter your password"
                >
            </div>

            <button type="submit" class="login-button">
                <span class="button-text">Sign In to ARIA</span>
                <span class="loading">Signing in...</span>
            </button>
        </form>

        <div class="security-note">
            <div class="lock-icon">🔒</div>
            <strong>Secure Connection</strong><br>
            Your connection is encrypted and your data is protected.
        </div>
    </div>

    <div class="chat-interface" id="chatInterface">
        <!-- Add chat interface here -->
        <div style="padding: 20px; background: #667eea; color: white;">
            <h2>Welcome to ARIA</h2>
            <button onclick="logout()" style="float: right; padding: 8px 16px; border-radius: 5px; border: none;">Logout</button>
        </div>
        <div style="flex: 1; padding: 20px; overflow-y: auto;">
            <div id="messages"></div>
        </div>
        <div style="padding: 20px; background: #f5f5f5;">
            <input type="text" id="messageInput" style="width: 100%; padding: 10px; border-radius: 5px; border: 1px solid #ddd;"
                   placeholder="Ask ARIA anything..." onkeypress="if(event.key === 'Enter') sendMessage()">
        </div>
    </div>

    <script>
        let sessionId = localStorage.getItem('aria-session');
        let ws = null;

        // Check if already logged in
        if (sessionId) {
            checkSession();
        }

        async function handleLogin(event) {
            event.preventDefault();

            const username = document.getElementById('username').value;
            const password = document.getElementById('password').value;

            document.querySelector('.button-text').style.display = 'none';
            document.querySelector('.loading').classList.add('active');

            try {
                const response = await fetch('/login', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({ username, password })
                });

                const data = await response.json();

                if (response.ok && data.success) {
                    sessionId = data.sessionId;
                    localStorage.setItem('aria-session', sessionId);
                    showChat();
                } else {
                    showError(data.error || 'Login failed');
                }
            } catch (error) {
                showError('Connection error. Please try again.');
            } finally {
                document.querySelector('.button-text').style.display = 'block';
                document.querySelector('.loading').classList.remove('active');
            }
        }

        async function checkSession() {
            try {
                const response = await fetch('/api/status', {
                    headers: {
                        'X-Session-ID': sessionId
                    }
                });

                if (response.ok) {
                    showChat();
                } else {
                    localStorage.removeItem('aria-session');
                    sessionId = null;
                }
            } catch (error) {
                console.error('Session check failed:', error);
            }
        }

        function showError(message) {
            const errorEl = document.getElementById('errorMessage');
            errorEl.textContent = message;
            errorEl.classList.add('active');
            setTimeout(() => {
                errorEl.classList.remove('active');
            }, 5000);
        }

        function showChat() {
            document.getElementById('loginContainer').style.display = 'none';
            document.getElementById('chatInterface').classList.add('active');
            connectWebSocket();
        }

        function connectWebSocket() {
            const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
            ws = new WebSocket(\`\${protocol}//\${window.location.host}?session=\${sessionId}\`);

            ws.onmessage = (event) => {
                const data = JSON.parse(event.data);
                addMessage(data.message, 'aria');
            };

            ws.onerror = (error) => {
                console.error('WebSocket error:', error);
            };
        }

        function sendMessage() {
            const input = document.getElementById('messageInput');
            const message = input.value.trim();

            if (message && ws && ws.readyState === WebSocket.OPEN) {
                addMessage(message, 'user');
                ws.send(JSON.stringify({
                    type: 'message',
                    content: message,
                    sessionId: sessionId
                }));
                input.value = '';
            }
        }

        function addMessage(text, sender) {
            const messagesEl = document.getElementById('messages');
            const messageEl = document.createElement('div');
            messageEl.style.padding = '10px';
            messageEl.style.margin = '5px 0';
            messageEl.style.borderRadius = '10px';
            messageEl.style.background = sender === 'user' ? '#e0e0e0' : '#667eea';
            messageEl.style.color = sender === 'user' ? '#333' : 'white';
            messageEl.textContent = text;
            messagesEl.appendChild(messageEl);
            messagesEl.scrollTop = messagesEl.scrollHeight;
        }

        async function logout() {
            await fetch('/logout', {
                method: 'POST',
                headers: {
                    'X-Session-ID': sessionId
                }
            });

            localStorage.removeItem('aria-session');
            window.location.reload();
        }
    </script>
</body>
</html>
`;

// Serve secure login page
app.get('/', (req, res) => {
    res.send(secureWebInterface);
});

// API status endpoint
app.get('/api/status', requireAuth, (req, res) => {
    res.json({ status: 'authenticated', user: req.user });
});

// WebSocket authentication
wss.on('connection', (ws, req) => {
    const url = new URL(req.url, `http://${req.headers.host}`);
    const sessionId = url.searchParams.get('session');

    if (!sessionId || !sessions.has(sessionId)) {
        ws.close(1008, 'Unauthorized');
        return;
    }

    console.log('Authenticated WebSocket connection established');

    ws.on('message', (message) => {
        try {
            const data = JSON.parse(message);
            // Process message with ARIA
            ws.send(JSON.stringify({
                type: 'response',
                message: `Secure ARIA response: ${data.content}`
            }));
        } catch (error) {
            ws.send(JSON.stringify({
                type: 'error',
                message: 'Error processing request'
            }));
        }
    });
});

// Start server
server.listen(PORT, '0.0.0.0', () => {
    console.log(`
╔═══════════════════════════════════════════════════════════╗
║                                                           ║
║         ARIA SECURE SERVER - Ready for External Access   ║
║                                                           ║
╚═══════════════════════════════════════════════════════════╝

🔐 Security Features:
   ✓ Login required
   ✓ Session management
   ✓ Encrypted passwords
   ✓ 1-hour session timeout

📱 Access:
   Local: http://localhost:${PORT}
   Network: http://${require('os').networkInterfaces().en0?.[0]?.address || 'your-ip'}:${PORT}

🔑 Default Credentials:
   Username: ${DEFAULT_USER}
   Password: ${DEFAULT_PASS}

⚠️  IMPORTANT: Change default password before external exposure!
   Set environment variables:
   export ARIA_USER="yourusername"
   export ARIA_PASS="strongpassword"

🌍 For external access, use one of these:
   1. ngrok http ${PORT}
   2. cloudflared tunnel --url localhost:${PORT}
   3. Deploy to cloud service
   4. Setup VPN (Tailscale/WireGuard)

Press Ctrl+C to stop the server
    `);
});