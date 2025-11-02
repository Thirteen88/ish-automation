# ISH Chat Remote - Flutter Mobile App

A comprehensive Flutter mobile application for remote control of the ISH Chat integration system.

## Features

### 🎯 Core Functionality
- **Device Control**: Remote control of Android devices
- **Voice Commands**: Speech-to-text integration for hands-free control
- **OCR Integration**: Extract text from screenshots and images
- **AI Chat**: Enhanced AI conversations with multiple providers
- **Real-time Updates**: WebSocket integration for live updates
- **Automation History**: Track and manage automation sessions

### 🎤 Voice Commands
- 21 pre-defined voice commands
- Support for multiple speech recognition engines
- Voice profile management
- Real-time command execution feedback

### 📱 User Interface
- Material Design 3 interface
- Dark/Light theme support
- Responsive design for tablets and phones
- Intuitive navigation and controls

### 🔗 Connectivity
- WebSocket real-time communication
- HTTP API integration
- Automatic reconnection handling
- Connection status monitoring

## Requirements

- Flutter SDK >= 3.10.0
- Dart SDK >= 3.0.0
- Android SDK (for Android development)
- iOS SDK (for iOS development)

## Installation

### 1. Clone the Repository
```bash
git clone <repository-url>
cd ishchat-integration/mobile_app
```

### 2. Install Dependencies
```bash
flutter pub get
```

### 3. Generate JSON Serialization Code
```bash
flutter packages pub run build_runner build --delete-conflicting-outputs
```

### 4. Run the App
```bash
# For Android
flutter run

# For iOS
flutter run -d ios

# For Web (if supported)
flutter run -d web
```

## Configuration

### Environment Variables
The app can be configured using environment variables or by modifying `lib/utils/config.dart`:

```dart
const String baseUrl = String.fromEnvironment(
  'API_BASE_URL',
  defaultValue: 'http://192.168.1.100:8000',
);
```

### Build Configuration
For production builds:

```bash
# Android Release
flutter build apk --release

# iOS Release
flutter build ios --release
```

## Architecture

### Provider Pattern
The app uses the Provider pattern for state management:
- `DeviceProvider`: Device status and command execution
- `VoiceProvider`: Voice command recognition and management
- `AppStateProvider`: App-wide settings and preferences

### Service Layer
- `ApiService`: HTTP API communication
- `WebSocketService`: Real-time WebSocket connection

### Models
- `DeviceStatus`: Device information and status
- `VoiceCommand`: Voice command data and results
- `AutomationSession`: Session history and analytics

## Features in Detail

### Voice Commands
The app supports 21 voice commands across categories:

**Navigation:**
- "go home"
- "go back"
- "scroll up/down"
- "swipe left/right"

**Applications:**
- "open chrome"
- "open messages"
- "open camera"
- "close app"

**Automation:**
- "take screenshot"
- "start/stop recording"
- "refresh page"

**System:**
- "volume up/down"
- "mute/unmute"

**Assistant:**
- "hey assistant"
- "help me"
- "what can i say"

### OCR Integration
- Extract text from screenshots
- Multiple OCR engine support
- Real-time text analysis
- Text-to-speech integration

### AI Chat
- Multiple AI provider support (OpenAI, Anthropic, etc.)
- Context-aware conversations
- Real-time response streaming
- Conversation history

## API Integration

The mobile app integrates with the main ISH Chat integration API:

- **Device Control**: `/api/android/*` endpoints
- **Voice Commands**: `/api/voice/*` endpoints
- **OCR Services**: `/api/ocr/*` endpoints
- **AI Services**: `/api/ai/*` endpoints
- **WebSocket**: `ws://host:8000/ws`

## Development

### Project Structure
```
lib/
├── main.dart                 # App entry point
├── models/                   # Data models
├── providers/                # State management
├── services/                 # API and WebSocket services
├── screens/                  # UI screens
├── widgets/                  # Reusable UI components
└── utils/                    # Utilities and configuration
```

### Adding New Features
1. Create models in `lib/models/`
2. Add providers for state management
3. Implement API services in `lib/services/`
4. Create UI screens in `lib/screens/`
5. Add reusable widgets in `lib/widgets/`

### Code Generation
For JSON serialization models:
```bash
flutter packages pub run build_runner build --delete-conflicting-outputs
```

### Testing
```bash
# Run unit tests
flutter test

# Run widget tests
flutter test --test-name="Widget tests"

# Run integration tests
flutter test integration_test/
```

## Troubleshooting

### Common Issues

1. **WebSocket Connection Failed**
   - Check API base URL configuration
   - Ensure server is running and accessible
   - Verify network connectivity

2. **Voice Recognition Not Working**
   - Check microphone permissions
   - Ensure speech recognition is available
   - Verify internet connection for cloud-based recognition

3. **API Connection Issues**
   - Verify server URL and port
   - Check network connectivity
   - Ensure server is running

4. **Build Errors**
   - Run `flutter clean`
   - Run `flutter pub get`
   - Regenerate code with build_runner

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests for new functionality
5. Submit a pull request

## License

This project is part of the ISH Chat integration system. See the main project license for details.

## Support

For support and questions:
- Check the main project documentation
- Review the API documentation
- Open an issue in the repository