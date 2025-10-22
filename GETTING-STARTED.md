# 🎯 AI Orchestrator Web Interface - Getting Started

## Quick Start (60 seconds)

```bash
# 1. Test everything is ready
./test-web-interface.sh

# 2. Start the server
./start-web-server.sh

# 3. Open browser
# Navigate to: http://localhost:3000
```

That's it! You now have a production-ready web interface running.

---

## Alternative Start Methods

### Using npm scripts:
```bash
npm run web              # Production mode
npm run web:dev          # Development mode
npm run web:prod         # Production mode (explicit)
npm run web:test         # Run tests
```

### Using Node directly:
```bash
node web-server.js
```

### With custom configuration:
```bash
PORT=8080 HOST=0.0.0.0 node web-server.js
```

---

## First Query Tutorial

### Step 1: Open the Interface
Navigate to `http://localhost:3000` in your browser

### Step 2: Select Platforms
Click on platform badges to select which AI platforms to query:
- **LMArena** (blue)
- **Claude.ai** (purple)
- **ChatGPT** (green)
- **Google Gemini** (orange)
- **Poe.com** (pink)

### Step 3: Enter Your Prompt
Type your question in the text area. For example:
```
Explain the difference between machine learning and deep learning
```

### Step 4: Submit
Either:
- Click the "Submit Query" button
- Press `Ctrl+Enter`

### Step 5: Watch Results Stream In
You'll see:
- Real-time status indicators for each platform
- Responses appearing as they're generated
- Platform completion times
- Success/error indicators

### Step 6: Interact with Responses
For each response, you can:
- 👍 Upvote if helpful
- 👎 Downvote if unhelpful
- ⭐ Mark as the best response
- 📋 Copy to clipboard

---

## Understanding the Interface

### Top Bar
```
⚡ AI Orchestrator    [Status Indicators]    Metrics    🌓    ⚙️
```
- **Left**: App logo and name
- **Center**: Platform status (colored dots)
- **Right**: Dark mode toggle and settings

### Main Area

#### Platform Selector
```
[LMArena] [Claude.ai] [ChatGPT] [Google Gemini] [Poe.com]
```
- **Solid color**: Selected
- **Outlined**: Not selected
- Click to toggle

#### Auto-Detection
```
💡 Auto-detected: [Coding] [Python]
```
Shows when the system detects your prompt type

#### Current Query Status
```
Current Query                         Processing...
───────────────────────────────────────────────────
Explain machine learning...

🔵 LMArena        Processing...
🟢 Claude.ai      Completed (15.2s)
🔵 ChatGPT        Processing...
🟢 Google Gemini  Completed (12.5s)
```

#### Response Cards
Each platform's response appears in its own card:
```
╔═══════════════════════════════════════════════════╗
║ 🟣 Claude.ai              15.2s  👍 👎 ⭐ 📋   ║
║───────────────────────────────────────────────────║
║ [Response content here]                           ║
╚═══════════════════════════════════════════════════╝
```

### Left Sidebar (History)
```
Query History
─────────────
• What is quantum...
  12:34 PM   4/4 ✓

• Explain machine...
  12:32 PM   3/4 ⚠

[Load More]
```
Click any query to reload it

---

## Example Queries

### 1. Simple Question
```
What is the capital of France?
```
**Recommended platforms**: All
**Expected time**: ~10-15 seconds

### 2. Coding Question
```
Write a Python function to calculate fibonacci numbers
```
**Recommended platforms**: Claude, ChatGPT, Gemini
**Expected time**: ~15-20 seconds
**Auto-detected**: Coding, Python

### 3. Creative Writing
```
Write a short story about a robot learning to paint
```
**Recommended platforms**: Claude, Poe
**Expected time**: ~20-30 seconds
**Auto-detected**: Creative

### 4. Technical Analysis
```
Compare the advantages and disadvantages of microservices vs monolithic architecture
```
**Recommended platforms**: Claude, Gemini, LMArena
**Expected time**: ~20-25 seconds
**Auto-detected**: Analytical

### 5. Code Review
```
Review this code:
\`\`\`python
def factorial(n):
    if n == 0:
        return 1
    return n * factorial(n-1)
\`\`\`
```
**Recommended platforms**: Claude, ChatGPT
**Expected time**: ~15-20 seconds
**Auto-detected**: Coding, Python, Review

---

## Keyboard Shortcuts Reference

| Shortcut | Action | Context |
|----------|--------|---------|
| `Ctrl+Enter` | Submit query | Prompt input |
| `Ctrl+K` | Clear input | Prompt input |
| `Ctrl+D` | Toggle dark mode | Anywhere |
| `/` | Focus prompt | Anywhere (not in input) |
| `Escape` | Close modals | Modal open |
| `Tab` | Navigate | Anywhere |
| `↑` `↓` | Navigate history | History list |

---

## Common Tasks

### Export a Query
1. Click on a query in history
2. Scroll to the bottom of responses
3. Click "Export" button
4. Choose format (JSON/Markdown/CSV)

### Compare Responses
1. Submit a query to multiple platforms
2. Wait for responses
3. Click "Compare" button
4. View side-by-side comparison

### Vote on Responses
1. After receiving responses
2. Click vote buttons on each response:
   - 👍 This response is helpful
   - 👎 This response is not helpful
   - ⭐ This is the best response

### Clear History
1. Click settings icon (⚙️)
2. Scroll to "History Management"
3. Click "Clear History"

### Change Default Platforms
1. Click settings icon (⚙️)
2. Under "Default Platforms"
3. Check/uncheck platforms
4. Click "Save"

---

## Troubleshooting Guide

### Problem: Page Won't Load
**Solution**:
```bash
# Check if server is running
ps aux | grep web-server

# If not running, start it
./start-web-server.sh
```

### Problem: "Disconnected from server"
**Solution**:
1. Check server logs
2. Refresh browser page
3. Clear browser cache
4. Restart server

### Problem: "Authentication required"
**Solution**:
This means you need to log in to the platform manually:
1. Run browser automation in non-headless mode
2. Log in to the platform
3. Cookies will be saved automatically
4. Future requests will use saved cookies

### Problem: "Rate limit reached"
**Solution**:
- Wait for the cooldown period (shown in message)
- Reduce number of selected platforms
- Spread out queries over time

### Problem: Platform shows as "Error"
**Solution**:
1. Check if platform is accessible in your browser
2. Try refreshing the page
3. Check `selectors-config.json` for correct selectors
4. Platform may be down (try later)

### Problem: Slow Responses
**Solution**:
- Normal response time is 10-30 seconds per platform
- Reduce number of platforms
- Check your internet connection
- Some platforms are naturally slower

---

## Advanced Features

### Using the API Directly

#### Submit Query via cURL:
```bash
curl -X POST http://localhost:3000/api/query \
  -H "Content-Type: application/json" \
  -d '{
    "prompt": "Explain quantum computing",
    "platforms": ["claude", "chatgpt"]
  }'
```

#### Get Platform Status:
```bash
curl http://localhost:3000/api/status
```

#### Get Metrics:
```bash
curl http://localhost:3000/api/metrics
```

### WebSocket Connection

#### JavaScript Example:
```javascript
const ws = new WebSocket('ws://localhost:3000');

ws.onopen = () => {
  console.log('Connected');

  // Subscribe to query updates
  ws.send(JSON.stringify({
    type: 'subscribe',
    queryId: 'query_123'
  }));
};

ws.onmessage = (event) => {
  const message = JSON.parse(event.data);
  console.log('Received:', message);
};
```

### Custom Configuration

#### Environment Variables:
```bash
# Custom port
PORT=8080 node web-server.js

# Bind to specific interface
HOST=127.0.0.1 node web-server.js

# Production mode
NODE_ENV=production node web-server.js

# Custom CORS
CORS_ORIGINS=http://example.com node web-server.js
```

#### Update Platform Selectors:
Edit `/home/gary/ish-automation/selectors-config.json`:
```json
{
  "platforms": {
    "claude": {
      "url": "https://claude.ai/new",
      "selectors": {
        "promptInput": [
          "div[contenteditable='true']",
          "your-custom-selector"
        ]
      }
    }
  }
}
```

---

## Tips & Best Practices

### 1. Platform Selection
- **For code**: Use Claude, ChatGPT, Gemini
- **For creative**: Use Claude, Poe
- **For analysis**: Use Claude, Gemini, LMArena
- **For general**: Use all platforms

### 2. Prompt Writing
- Be specific and clear
- Include context when needed
- Use code blocks for code-related queries
- Break complex questions into parts

### 3. Managing Results
- Vote on responses to build platform rankings
- Export important queries for reference
- Use comparison view for critical decisions
- Keep history clean by clearing old queries

### 4. Performance
- Select fewer platforms for faster results
- Use auto-detection recommendations
- Close browser tabs you're not using
- Clear history periodically

### 5. Mobile Usage
- Interface is fully responsive
- Use landscape mode for better view
- Swipe to navigate history
- All features available on mobile

---

## Production Deployment

### Using PM2:
```bash
# Install PM2
npm install -g pm2

# Start server
pm2 start web-server.js --name "ai-orchestrator"

# Save configuration
pm2 save

# Setup auto-start on boot
pm2 startup
```

### Using systemd:
Create `/etc/systemd/system/ai-orchestrator.service`:
```ini
[Unit]
Description=AI Orchestrator Web Server
After=network.target

[Service]
Type=simple
User=gary
WorkingDirectory=/home/gary/ish-automation
ExecStart=/usr/bin/node /home/gary/ish-automation/web-server.js
Restart=always
Environment=NODE_ENV=production
Environment=PORT=3000

[Install]
WantedBy=multi-user.target
```

Enable and start:
```bash
sudo systemctl enable ai-orchestrator
sudo systemctl start ai-orchestrator
sudo systemctl status ai-orchestrator
```

### Nginx Reverse Proxy:
```nginx
server {
    listen 80;
    server_name your-domain.com;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }
}
```

---

## Support & Resources

### Documentation
- **WEB-INTERFACE-README.md**: Complete reference
- **WEB-INTERFACE-VISUAL-GUIDE.md**: Visual tour
- **WEB-INTERFACE-COMPLETE.md**: Implementation details

### Scripts
- `./start-web-server.sh`: Start server
- `./test-web-interface.sh`: Run tests
- `npm run web`: Start via npm

### Configuration
- `selectors-config.json`: Platform settings
- `package.json`: npm scripts
- `.env`: Environment variables

---

## 🎉 You're All Set!

Start the server and begin querying multiple AI platforms simultaneously:

```bash
./start-web-server.sh
```

Then open: **http://localhost:3000**

**Happy querying!** 🚀

---

**Last Updated**: 2025-10-21
**Version**: 1.0.0
