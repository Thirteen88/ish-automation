# AI Orchestrator Chrome Extension - Technical Overview

## Architecture

### Component Structure

```
┌─────────────────────────────────────────────────────────────┐
│                     Chrome Extension                         │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  ┌────────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐ │
│  │ Background │  │ Content  │  │  Popup   │  │   Side   │ │
│  │  Service   │◄─┤  Script  │  │  Window  │  │  Panel   │ │
│  │  Worker    │  └──────────┘  └──────────┘  └──────────┘ │
│  └─────┬──────┘                                             │
│        │                                                     │
└────────┼─────────────────────────────────────────────────────┘
         │
         │ HTTP/WebSocket
         │
         ▼
┌─────────────────────────────────────────────────────────────┐
│              AI Orchestrator Server (localhost:3000)        │
├─────────────────────────────────────────────────────────────┤
│  • REST API Endpoints                                        │
│  • WebSocket Server                                          │
│  • Query Management                                          │
│  • Platform Orchestration                                    │
└─────────────────────────────────────────────────────────────┘
         │
         │ Browser Automation
         │
         ▼
┌─────────────────────────────────────────────────────────────┐
│                    AI Platforms                              │
├─────────────────────────────────────────────────────────────┤
│  LMArena  │  Claude.ai  │  ChatGPT  │  Gemini  │  Poe       │
└─────────────────────────────────────────────────────────────┘
```

## Component Details

### 1. Background Service Worker (`background.js`)

**Responsibilities:**
- Context menu creation and management
- WebSocket connection to orchestrator server
- Query submission and tracking
- Badge notifications
- Message routing between extension components
- Storage management

**Key Features:**
- Persistent WebSocket connection with auto-reconnect
- Active query tracking with Map data structure
- Connection health monitoring
- Badge updates based on query status
- Context menu with platform-specific and action-based options

**Communication Flow:**
```javascript
// Submit query
background.js → POST /api/query → Server

// Receive updates
Server → WebSocket → background.js → broadcast to UI components
```

### 2. Content Script (`content.js`)

**Responsibilities:**
- Text selection detection
- Floating action button display
- Inline response panels
- Quick action handlers
- Visual feedback

**Key Features:**
- Event-driven text selection monitoring
- Non-intrusive floating UI
- Inline response display option
- Quick actions (summarize, explain, translate, improve)
- Automatic positioning near selected text

**Injection:**
- Injected into all webpages (`<all_urls>`)
- Runs at `document_idle` for performance
- Includes content.css for styling

### 3. Popup Window (`popup.html`, `popup.js`)

**Responsibilities:**
- Quick query interface
- Platform selection
- Recent query display
- Connection status monitoring
- Settings access

**Key Features:**
- Real-time connection status indicator
- Platform toggle with visual feedback
- Recent queries from storage
- Keyboard shortcut support (Ctrl/Cmd+Enter)
- Auto-close after query submission

**State Management:**
```javascript
{
  settings: {
    defaultPlatforms: ['lmarena', 'claude', 'chatgpt', 'gemini'],
    autoOpenSidePanel: true,
    showFloatingButton: true,
    enableNotifications: true
  },
  history: [
    { id, prompt, platforms, timestamp }
  ]
}
```

### 4. Side Panel (`sidepanel.html`, `sidepanel.js`)

**Responsibilities:**
- Active query monitoring
- Response comparison
- Query history
- Export functionality
- Vote/rating system

**Key Features:**
- Three-tab interface (Active, Comparison, History)
- Real-time response updates
- Expandable/collapsible responses
- Vote buttons (upvote, downvote, best)
- Export as JSON, Markdown, or clipboard
- Query card with platform grid

**Data Flow:**
```javascript
// Receive updates from background
background.js → runtime.sendMessage → sidepanel.js

// Update active queries map
activeQueries.set(queryId, query)

// Re-render UI
renderActiveQueries()
```

## Data Structures

### Query Object
```javascript
{
  id: "query_1729507845123_1",
  prompt: "Explain quantum computing",
  platforms: ["lmarena", "claude", "chatgpt", "gemini"],
  status: "processing", // pending, processing, completed
  responses: {
    claude: {
      status: "complete",
      success: true,
      response: "Quantum computing uses...",
      timestamp: "2025-10-21T11:30:45.123Z",
      duration: 1234,
      metadata: {}
    },
    chatgpt: {
      status: "processing",
      chunks: ["Quantum", " computing", "..."]
    }
  },
  startTime: 1729507845123,
  endTime: 1729507850456,
  tabId: 123
}
```

### Platform Status
```javascript
{
  name: "claude",
  status: "healthy", // healthy, processing, error, idle
  lastCheck: "2025-10-21T11:30:00Z",
  requestCount: 42,
  errorCount: 1,
  lastError: null,
  lastResponse: 1234 // ms
}
```

## API Integration

### REST Endpoints Used

```javascript
// Submit query
POST /api/query
Body: { prompt: string, platforms: string[] }
Response: { success: bool, queryId: string, platforms: string[] }

// Get query details
GET /api/query/:id
Response: { success: bool, query: Query }

// Get platform status
GET /api/status
Response: { success: bool, platforms: {...} }

// Submit vote
POST /api/vote
Body: { queryId: string, platform: string, vote: 'up'|'down'|'best' }
Response: { success: bool }

// Get history
GET /api/history?limit=50
Response: { success: bool, queries: Query[], total: number }

// Export query
GET /api/export/:id
Response: Query (as JSON download)
```

### WebSocket Messages

```javascript
// Client → Server
{
  type: "subscribe",
  queryId: "query_123"
}

// Server → Client
{
  type: "query-start",
  data: { id: "query_123", ... }
}

{
  type: "platform-start",
  data: { queryId: "query_123", platform: "claude" }
}

{
  type: "response-chunk",
  data: { queryId: "query_123", platform: "claude", chunk: "text" }
}

{
  type: "platform-complete",
  data: {
    queryId: "query_123",
    platform: "claude",
    response: { success: true, response: "...", duration: 1234 }
  }
}

{
  type: "platform-error",
  data: { queryId: "query_123", platform: "claude", error: "..." }
}

{
  type: "query-complete",
  data: { id: "query_123", ... }
}
```

## Message Passing

### Between Components

```javascript
// Content Script → Background
chrome.runtime.sendMessage({
  action: 'submitQuery',
  prompt: 'text',
  platforms: ['claude', 'chatgpt']
})

// Background → Content Script
chrome.tabs.sendMessage(tabId, {
  action: 'queryUpdate',
  query: {...}
})

// Popup → Background
chrome.runtime.sendMessage({
  action: 'getActiveQueries'
}, response => {
  // Handle response
})

// Background → Popup/Side Panel (broadcast)
chrome.runtime.sendMessage({
  action: 'connectionStatus',
  status: 'connected'
})
```

## Storage Schema

### Chrome Local Storage

```javascript
{
  settings: {
    defaultPlatforms: string[],
    autoOpenSidePanel: boolean,
    showFloatingButton: boolean,
    enableNotifications: boolean,
    serverUrl: string
  },
  history: Array<{
    id: string,
    prompt: string,
    platforms: string[],
    timestamp: number
  }>
}
```

## Context Menus

```
Ask All AIs: "%s"
├── Ask Claude
├── Ask ChatGPT
├── Ask Gemini
├── Ask LMArena
├── ─────────────
├── Summarize
├── Explain
├── Translate
└── Improve Writing
```

## Permissions Breakdown

```json
{
  "permissions": [
    "activeTab",      // Access current tab for content injection
    "storage",        // Store settings and history
    "contextMenus",   // Right-click menu integration
    "sidePanel",      // Side panel API
    "scripting"       // Dynamic script injection
  ],
  "host_permissions": [
    "http://localhost:3000/*",  // API server access
    "<all_urls>"                // Content script injection
  ]
}
```

## Performance Optimizations

1. **Debounced UI Updates**: Avoid excessive re-renders during streaming
2. **Lazy Loading**: Load history on demand
3. **Efficient Data Structures**: Use Map for O(1) query lookups
4. **WebSocket Subscriptions**: Only receive updates for subscribed queries
5. **Badge Throttling**: Limit badge updates to avoid flickering
6. **Memory Management**: Auto-cleanup of old queries (100 max)
7. **Incremental Rendering**: Stream chunks without blocking UI

## Security Considerations

1. **Local-Only Connection**: Only connects to localhost:3000
2. **No External Requests**: All queries go through local server
3. **Input Sanitization**: HTML escaping for all user-generated content
4. **CSP Compliance**: No inline scripts in HTML
5. **Storage Limits**: Truncate long prompts before storage
6. **Permission Minimization**: Only request necessary permissions

## Error Handling

### Connection Errors
```javascript
try {
  const response = await fetch('/api/query', {...})
  if (!response.ok) throw new Error(`Server error: ${response.status}`)
} catch (error) {
  // Show user notification
  chrome.notifications.create({
    type: 'basic',
    title: 'Connection Error',
    message: error.message
  })
}
```

### WebSocket Errors
```javascript
wsConnection.onerror = (error) => {
  connectionStatus = 'error'
  broadcastConnectionStatus()
}

wsConnection.onclose = () => {
  // Auto-reconnect after 5 seconds
  setTimeout(connectToServer, 5000)
}
```

### Platform Errors
- Displayed in response card with error status
- Retry option available
- Error tracking in platform status

## Testing Checklist

- [ ] Context menu appears on text selection
- [ ] Floating button shows on selection
- [ ] Popup opens and shows connection status
- [ ] Platform toggles work correctly
- [ ] Query submission succeeds
- [ ] Side panel opens automatically
- [ ] Responses stream in real-time
- [ ] Badge updates with correct counts
- [ ] Vote system works
- [ ] Export functions (JSON, Markdown, Copy)
- [ ] History loads correctly
- [ ] Comparison view displays properly
- [ ] WebSocket reconnects on disconnect
- [ ] Settings persist across sessions
- [ ] Keyboard shortcuts work
- [ ] Error handling displays user-friendly messages

## Future Enhancements

1. **Offline Mode**: Cache responses for offline viewing
2. **Advanced Search**: Filter history by date, platform, keywords
3. **Templates**: Save common query patterns
4. **Analytics**: Track which platforms perform best
5. **Themes**: Dark mode and custom color schemes
6. **Multi-Server**: Support multiple orchestrator instances
7. **Response Diffing**: Highlight differences between platform responses
8. **AI Suggestions**: Auto-suggest best platform based on query type
9. **Batch Queries**: Submit multiple queries at once
10. **Response Rating**: Crowdsource platform quality ratings

## Development Workflow

1. Make code changes in extension files
2. Go to `chrome://extensions/`
3. Click reload for AI Orchestrator
4. Test in browser
5. Check console for errors
6. Iterate

## Debugging Tips

- **Background errors**: Check service worker console
- **Content script errors**: F12 on webpage
- **Popup errors**: Right-click icon → Inspect popup
- **Side panel errors**: F12 when panel is open
- **Network issues**: Network tab → WS for WebSocket
- **Storage issues**: Application tab → Storage → Extensions

---

**Built with**: Chrome Extension Manifest V3, Vanilla JavaScript, WebSocket, REST API
