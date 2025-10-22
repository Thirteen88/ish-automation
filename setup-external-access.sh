#!/bin/bash

# ARIA External Access Setup Script
# Makes ARIA accessible from anywhere securely

echo "═══════════════════════════════════════════════════════════"
echo "           ARIA External Access Setup"
echo "═══════════════════════════════════════════════════════════"
echo ""

# Color codes
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}Choose your external access method:${NC}"
echo ""
echo "1. 🔐 Ngrok (Easy & Free) - Recommended for testing"
echo "2. 🌐 Cloudflare Tunnel (Free) - Best for permanent access"
echo "3. ☁️  Deploy to Cloud (Paid) - Most reliable"
echo "4. 🏠 Port Forwarding (Advanced) - Use your own IP"
echo "5. 🔒 Tailscale VPN (Free) - Most secure"
echo ""

read -p "Choose option (1-5): " choice

case $choice in
    1)
        echo -e "\n${YELLOW}Setting up Ngrok...${NC}"

        # Check if ngrok is installed
        if ! command -v ngrok &> /dev/null; then
            echo "Installing ngrok..."

            # Download ngrok
            wget https://bin.equinox.io/c/bNyj1mQVY4c/ngrok-v3-stable-linux-amd64.tgz
            tar -xzf ngrok-v3-stable-linux-amd64.tgz
            sudo mv ngrok /usr/local/bin/
            rm ngrok-v3-stable-linux-amd64.tgz
        fi

        echo -e "${GREEN}Ngrok installed!${NC}"
        echo ""
        echo "To start ARIA with external access:"
        echo -e "${YELLOW}ngrok http 3002${NC}"
        echo ""
        echo "You'll get a URL like: https://abc123.ngrok.io"
        echo "Share this URL to access ARIA from anywhere!"

        # Create ngrok config
        cat > ~/ish-automation/ngrok.yml << 'EOF'
version: 2
authtoken: YOUR_AUTH_TOKEN
tunnels:
  aria:
    proto: http
    addr: 3002
    inspect: false
    bind_tls: true
EOF

        echo -e "\n${BLUE}Get free ngrok auth token at: https://ngrok.com${NC}"
        ;;

    2)
        echo -e "\n${YELLOW}Setting up Cloudflare Tunnel...${NC}"

        # Install cloudflared
        echo "Installing Cloudflare Tunnel..."

        # Download and install cloudflared
        wget -q https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64.deb
        sudo dpkg -i cloudflared-linux-amd64.deb
        rm cloudflared-linux-amd64.deb

        echo -e "${GREEN}Cloudflared installed!${NC}"
        echo ""
        echo "Setup steps:"
        echo "1. Run: cloudflared tunnel login"
        echo "2. Run: cloudflared tunnel create aria"
        echo "3. Run: cloudflared tunnel route dns aria aria.yourdomain.com"
        echo "4. Start: cloudflared tunnel run --url localhost:3002 aria"

        # Create config file
        cat > ~/.cloudflared/config.yml << 'EOF'
tunnel: aria
credentials-file: /home/gary/.cloudflared/[TUNNEL_ID].json

ingress:
  - hostname: aria.yourdomain.com
    service: http://localhost:3002
  - service: http_status:404
EOF
        ;;

    3)
        echo -e "\n${YELLOW}Cloud Deployment Options...${NC}"

        # Create deployment configs for various platforms

        # Render.com deployment
        cat > ~/ish-automation/render.yaml << 'EOF'
services:
  - type: web
    name: aria-assistant
    env: node
    repo: https://github.com/yourusername/aria
    buildCommand: npm install
    startCommand: node aria-mobile-server.js
    envVars:
      - key: PORT
        value: 3002
      - key: NODE_ENV
        value: production
EOF

        # Heroku deployment
        cat > ~/ish-automation/heroku.yml << 'EOF'
build:
  docker:
    web: Dockerfile
run:
  web: node aria-mobile-server.js
EOF

        # Dockerfile for cloud deployment
        cat > ~/ish-automation/Dockerfile << 'EOF'
FROM node:18-alpine

WORKDIR /app

COPY package*.json ./
RUN npm ci --only=production

COPY . .

EXPOSE 3002

CMD ["node", "aria-mobile-server.js"]
EOF

        echo -e "${GREEN}Cloud deployment files created!${NC}"
        echo ""
        echo "Deploy to:"
        echo "• Render.com (Free tier): https://render.com"
        echo "• Railway.app: https://railway.app"
        echo "• Fly.io: https://fly.io"
        echo "• Heroku: https://heroku.com"
        echo "• Google Cloud Run: https://cloud.google.com/run"
        ;;

    4)
        echo -e "\n${YELLOW}Port Forwarding Setup...${NC}"

        echo "Router Configuration Required:"
        echo "1. Access your router admin (usually 192.168.1.1)"
        echo "2. Find Port Forwarding section"
        echo "3. Add rule:"
        echo "   - External Port: 3002"
        echo "   - Internal IP: 192.168.0.159"
        echo "   - Internal Port: 3002"
        echo "   - Protocol: TCP"
        echo ""
        echo "Your external IP:"
        curl -s ifconfig.me
        echo ""
        echo -e "\n${RED}⚠️  Security Warning:${NC}"
        echo "Add authentication before exposing to internet!"
        ;;

    5)
        echo -e "\n${YELLOW}Setting up Tailscale VPN...${NC}"

        # Install Tailscale
        echo "Installing Tailscale..."
        curl -fsSL https://tailscale.com/install.sh | sh

        echo -e "${GREEN}Tailscale installed!${NC}"
        echo ""
        echo "Setup steps:"
        echo "1. Run: sudo tailscale up"
        echo "2. Install Tailscale on your Pixel"
        echo "3. Connect both devices to same Tailscale network"
        echo "4. Access ARIA via Tailscale IP (100.x.x.x:3002)"
        echo ""
        echo "This is the most secure option!"
        ;;
esac

echo ""
echo "═══════════════════════════════════════════════════════════"
echo -e "${GREEN}External access setup complete!${NC}"
echo "═══════════════════════════════════════════════════════════"