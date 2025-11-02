# ish.chat Integration

Complete integration for ish.chat web interface with backend API relay.

## Quick Start

1. Install dependencies:
```bash
source venv/bin/activate
pip install -r requirements.txt
```

2. Configure environment:
```bash
# Edit .env file
nano .env
```

3. Update JavaScript selectors:
```bash
# Edit static/ishchat-interceptor.js
# Update chatContainer, userMessageSelector, botMessageSelector
nano static/ishchat-interceptor.js
```

4. Run the server:
```bash
cd src
python main.py
```

5. Test the setup:
```bash
pytest tests/
```

## Usage

### Backend API

The backend runs on `http://localhost:8000`

**Endpoints:**
- `GET /health` - Health check
- `POST /api/relay` - Relay messages from client
- `POST /api/send` - Send messages to ish.chat

### Client-Side Integration

Include the interceptor in your HTML:
```html
<script src="static/ishchat-interceptor.js"></script>
```

Or load from your backend:
```html
<script src="http://localhost:8000/static/ishchat-interceptor.js"></script>
```

## Docker Deployment
```bash
# Build and run
docker-compose up -d

# View logs
docker-compose logs -f

# Stop
docker-compose down
```

## Configuration

Edit `.env` file:
```env
BACKEND_API_KEY=your-secure-key-here
ISHCHAT_API_URL=https://ish.chat/api/chat
ALLOWED_ORIGINS=https://yoursite.com
```

## Testing
```bash
# Run all tests
pytest

# Run with coverage
pytest --cov=src --cov-report=html

# View coverage report
open htmlcov/index.html
```

## Troubleshooting

**Container not found:**
- Check browser console for available containers
- Update `chatContainer` in `ishchat-interceptor.js`

**Messages not captured:**
- Inspect ish.chat's DOM structure
- Update message selectors

**CORS errors:**
- Add your domain to `ALLOWED_ORIGINS`

## Debug Mode

Open browser console and access debug tools:
```javascript
// View current config
console.log(window.ishChatConfig);

// Manually trigger message processing
window.ishChatDebug.processMessage(element, 'user');
```
