# AI Orchestrator Mobile PWA

A Progressive Web App for mobile access to the AI Orchestrator system. Query multiple AI platforms simultaneously from your mobile device with a native app-like experience.

## Features

### 🎯 Core Functionality
- **Multi-Platform Queries**: Query Claude, ChatGPT, Gemini, LMArena, and Poe simultaneously
- **Real-time Responses**: Stream responses as they arrive via WebSocket
- **Voice Input**: Use voice recognition for hands-free query submission
- **Platform Selection**: Choose which AI platforms to query with touch-optimized cards
- **Response Comparison**: View and compare responses from different platforms

### 📱 Mobile-First Design
- **Touch-Optimized UI**: Large tap targets and swipe gestures
- **Responsive Layout**: Works on all screen sizes (phones, tablets)
- **Native App Feel**: Standalone mode with custom splash screen
- **Bottom Navigation**: Easy one-handed navigation
- **Pull-to-Refresh**: Refresh data with intuitive gesture
- **Safe Area Support**: Full iPhone notch and Android gesture support

### 🔄 Offline Capabilities
- **Service Worker Caching**: Works offline after first visit
- **Background Sync**: Automatically syncs queued queries when back online
- **Cached Responses**: View previous responses offline
- **Smart Retry**: Auto-retry failed requests with exponential backoff

### 📢 Push Notifications
- **Query Completion**: Get notified when all platforms respond
- **Platform Updates**: Status change notifications
- **Background Updates**: Receive updates even when app is closed
- **Rich Notifications**: Action buttons (View, Dismiss)

### 🎨 User Experience
- **Haptic Feedback**: Vibration feedback for interactions
- **Dark Mode**: System-aware theme switching
- **Toast Notifications**: Non-intrusive status updates
- **Loading States**: Skeleton screens and progress indicators
- **Swipe Gestures**: Swipe response cards to dismiss

### 🔐 Share Integration
- **Native Share API**: Share responses to other apps
- **Copy to Clipboard**: Quick copy fallback
- **Export Support**: Download query results

## Installation

### iOS (iPhone/iPad)

1. Open Safari and navigate to the PWA URL
2. Tap the Share button (square with arrow)
3. Scroll down and tap "Add to Home Screen"
4. Tap "Add" to confirm
5. The app icon will appear on your home screen

### Android

1. Open Chrome and navigate to the PWA URL
2. Tap the menu (three dots)
3. Tap "Add to Home Screen" or "Install App"
4. Tap "Add" or "Install" to confirm
5. The app will be installed like a native app

### Desktop (Chrome/Edge)

1. Navigate to the PWA URL
2. Click the install icon in the address bar (+ or computer icon)
3. Click "Install" in the dialog
4. The app will open in a standalone window

## Configuration

### Server Connection

The PWA connects to your orchestrator server. Update the API base URL in `app.js`:

```javascript
const API_BASE = 'http://your-server:3000';
```

For external access via ngrok or other tunnels:

```javascript
const API_BASE = 'https://your-ngrok-url.ngrok.io';
```

### Settings

Access settings via the gear icon in the header:

- **Dark Mode**: Toggle dark/light theme
- **Haptic Feedback**: Enable/disable vibrations
- **Auto-submit Voice**: Submit queries automatically after voice input
- **Notifications**: Enable push notifications
- **Clear Cache**: Remove all cached data

## Usage

### Making a Query

1. **Select Platforms**: Tap platform cards to select (blue border = selected)
2. **Enter Prompt**: Type your question or tap mic for voice input
3. **Submit**: Tap "Submit Query" button
4. **View Responses**: Responses stream in real-time as cards
5. **Vote**: Tap 👍 👎 ⭐ to rate responses
6. **Share**: Tap share icon to export responses

### Voice Input

1. Tap the microphone button
2. Speak your query (microphone turns red while listening)
3. The text appears in the input field
4. Tap submit or enable auto-submit in settings

### Viewing History

1. Tap "History" in bottom navigation
2. Scroll through previous queries
3. Tap any query to view its responses
4. Swipe left/right to dismiss cards

### Checking Status

1. Tap "Status" in bottom navigation
2. View health status of all platforms
3. See request counts and error rates
4. Check last response times

### Offline Mode

- Queries submitted offline are automatically queued
- They sync when connection is restored
- Previously viewed responses remain available
- Platform status shows last known state

## App Shortcuts

Long-press the app icon (Android) or 3D Touch (iOS) for quick actions:

- **New Query**: Jump straight to query input
- **History**: View recent queries
- **Status**: Check platform health

## Notifications

### Setup

1. Open Settings in the app
2. Enable "Notifications"
3. Grant permission when prompted
4. Receive notifications for:
   - Query completion
   - Platform errors
   - System updates

### Actions

Notification buttons:
- **View**: Open the app to the relevant query
- **Dismiss**: Close the notification

## Performance

### Caching Strategy

- **Static Assets**: Cache-first (instant load)
- **API Responses**: Network-first with cache fallback
- **Images**: Cache on first load
- **Background Sync**: Automatic retry for failed requests

### Cache Management

- Automatic cleanup of old entries (7 days)
- Manual cache clearing in settings
- Efficient storage usage
- IndexedDB for offline data

## Keyboard Shortcuts

- **Ctrl + Enter**: Submit query
- **Ctrl + K**: Clear input (desktop only)
- **Ctrl + D**: Toggle dark mode (desktop only)
- **/**: Focus prompt input (desktop only)

## Browser Support

### Full Support
- Chrome 90+ (Android, Desktop)
- Safari 15+ (iOS, iPadOS, macOS)
- Edge 90+
- Samsung Internet 14+

### Partial Support
- Firefox 88+ (no install prompt)
- Opera 76+

### Required Features
- Service Workers
- Web App Manifest
- IndexedDB
- Push API (optional)
- Web Speech API (optional for voice)
- Vibration API (optional for haptics)

## Troubleshooting

### App Won't Install

**iOS:**
- Must use Safari (not Chrome/Firefox)
- Ensure not in Private Browsing mode
- Check iOS version is 15+

**Android:**
- Clear browser cache and try again
- Update Chrome to latest version
- Check Android version is 8+

### Notifications Not Working

1. Check Settings > Enable Notifications
2. Grant permission when prompted
3. Check device notification settings
4. Ensure not in Do Not Disturb mode

### Offline Mode Issues

1. Load the app once while online
2. Check Settings > Clear Cache and reload
3. Verify service worker is registered (DevTools)
4. Check browser storage quota

### WebSocket Connection Failed

1. Verify server is running
2. Check server URL in app.js
3. Ensure WebSocket port is accessible
4. Check firewall/proxy settings

### Voice Input Not Working

1. Grant microphone permission
2. Test microphone in device settings
3. Use HTTPS (required for voice API)
4. Check browser compatibility

## Development

### File Structure

```
mobile-app/
├── index.html              # Main HTML (mobile-optimized)
├── app.js                  # Application logic
├── service-worker.js       # PWA service worker
├── manifest.webmanifest    # PWA manifest
├── icons/                  # App icons (various sizes)
├── splash/                 # Splash screens (iOS)
└── README.md              # This file
```

### Testing Locally

1. Start the orchestrator server:
   ```bash
   cd /home/gary/ish-automation
   node web-server.js
   ```

2. Serve the mobile app:
   ```bash
   npx serve mobile-app -p 8080
   ```

3. Open in browser:
   ```
   http://localhost:8080
   ```

4. Test service worker:
   - Open DevTools > Application > Service Workers
   - Check registration status
   - Test offline mode by checking "Offline"

### Building Icons

Generate all required icon sizes from a source image:

```bash
# Install image processing tool
npm install -g pwa-asset-generator

# Generate icons
pwa-asset-generator source-logo.svg icons/ \
  --icon-only \
  --favicon \
  --background "#3b82f6"

# Generate splash screens
pwa-asset-generator source-logo.svg splash/ \
  --splash-only \
  --background "#1f2937"
```

### Testing PWA Features

Use Chrome DevTools Lighthouse:
1. Open DevTools (F12)
2. Go to Lighthouse tab
3. Select "Progressive Web App"
4. Click "Generate report"
5. Review and fix any issues

### Debugging

**Service Worker:**
```javascript
// In DevTools Console
navigator.serviceWorker.getRegistrations()
  .then(regs => console.log(regs));

// Force update
navigator.serviceWorker.getRegistrations()
  .then(regs => regs[0].update());
```

**Cache Inspection:**
```javascript
// List all caches
caches.keys().then(names => console.log(names));

// View cache contents
caches.open('ai-orchestrator-v1.0.0')
  .then(cache => cache.keys())
  .then(keys => console.log(keys));
```

**IndexedDB:**
- DevTools > Application > IndexedDB
- Inspect "AIOrchestrator" database
- View stored queries and responses

## Security

### HTTPS Requirement

PWA features require HTTPS (except localhost):
- Service Workers
- Push Notifications
- Web Speech API
- Geolocation
- Camera/Microphone

Use ngrok or similar for testing:
```bash
ngrok http 8080
```

### Permissions

The app requests:
- **Notifications**: For query completion alerts
- **Microphone**: For voice input (optional)
- **Storage**: For offline caching

### Data Privacy

- All data stored locally (IndexedDB)
- No third-party analytics
- No tracking cookies
- Queries sent only to your orchestrator server

## Updates

The service worker automatically checks for updates:

1. New version detected
2. User sees toast notification
3. Pull-to-refresh to activate
4. Old cache automatically cleared

### Manual Update

1. Open Settings
2. Tap "Clear Cache"
3. Refresh the page
4. Service worker re-installs

## Performance Tips

1. **Reduce Selected Platforms**: Fewer platforms = faster responses
2. **Enable Dark Mode**: Saves battery on OLED screens
3. **Clear Cache Regularly**: Frees up storage space
4. **Disable Haptics**: Saves battery
5. **Use WiFi**: WebSocket connection more stable

## Contributing

To add features or fix bugs:

1. Edit relevant files in `mobile-app/`
2. Test on multiple devices
3. Update service worker cache version
4. Test offline functionality
5. Verify on both iOS and Android

## License

Part of the AI Orchestrator project. See main project LICENSE.

## Support

For issues or questions:
- Check the main orchestrator documentation
- Review browser console for errors
- Test service worker registration
- Verify server connectivity

## Changelog

### v1.0.0 (2025-01-21)
- Initial release
- Multi-platform query support
- Voice input integration
- Offline mode with background sync
- Push notifications
- Dark mode
- Haptic feedback
- Share API integration
- Pull-to-refresh
- Swipe gestures
- Bottom navigation
- Query history
- Platform status monitoring
