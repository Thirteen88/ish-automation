# AI Orchestrator Chrome Extension

A powerful Chrome browser extension that interfaces with the AI orchestrator to query multiple AI platforms simultaneously and compare their responses in real-time.

## Features

### 🎯 Core Functionality
- **Multi-Platform Queries**: Submit queries to Claude, ChatGPT, Gemini, and LMArena simultaneously
- **Real-time Streaming**: Watch responses appear in real-time via WebSocket connection
- **Context Menu Integration**: Right-click selected text to ask AIs instantly
- **Keyboard Shortcuts**: Quick access with `Ctrl+Shift+A` (or `Cmd+Shift+A` on Mac)

### 📊 Response Management
- **Side Panel Viewer**: Full response viewer with tabs for active queries, comparison, and history
- **Response Comparison**: Compare responses side-by-side to identify the best answer
- **Vote System**: Upvote, downvote, or mark responses as "best"
- **Export Functionality**: Export responses as JSON, Markdown, or copy to clipboard

### ✨ Smart Features
- **Floating Action Button**: Appears on text selection with quick action options
- **Quick Actions**:
  - Summarize selected text
  - Explain concepts in simple terms
  - Translate to English
  - Improve writing quality
- **Badge Notifications**: Shows count of pending/completed responses
- **Query History**: Access past queries with timestamps and platform info

### 🎨 User Experience
- **Beautiful UI**: Modern gradient design with smooth animations
- **Connection Status**: Real-time server connection indicator
- **Platform Selection**: Toggle individual platforms on/off
- **Settings**: Customize default platforms and behavior
- **Inline Display**: Optional inline response panel on the current page

## Installation

### Prerequisites
- Chrome browser (or Chromium-based browser like Edge, Brave, etc.)
- AI Orchestrator web server running on `localhost:3000`

### Steps

1. **Start the AI Orchestrator Server**
   ```bash
   cd /home/gary/ish-automation
   node web-server.js
   ```
   The server should be running on http://localhost:3000

2. **Load the Extension**
   - Open Chrome and navigate to `chrome://extensions/`
   - Enable "Developer mode" (toggle in top-right corner)
   - Click "Load unpacked"
   - Select the `/home/gary/ish-automation/browser-extension` directory

3. **Verify Installation**
   - You should see the AI Orchestrator icon in your extensions toolbar
   - Click the icon to open the popup
   - Check that the connection status shows "Connected"

## Usage

### Method 1: Right-Click Context Menu

1. Select any text on a webpage
2. Right-click and choose "Ask All AIs"
3. Choose from:
   - **Ask All AIs** - Query all platforms with selected text
   - **Ask Claude/ChatGPT/Gemini/LMArena** - Query specific platform
   - **Summarize** - Get a concise summary
   - **Explain** - Get a simple explanation
   - **Translate** - Translate to English
   - **Improve** - Improve writing quality

### Method 2: Floating Action Button

1. Select text on any webpage
2. A floating button appears below the selection
3. Click on quick action buttons:
   - All AIs
   - Summarize
   - Explain
   - Translate
   - Improve

### Method 3: Extension Popup

1. Click the AI Orchestrator icon in the toolbar
2. Enter your query in the text area
3. Select which platforms to query (toggle checkboxes)
4. Click "Ask All AIs"
5. Side panel opens automatically with responses

### Method 4: Keyboard Shortcut

1. Select text on a webpage
2. Press `Ctrl+Shift+A` (Windows/Linux) or `Cmd+Shift+A` (Mac)
3. Query is submitted to all platforms automatically

## Side Panel Features

### Active Queries Tab
- View all currently processing or completed queries
- See real-time streaming responses
- Expand/collapse individual responses
- Vote on response quality (👍 👎 ⭐)
- Copy individual or all responses
- Export as JSON or Markdown

### Comparison Tab
- Compare responses from different platforms side-by-side
- Identify the best response quickly
- Mark favorites for future reference

### History Tab
- Browse past queries with timestamps
- Filter by date and platform
- Click to view full details
- Re-run previous queries

## API Integration

The extension communicates with the AI Orchestrator server via:

### REST API Endpoints
- `POST /api/query` - Submit new query
- `GET /api/query/:id` - Get query details
- `GET /api/status` - Platform status
- `GET /api/history` - Query history
- `POST /api/vote` - Vote on responses
- `GET /api/export/:id` - Export query results

### WebSocket Connection
- Real-time query status updates
- Streaming response chunks
- Platform completion notifications
- Connection status monitoring

## Configuration

### Default Settings
```javascript
{
  defaultPlatforms: ['lmarena', 'claude', 'chatgpt', 'gemini'],
  autoOpenSidePanel: true,
  showFloatingButton: true,
  enableNotifications: true,
  serverUrl: 'http://localhost:3000'
}
```

### Customization
- Click the "Settings" button in the popup to modify preferences
- Platform selections are saved automatically
- Settings persist across browser sessions

## File Structure

```
browser-extension/
├── manifest.json          # Extension manifest (Manifest V3)
├── background.js          # Service worker for background tasks
├── content.js            # Content script injected into pages
├── content.css           # Styles for content script UI
├── popup.html            # Extension popup interface
├── popup.js              # Popup logic and interactions
├── sidepanel.html        # Side panel interface
├── sidepanel.js          # Side panel logic and data management
└── icons/                # Extension icons
    ├── icon16.png
    ├── icon48.png
    └── icon128.png
```

## Features Breakdown

### Background Service Worker (`background.js`)
- Context menu creation and management
- WebSocket connection to orchestrator server
- Query submission and tracking
- Badge notifications
- Message routing between components
- Persistent storage management

### Content Script (`content.js`)
- Text selection detection
- Floating action button display
- Inline response panels
- Quick action handlers
- Visual feedback and notifications

### Popup (`popup.html`, `popup.js`)
- Quick query interface
- Platform selection toggles
- Recent queries display
- Connection status indicator
- Settings access

### Side Panel (`sidepanel.html`, `sidepanel.js`)
- Active queries monitoring
- Response comparison view
- Query history browser
- Export functionality (JSON, Markdown)
- Vote and rating system

## Troubleshooting

### Extension not connecting to server
- Ensure the web server is running: `node web-server.js`
- Check that the server is accessible at http://localhost:3000
- Verify no firewall is blocking the connection
- Check browser console for errors (F12 > Console)

### Responses not appearing
- Check the side panel for error messages
- Verify platform status in the server logs
- Ensure the orchestrator has active browser sessions
- Check WebSocket connection in Network tab (F12 > Network > WS)

### Floating button not showing
- Check extension settings (Settings > showFloatingButton)
- Ensure content script is loaded (check Extensions page)
- Try refreshing the webpage
- Verify no CSS conflicts with the page

### Badge not updating
- Refresh the extension (chrome://extensions/ > Reload)
- Check background service worker console
- Verify WebSocket connection is active

## Development

### Testing Locally
1. Make changes to extension files
2. Go to `chrome://extensions/`
3. Click "Reload" button for AI Orchestrator extension
4. Test your changes

### Debugging
- **Background Script**: `chrome://extensions/` > AI Orchestrator > "service worker"
- **Content Script**: F12 on any webpage > Console
- **Popup**: Right-click extension icon > "Inspect popup"
- **Side Panel**: F12 when side panel is open

### Adding New Features
1. Update `manifest.json` if adding new permissions
2. Modify relevant scripts (background, content, popup, or sidepanel)
3. Update this README with new functionality
4. Test thoroughly across different scenarios

## Security Notes

- Extension only connects to `localhost:3000` by default
- All queries are sent through the local orchestrator server
- No data is stored on external servers
- History is stored locally in Chrome storage
- WebSocket connection is not encrypted (local only)

## Performance

- Minimal memory footprint (~10-20 MB)
- Efficient WebSocket communication
- Debounced UI updates for smooth performance
- Automatic cleanup of old queries (100 query limit)
- Lazy loading of query history

## Browser Compatibility

- ✅ Chrome 88+ (Manifest V3)
- ✅ Edge 88+
- ✅ Brave
- ✅ Opera
- ❌ Firefox (requires Manifest V2 version)

## Future Enhancements

- [ ] Settings page with advanced configuration
- [ ] Custom platform endpoints
- [ ] Query templates and favorites
- [ ] Advanced filtering and search
- [ ] Response analytics and insights
- [ ] Offline mode with cached responses
- [ ] Multiple server profiles
- [ ] Theme customization

## License

This extension is part of the ISH Automation System.

## Support

For issues or questions:
1. Check the troubleshooting section above
2. Review server logs for errors
3. Inspect browser console for client-side issues
4. Verify all prerequisites are met

---

**Enjoy querying multiple AIs simultaneously!** 🚀
