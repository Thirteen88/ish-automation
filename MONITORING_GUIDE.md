# 🔍 88 3ee AI Platform - Complete Monitoring Guide

## 📊 **How to Track What's Being Used When and For What**

This guide shows you exactly how to monitor and track every component, request, and agent in your 88 3ee AI platform.

---

## 🎯 **REAL-TIME MONITORING DASHBOARD**

### **🖥️ CLI Dashboard - Primary Monitoring Tool**

```bash
# Launch the real-time monitoring dashboard
cd cli_dashboard
python3 main.py --simulate-data --refresh-rate 3

# For faster updates (every 1 second)
python3 main.py --simulate-data --refresh-rate 1

# For production monitoring (slower but stable)
python3 main.py --refresh-rate 5
```

**What you'll see:**
- **📊 AI Instances**: Which providers are active and their current load
- **⚡ Performance**: Real-time response times and success rates
- **🖥️ System Status**: Health of all services
- **🚨 Alerts**: Any issues or warnings
- **🤖 External Agents**: Status of spawned agents

---

## 🌐 **API ENDPOINT MONITORING**

### **📡 Health and Status Checks**

```bash
# Main platform health
curl -H "X-API-Key: ish-chat-secure-key-2024" http://localhost:8000/health

# Instance manager status
curl -H "X-API-Key: ish-chat-secure-key-2024" http://localhost:8001/health

# Android device status
curl -H "X-API-Key: ish-chat-secure-key-2024" http://localhost:8000/api/android/status
```

### **📈 Usage Tracking**

```bash
# Check which AI provider was used for a specific request
curl -H "X-API-Key: ish-chat-secure-key-2024" \
     -X POST http://localhost:8000/api/relay \
     -H "Content-Type: application/json" \
     -d '{"sender": "user", "message": "Test request tracking", "timestamp": "2025-11-04T15:50:00Z"}'

# The response will include:
# - message_id: Unique identifier
# - processed_at: When it was processed
# - provider_used: Which AI provider handled it
# - response_time: How long it took
```

---

## 📝 **LOG MONITORING**

### **📋 Application Logs**

```bash
# Monitor main application logs in real-time
tail -f deployment.log

# Check specific service logs
tail -f logs/883ee-ai.log
tail -f logs/instance-manager.log
tail -f logs/android-automation.log
```

### **🔍 Request Tracking**

```bash
# Monitor all API requests
grep "POST\|GET" deployment.log | tail -20

# Track specific message IDs
grep "msg_" deployment.log | tail -10

# Monitor AI provider usage
grep -E "(ZAI|OpenAI|Claude|Perplexity)" deployment.log | tail -10
```

---

## 🤖 **AGENT MONITORING**

### **🎭 Claude Orchestrator Agent Tracking**

```bash
# Check orchestrator status
cd /home/gary/claude-orchestrator
python3 cli.py list

# Monitor active agents
ps aux | grep "orchestrator\|agent" | grep -v grep

# Check agent output files
ls -la /tmp/883ee-agent-results.json
cat /tmp/883ee-agent-results.json | jq .
```

### **📊 Agent Performance Tracking**

```bash
# Real-time agent monitoring
watch -n 2 'ps aux | grep -E "(python|agent)" | head -10'

# Check resource usage by agents
top -p $(pgrep -f "orchestrator")
```

---

## 🔍 **QUICK REFERENCE - MOST USEFUL COMMANDS**

```bash
# 1. Quick health check
curl -H "X-API-Key: ish-chat-secure-key-2024" http://localhost:8000/health

# 2. Launch dashboard
cd cli_dashboard && python3 main.py --simulate-data --refresh-rate 3

# 3. Check recent activity
tail -10 deployment.log

# 4. Monitor agents
ps aux | grep orchestrator

# 5. Android status
curl -H "X-API-Key: ish-chat-secure-key-2024" http://localhost:8000/api/android/status

# 6. Docker services
docker compose -f docker-infrastructure/docker-compose.yml ps
```

---

**🎉 With this guide, you can track exactly what's being used, when, and for what purpose across your entire 88 3ee AI platform!**

*Last Updated: November 4, 2025*
