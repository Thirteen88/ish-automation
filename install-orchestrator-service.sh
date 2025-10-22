#!/bin/bash

# Installation script for Orchestrator API Service
# Run with: sudo bash install-orchestrator-service.sh

echo "🚀 Installing Orchestrator API Service..."

# Create logs directory
mkdir -p /home/gary/ish-automation/logs
chown gary:gary /home/gary/ish-automation/logs

# Copy service file
echo "📋 Installing systemd service file..."
cat > /etc/systemd/system/orchestrator-api.service << 'EOF'
[Unit]
Description=AI Orchestrator API Service
After=network.target

[Service]
Type=simple
User=gary
WorkingDirectory=/home/gary/ish-automation
Environment="NODE_ENV=production"
Environment="PORT=8765"
Environment="HEADLESS=true"
ExecStart=/usr/bin/node /home/gary/ish-automation/orchestrator-api-service.js
Restart=always
RestartSec=10
StandardOutput=append:/home/gary/ish-automation/logs/orchestrator-api.log
StandardError=append:/home/gary/ish-automation/logs/orchestrator-api-error.log

# Security hardening
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=strict
ProtectHome=read-only
ReadWritePaths=/home/gary/ish-automation

[Install]
WantedBy=multi-user.target
EOF

# Reload systemd
echo "🔄 Reloading systemd daemon..."
systemctl daemon-reload

# Enable service
echo "✅ Enabling service to start on boot..."
systemctl enable orchestrator-api.service

# Start service
echo "▶️  Starting service..."
systemctl start orchestrator-api.service

# Wait a moment
sleep 3

# Check status
echo ""
echo "📊 Service status:"
systemctl status orchestrator-api.service --no-pager

echo ""
echo "✅ Installation complete!"
echo ""
echo "📋 Useful commands:"
echo "   sudo systemctl start orchestrator-api    # Start the service"
echo "   sudo systemctl stop orchestrator-api     # Stop the service"
echo "   sudo systemctl restart orchestrator-api  # Restart the service"
echo "   sudo systemctl status orchestrator-api   # Check service status"
echo "   sudo journalctl -u orchestrator-api -f   # View live logs"
echo ""
echo "🌐 API will be available at: http://localhost:8765"
echo ""
echo "📝 Test with:"
echo "   curl http://localhost:8765/health"
echo ""
