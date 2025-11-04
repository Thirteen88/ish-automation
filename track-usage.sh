#!/bin/bash

# 🔍 88 3ee AI Usage Tracking Script
# Run this script to see exactly what's being used when and for what purpose

echo "🚀 88 3ee AI PLATFORM - REAL-TIME USAGE TRACKER"
echo "================================================="
echo ""

# Function to check API status
check_api_status() {
    echo "📊 PLATFORM STATUS:"
    local status=$(curl -s -H "X-API-Key: ish-chat-secure-key-2024" http://localhost:8000/health 2>/dev/null)
    if [[ $? -eq 0 ]]; then
        echo "   ✅ Main API: $(echo $status | jq -r '.status // "Unknown"')"
    else
        echo "   ❌ Main API: DOWN"
    fi
}

# Function to track active processes
track_processes() {
    echo ""
    echo "🤖 ACTIVE PROCESSES:"

    # Main API processes
    local api_count=$(ps aux | grep -E "(uvicorn|gunicorn).*main" | grep -v grep | wc -l)
    echo "   🌐 API Server: $api_count processes"

    # Instance Manager
    local instance_count=$(ps aux | grep "instance_manager" | grep -v grep | wc -l)
    echo "   📋 Instance Manager: $instance_count processes"

    # CLI Dashboard
    local dashboard_count=$(ps aux | grep "cli_dashboard.*main.py" | grep -v grep | wc -l)
    echo "   📊 CLI Dashboard: $dashboard_count processes"

    # Claude Orchestrator
    local orchestrator_count=$(ps aux | grep "orchestrator" | grep -v grep | wc -l)
    echo "   🎭 Orchestrator: $orchestrator_count processes"
}

# Function to show recent activity
show_recent_activity() {
    echo ""
    echo "📈 RECENT ACTIVITY (Last 10 minutes):"

    if [[ -f "deployment.log" ]]; then
        # Show recent message IDs
        echo "   📨 Recent Messages:"
        grep "$(date '+%Y-%m-%d %H:' | sed 's/.$//' | grep -E '[0-5][0-9]')" deployment.log | grep "msg_" | tail -3 | while read line; do
            echo "      $line"
        done

        # Show API calls
        echo "   🌐 API Calls:"
        grep "$(date '+%Y-%m-%d %H:' | sed 's/.$//' | grep -E '[0-5][0-9]')" deployment.log | grep -E "(POST|GET)" | tail -2 | while read line; do
            echo "      $line"
        done
    else
        echo "   📝 No deployment log found"
    fi
}

# Function to show system resources
show_resources() {
    echo ""
    echo "💻 SYSTEM RESOURCES:"
    echo "   🖥️  CPU Usage: $(top -bn1 | grep "Cpu(s)" | awk '{print $2}' | cut -d'%' -f1)"
    echo "   🧠 Memory Usage: $(free -h | awk 'NR==2{printf "%.1f%%\n", $3*100/$2}')"
    echo "   💾 Disk Usage: $(df -h . | awk 'NR==2{print $5}')"
}

# Function to show port usage
show_ports() {
    echo ""
    echo "🔌 ACTIVE PORTS:"
    local ports=(8000 8001 3000 9090 5435 6380)
    for port in "${ports[@]}"; do
        if netstat -tuln 2>/dev/null | grep -q ":$port "; then
            echo "   ✅ Port $port: ACTIVE"
        else
            echo "   ❌ Port $port: Inactive"
        fi
    done
}

# Function to show Docker services
show_docker() {
    echo ""
    echo "🐳 DOCKER SERVICES:"
    if command -v docker-compose &> /dev/null; then
        if [[ -f "docker-infrastructure/docker-compose.yml" ]]; then
            docker compose -f docker-infrastructure/docker-compose.yml ps 2>/dev/null | grep -E "(Up|healthy)" | wc -l | xargs echo "   Running services:"
        else
            echo "   📁 No docker-compose.yml found"
        fi
    else
        echo "   ❌ Docker not available"
    fi
}

# Function to show Android status
show_android() {
    echo ""
    echo "📱 ANDROID STATUS:"
    local android_status=$(curl -s -H "X-API-Key: ish-chat-secure-key-2024" http://localhost:8000/api/android/status 2>/dev/null)
    if [[ $? -eq 0 ]]; then
        local device_status=$(echo $android_status | jq -r '.device.status // "Unknown"')
        local device_id=$(echo $android_status | jq -r '.device.device_id // "Unknown"')
        echo "   📱 Device: $device_status ($device_id)"
    else
        echo "   ❌ Android service: Not responding"
    fi
}

# Function to show quick commands
show_commands() {
    echo ""
    echo "⚡ QUICK MONITORING COMMANDS:"
    echo "   🖥️  Launch Dashboard: cd cli_dashboard && python3 main.py --simulate-data"
    echo "   📊 Check Health: curl -H 'X-API-Key: ish-chat-secure-key-2024' http://localhost:8000/health"
    echo "   📱 Android Status: curl -H 'X-API-Key: ish-chat-secure-key-2024' http://localhost:8000/api/android/status"
    echo "   📝 View Logs: tail -f deployment.log"
    echo "   🐳 Docker Status: docker compose -f docker-infrastructure/docker-compose.yml ps"
}

# Main execution
main() {
    case "${1:-all}" in
        "api")
            check_api_status
            ;;
        "processes")
            track_processes
            ;;
        "activity")
            show_recent_activity
            ;;
        "resources")
            show_resources
            ;;
        "ports")
            show_ports
            ;;
        "docker")
            show_docker
            ;;
        "android")
            show_android
            ;;
        "help")
            echo "Usage: $0 [api|processes|activity|resources|ports|docker|android|all]"
            echo "  api      - Show API status"
            echo "  processes - Show active processes"
            echo "  activity - Show recent activity"
            echo "  resources - Show system resources"
            echo "  ports    - Show active ports"
            echo "  docker   - Show Docker services"
            echo "  android  - Show Android status"
            echo "  all      - Show everything (default)"
            ;;
        *)
            check_api_status
            track_processes
            show_recent_activity
            show_resources
            show_ports
            show_docker
            show_android
            show_commands
            ;;
    esac
}

# Run main function with all arguments
main "$@"