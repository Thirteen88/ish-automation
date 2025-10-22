# ISH Automation Tunneling Guide

## Overview
This guide provides multiple no-signup tunneling solutions to expose your local ARIA assistant (port 3002) to the internet.

All solutions support:
- ✅ HTTPS encryption
- ✅ WebSocket connections
- ✅ No signup required
- ✅ No authentication needed
- ✅ Instant setup

---

## Quick Start (Recommended)

### Option 1: Serveo.net (Most Reliable)

```bash
cd /home/gary/ish-automation
./start-tunnel.sh
```

This will:
1. Check if your service is running on port 3002
2. Create a public HTTPS URL via serveo.net
3. Auto-reconnect if the connection drops
4. Log all activity to `/tmp/ish-tunnel.log`

**Expected Output:**
```
=========================================
TUNNEL ACTIVE!
Public URL: https://ish-aria-12345.serveo.net
=========================================

Your ARIA assistant is now accessible at:

  https://ish-aria-12345.serveo.net

Features:
  ✓ HTTPS enabled
  ✓ WebSocket support
  ✓ No authentication required
  ✓ No signup needed
```

---

## Alternative Methods

### Option 2: Custom Subdomain (Serveo)

```bash
SUBDOMAIN=my-aria PORT=3002 ./start-tunnel.sh
```

This attempts to get a custom subdomain (may not always be available).

### Option 3: localhost.run

```bash
ssh -R 80:localhost:3002 nokey@localhost.run
```

**Features:**
- Similar to serveo.net
- Provides HTTPS URL
- Random subdomain
- WebSocket support

### Option 4: bore.pub

**Installation:**
```bash
# Install Rust (if not already installed)
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
source $HOME/.cargo/env

# Install bore
cargo install bore-cli
```

**Usage:**
```bash
bore local 3002 --to bore.pub
```

**Features:**
- Fast, Rust-based
- Provides public URL
- WebSocket support
- Lightweight

### Option 5: Direct SSH Tunnel (Manual)

```bash
ssh -R 80:localhost:3002 serveo.net
```

This is the simplest one-liner for serveo.net.

---

## Advanced Configuration

### Environment Variables

```bash
# Change port
PORT=3002 ./start-tunnel.sh

# Custom subdomain
SUBDOMAIN=my-custom-name ./start-tunnel.sh

# Custom log file
LOGFILE=/path/to/custom.log ./start-tunnel.sh
```

### Multiple Tunnels

Run different tunnels in separate terminals:

```bash
# Terminal 1: Serveo
./start-tunnel.sh

# Terminal 2: localhost.run
ssh -R 80:localhost:3002 nokey@localhost.run

# Terminal 3: bore.pub
bore local 3002 --to bore.pub
```

---

## Troubleshooting

### Issue: "No service running on port 3002"

**Solution:**
```bash
# Check if service is running
netstat -tlnp | grep 3002

# Start the ARIA service
cd /home/gary/ish-automation
PORT=3002 node aria-mobile-server.js &
```

### Issue: "Connection refused" or tunnel drops

**Solution:**
- The auto-reconnect script handles this automatically
- Wait 5 seconds for automatic reconnection
- Check logs: `tail -f /tmp/ish-tunnel.log`

### Issue: "SSH key verification failed"

**Solution:**
```bash
# Remove old host key
ssh-keygen -R serveo.net

# Reconnect (will accept new key)
./start-tunnel.sh
```

### Issue: Custom subdomain not available

**Solution:**
- Serveo assigns random subdomains when custom ones are taken
- Try a different name or use a random subdomain
- Random subdomains are more reliable

### Issue: Tunnel works but WebSocket connections fail

**Solution:**
- All recommended solutions support WebSockets
- Check your application's WebSocket configuration
- Ensure your app uses relative URLs for WebSocket connections

---

## Comparison Table

| Solution | Speed | Reliability | WebSocket | Custom Domain | Signup |
|----------|-------|-------------|-----------|---------------|--------|
| serveo.net | ⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ | ✅ | ⚠️ Sometimes | ❌ |
| localhost.run | ⭐⭐⭐⭐ | ⭐⭐⭐⭐ | ✅ | ❌ | ❌ |
| bore.pub | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐ | ✅ | ❌ | ❌ |

**Recommendation:** Use serveo.net via `./start-tunnel.sh` for the best balance of reliability and ease of use.

---

## Security Considerations

### What's Exposed
When you run a tunnel, your local service on port 3002 becomes publicly accessible. Anyone with the URL can access it.

### Best Practices
1. **Don't tunnel sensitive data** without authentication
2. **Use temporary tunnels** - stop when done
3. **Monitor access** - check logs regularly
4. **Rotate URLs** - use new random subdomains frequently
5. **Add authentication** to your app if needed

### Adding Basic Auth (Optional)

If you want to protect your tunnel with a password, modify your Express app:

```javascript
// In aria-mobile-server.js
const basicAuth = require('express-basic-auth');

app.use(basicAuth({
    users: { 'admin': 'your-password-here' },
    challenge: true
}));
```

---

## Monitoring and Logs

### View Real-time Logs
```bash
tail -f /tmp/ish-tunnel.log
```

### Check Tunnel Status
```bash
# Check if tunnel process is running
ps aux | grep ssh | grep serveo

# Check connection
curl -I https://your-subdomain.serveo.net
```

### Monitor Traffic
```bash
# Install httptoolkit for detailed traffic inspection
# Or use browser dev tools on the public URL
```

---

## Running in Background

### Using screen
```bash
# Start screen session
screen -S ish-tunnel

# Run tunnel
./start-tunnel.sh

# Detach: Ctrl+A then D
# Reattach: screen -r ish-tunnel
```

### Using tmux
```bash
# Start tmux session
tmux new -s ish-tunnel

# Run tunnel
./start-tunnel.sh

# Detach: Ctrl+B then D
# Reattach: tmux attach -t ish-tunnel
```

### Using nohup
```bash
nohup ./start-tunnel.sh > /tmp/tunnel-output.log 2>&1 &
```

---

## Testing Your Tunnel

### 1. Basic HTTP Test
```bash
curl https://your-subdomain.serveo.net
```

### 2. WebSocket Test
```javascript
// In browser console
const ws = new WebSocket('wss://your-subdomain.serveo.net');
ws.onopen = () => console.log('Connected!');
ws.onmessage = (msg) => console.log('Message:', msg.data);
```

### 3. Full Application Test
1. Open the public URL in a browser
2. Test all features (voice, text, interactions)
3. Monitor logs for any errors

---

## FAQ

**Q: How long does the tunnel stay active?**
A: Indefinitely, until you stop it (Ctrl+C) or connection drops. The auto-reconnect script handles reconnections.

**Q: Can I use a custom domain?**
A: Not with these free services. For custom domains, you need a VPS or commercial tunneling service.

**Q: Is it safe for production?**
A: No, these are for development/testing only. For production, use proper hosting.

**Q: Can multiple people use the same tunnel?**
A: Yes! The public URL can be shared with anyone.

**Q: What if the subdomain changes?**
A: With random subdomains, you'll get a new URL each time. For persistent URLs, consider:
- Using a custom subdomain (when available)
- Setting up a VPS with a fixed domain
- Using a commercial service like ngrok with a paid plan

**Q: Do these services log my traffic?**
A: Check each service's privacy policy. Assume all traffic is visible to the tunnel provider.

---

## Next Steps

1. **Start the tunnel:** `./start-tunnel.sh`
2. **Get your public URL** from the output
3. **Share the URL** with testers or use it yourself
4. **Monitor logs** for any issues
5. **Stop when done** with Ctrl+C

For commercial use or custom domains, consider:
- ngrok (paid plans for custom domains)
- Cloudflare Tunnel (free with Cloudflare account)
- Deploy to a VPS (DigitalOcean, AWS, etc.)

---

## Support

**Issues with the scripts:**
- Check logs: `/tmp/ish-tunnel.log`
- Verify service is running: `netstat -tlnp | grep 3002`
- Test local connection: `curl http://localhost:3002`

**Issues with tunnel services:**
- serveo.net: Check their status page or try alternatives
- localhost.run: Check their website for updates
- bore.pub: Ensure bore-cli is installed correctly

**Need help?**
Create an issue or contact support with:
- Error messages from logs
- Your configuration (port, subdomain, etc.)
- Steps to reproduce the issue
