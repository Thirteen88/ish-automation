# Quick Start Guide - AI Orchestrator Chrome Extension

## 🚀 Quick Installation (3 Steps)

### Step 1: Start the Server
```bash
cd /home/gary/ish-automation
node web-server.js
```

Wait for: `✅ AI Orchestrator Web Server running!`

### Step 2: Load Extension in Chrome
1. Open Chrome
2. Go to: `chrome://extensions/`
3. Enable **Developer mode** (top-right toggle)
4. Click **Load unpacked**
5. Navigate to: `/home/gary/ish-automation/browser-extension`
6. Click **Select Folder**

### Step 3: Verify Connection
1. Click the AI Orchestrator icon in Chrome toolbar
2. Check connection status shows "Connected" (green dot)
3. Ready to use!

## 📝 First Query

### Option 1: Quick Test
1. Select any text on a webpage
2. Right-click → "Ask All AIs"
3. Responses appear in the side panel

### Option 2: Custom Query
1. Click the extension icon
2. Type your question
3. Click "Ask All AIs"
4. View responses in side panel

## 🎯 Common Use Cases

### Summarize an Article
1. Select article text
2. Right-click → Ask All AIs → **Summarize**
3. Compare summaries from all platforms

### Explain Technical Concepts
1. Select technical term or code
2. Right-click → Ask All AIs → **Explain**
3. Get simple explanations from multiple AIs

### Improve Your Writing
1. Select your text
2. Right-click → Ask All AIs → **Improve**
3. See suggestions from all platforms

### Translate Text
1. Select foreign language text
2. Right-click → Ask All AIs → **Translate**
3. Compare translations

## ⚡ Keyboard Shortcuts

- `Ctrl+Shift+A` (or `Cmd+Shift+A` on Mac) - Ask selected text
- `Ctrl+Shift+S` (or `Cmd+Shift+S` on Mac) - Open side panel

## 🎨 Features at a Glance

### Popup Window
- Quick query input
- Platform selection (toggle on/off)
- Recent queries
- Connection status

### Side Panel (auto-opens)
- **Active Queries**: See all responses in real-time
- **Comparison**: Compare responses side-by-side
- **History**: Browse past queries

### Context Menu
- Right-click selected text
- Choose platform or action
- Instant results

### Floating Button
- Appears when you select text
- Quick access to common actions
- Non-intrusive design

## 🔧 Troubleshooting

### "Disconnected" Status
→ Make sure `node web-server.js` is running

### No Responses
→ Check server terminal for errors
→ Verify platforms are configured in web-server.js

### Extension Not Loading
→ Check for errors in `chrome://extensions/`
→ Make sure you selected the correct folder

## 📊 What's Happening Behind the Scenes

1. You submit a query → Extension sends to `localhost:3000`
2. Server distributes to all AI platforms
3. Responses stream back via WebSocket
4. Extension displays in real-time
5. You vote on best responses

## 🎓 Pro Tips

1. **Platform Selection**: Disable slow platforms for faster results
2. **History**: Click history items to re-view responses
3. **Export**: Save important responses as JSON or Markdown
4. **Voting**: Help track which platforms give best responses
5. **Comparison**: Use comparison view for important decisions

## 📱 Server Must Be Running!

**Remember**: The extension needs the orchestrator server running to work.

```bash
# Terminal 1: Start server
cd /home/gary/ish-automation
node web-server.js

# Keep this running while using the extension!
```

## 🎉 You're Ready!

The extension is now installed and ready to use. Start by:
1. Selecting some text on any webpage
2. Right-clicking and choosing "Ask All AIs"
3. Watching multiple AI responses appear in real-time!

---

**Need help?** Check the full README.md for detailed documentation.
