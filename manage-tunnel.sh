#!/bin/bash

# ISH Automation Tunnel Manager - Master Control Script
# One script to rule them all!

set -e

VERSION="1.0.0"

show_banner() {
    cat << "EOF"
╔══════════════════════════════════════════════════════════════╗
║                                                              ║
║           ISH AUTOMATION TUNNEL MANAGER v1.0.0               ║
║              No Signup Required Tunneling                    ║
║                                                              ║
╚══════════════════════════════════════════════════════════════╝
EOF
    echo ""
}

show_help() {
    show_banner
    cat << EOF
USAGE:
  ./manage-tunnel.sh [command] [options]

COMMANDS:
  start       Start a new tunnel (default)
  stop        Stop all active tunnels
  restart     Restart the tunnel
  status      Show tunnel status
  test        Run pre-flight checks
  logs        Show tunnel logs
  url         Show current public URL
  help        Show this help message

OPTIONS:
  --port PORT         Port to tunnel (default: 3002)
  --subdomain NAME    Custom subdomain (may not always work)
  --method METHOD     Tunnel method: serveo, localhost.run, bore
  --background        Run in background (screen session)

EXAMPLES:
  ./manage-tunnel.sh start
    Start tunnel on default port 3002

  ./manage-tunnel.sh start --port 3000
    Start tunnel on port 3000

  ./manage-tunnel.sh start --subdomain myapp
    Start tunnel with custom subdomain

  ./manage-tunnel.sh start --background
    Start tunnel in background (screen session)

  ./manage-tunnel.sh status
    Check tunnel status

  ./manage-tunnel.sh logs
    View tunnel logs

  ./manage-tunnel.sh url
    Show current public URL

  ./manage-tunnel.sh stop
    Stop all tunnels

FILES:
  CURRENT-TUNNEL.txt  - Current tunnel information
  TUNNELING.md        - Complete documentation
  QUICK-START.txt     - Quick reference card
  /tmp/ish-tunnel.log - Tunnel logs

EOF
}

# Parse arguments
COMMAND="${1:-start}"
PORT="3002"
SUBDOMAIN=""
METHOD="serveo"
BACKGROUND=false

shift || true
while [[ $# -gt 0 ]]; do
    case $1 in
        --port)
            PORT="$2"
            shift 2
            ;;
        --subdomain)
            SUBDOMAIN="$2"
            shift 2
            ;;
        --method)
            METHOD="$2"
            shift 2
            ;;
        --background)
            BACKGROUND=true
            shift
            ;;
        *)
            echo "Unknown option: $1"
            show_help
            exit 1
            ;;
    esac
done

# Command handlers
cmd_start() {
    show_banner
    echo "Starting tunnel..."
    echo ""

    # Run pre-flight checks
    if ! ./test-tunnel.sh > /dev/null 2>&1; then
        echo "Pre-flight checks failed. Running diagnostics..."
        ./test-tunnel.sh
        exit 1
    fi

    if [ "$BACKGROUND" = true ]; then
        echo "Starting tunnel in background (screen session)..."

        # Check if screen is installed
        if ! command -v screen &> /dev/null; then
            echo "ERROR: screen is not installed"
            echo "Install with: sudo apt install screen"
            exit 1
        fi

        # Kill existing screen session if it exists
        screen -S ish-tunnel -X quit 2>/dev/null || true

        # Start new screen session
        if [ -n "$SUBDOMAIN" ]; then
            screen -dmS ish-tunnel bash -c "SUBDOMAIN=$SUBDOMAIN PORT=$PORT ./start-tunnel.sh"
        else
            screen -dmS ish-tunnel bash -c "PORT=$PORT ./start-tunnel.sh"
        fi

        echo "Waiting for tunnel to establish..."
        sleep 3

        # Show status
        ./tunnel-status.sh
        echo ""
        echo "Tunnel running in background (screen session: ish-tunnel)"
        echo "  Reattach: screen -r ish-tunnel"
        echo "  Detach: Ctrl+A then D"
    else
        # Run in foreground
        if [ -n "$SUBDOMAIN" ]; then
            SUBDOMAIN="$SUBDOMAIN" PORT="$PORT" ./start-tunnel.sh
        else
            PORT="$PORT" ./start-tunnel.sh
        fi
    fi
}

cmd_stop() {
    show_banner
    echo "Stopping all tunnels..."
    echo ""

    # Kill SSH tunnels
    pkill -f "ssh.*serveo" 2>/dev/null && echo "✓ Stopped serveo tunnels" || echo "  No serveo tunnels running"
    pkill -f "ssh.*localhost.run" 2>/dev/null && echo "✓ Stopped localhost.run tunnels" || echo "  No localhost.run tunnels running"
    pkill -f "bore.*local" 2>/dev/null && echo "✓ Stopped bore tunnels" || echo "  No bore tunnels running"

    # Kill screen session
    screen -S ish-tunnel -X quit 2>/dev/null && echo "✓ Stopped background session" || echo "  No background session running"

    echo ""
    echo "All tunnels stopped"
}

cmd_restart() {
    show_banner
    echo "Restarting tunnel..."
    echo ""

    cmd_stop
    sleep 2
    cmd_start
}

cmd_status() {
    ./tunnel-status.sh
}

cmd_test() {
    ./test-tunnel.sh
}

cmd_logs() {
    if [ -f /tmp/ish-tunnel.log ]; then
        echo "Showing tunnel logs (Ctrl+C to exit)..."
        echo "========================================="
        tail -f /tmp/ish-tunnel.log
    else
        echo "No log file found at /tmp/ish-tunnel.log"
        exit 1
    fi
}

cmd_url() {
    show_banner

    # Try to get URL from log
    if [ -f /tmp/serveo-output.log ]; then
        URL=$(grep -o 'https://[a-z0-9.-]*\.serveo\.net' /tmp/serveo-output.log | tail -1)
        if [ -n "$URL" ]; then
            echo "Current Public URL:"
            echo "══════════════════════════════════════"
            echo ""
            echo "  $URL"
            echo ""
            echo "══════════════════════════════════════"

            # Test if accessible
            if curl -s -o /dev/null -w "%{http_code}" "$URL" | grep -q "200"; then
                echo "Status: ✓ ACCESSIBLE"
            else
                echo "Status: ⚠ UNREACHABLE"
            fi
            echo ""
            return
        fi
    fi

    echo "No active tunnel URL found"
    echo "Start a tunnel with: ./manage-tunnel.sh start"
    echo ""
}

# Execute command
case "$COMMAND" in
    start)
        cmd_start
        ;;
    stop)
        cmd_stop
        ;;
    restart)
        cmd_restart
        ;;
    status)
        cmd_status
        ;;
    test)
        cmd_test
        ;;
    logs)
        cmd_logs
        ;;
    url)
        cmd_url
        ;;
    help|--help|-h)
        show_help
        ;;
    *)
        echo "Unknown command: $COMMAND"
        echo ""
        show_help
        exit 1
        ;;
esac
