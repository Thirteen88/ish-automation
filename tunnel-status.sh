#!/bin/bash

# Tunnel Status Checker
# Displays current tunnel status and URL

echo "========================================="
echo "ISH Automation Tunnel Status"
echo "========================================="
echo ""

PORT="${PORT:-3002}"

# Check if service is running
echo -n "Service Status (port $PORT): "
if nc -z localhost $PORT 2>/dev/null; then
    echo "✓ RUNNING"
else
    echo "✗ NOT RUNNING"
    echo "  Start with: PORT=3002 node aria-mobile-server.js"
    exit 1
fi

echo ""

# Check for active SSH tunnels
echo "Active Tunnels:"
echo "───────────────────────────────────────"

TUNNEL_COUNT=0

# Check serveo tunnels
SERVEO_PIDS=$(pgrep -f "ssh.*serveo.net" 2>/dev/null)
if [ -n "$SERVEO_PIDS" ]; then
    for PID in $SERVEO_PIDS; do
        TUNNEL_COUNT=$((TUNNEL_COUNT + 1))
        echo "✓ Serveo.net (PID: $PID)"

        # Try to get URL from recent logs
        if [ -f /tmp/serveo-output.log ]; then
            URL=$(grep -o 'https://[a-z0-9.-]*\.serveo\.net' /tmp/serveo-output.log | tail -1)
            if [ -n "$URL" ]; then
                echo "  URL: $URL"

                # Test if URL is accessible
                if curl -s -o /dev/null -w "%{http_code}" "$URL" | grep -q "200"; then
                    echo "  Status: ✓ ACCESSIBLE"
                else
                    echo "  Status: ⚠ UNREACHABLE"
                fi
            fi
        fi
    done
fi

# Check localhost.run tunnels
LOCALHOST_RUN_PIDS=$(pgrep -f "ssh.*localhost.run" 2>/dev/null)
if [ -n "$LOCALHOST_RUN_PIDS" ]; then
    for PID in $LOCALHOST_RUN_PIDS; do
        TUNNEL_COUNT=$((TUNNEL_COUNT + 1))
        echo "✓ localhost.run (PID: $PID)"
    done
fi

# Check bore tunnels
BORE_PIDS=$(pgrep -f "bore.*local.*$PORT" 2>/dev/null)
if [ -n "$BORE_PIDS" ]; then
    for PID in $BORE_PIDS; do
        TUNNEL_COUNT=$((TUNNEL_COUNT + 1))
        echo "✓ bore.pub (PID: $PID)"
    done
fi

if [ $TUNNEL_COUNT -eq 0 ]; then
    echo "✗ No active tunnels found"
    echo ""
    echo "Start a tunnel with:"
    echo "  ./start-tunnel.sh"
fi

echo ""
echo "========================================="
echo "Total Active Tunnels: $TUNNEL_COUNT"
echo "========================================="

# Show logs location
if [ -f /tmp/ish-tunnel.log ]; then
    echo ""
    echo "Recent log entries:"
    echo "───────────────────────────────────────"
    tail -5 /tmp/ish-tunnel.log 2>/dev/null || echo "No recent logs"
fi

echo ""
echo "Commands:"
echo "  View logs: tail -f /tmp/ish-tunnel.log"
echo "  Kill tunnels: pkill -f 'ssh.*serveo'"
echo "  Start new: ./start-tunnel.sh"
echo ""
