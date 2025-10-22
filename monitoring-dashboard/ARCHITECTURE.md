# Monitoring Dashboard Architecture

## System Overview

```
┌─────────────────────────────────────────────────────────────────────┐
│                     AI Orchestrator Ecosystem                        │
├─────────────────────────────────────────────────────────────────────┤
│                                                                       │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────┐          │
│  │   Claude     │    │   ChatGPT    │    │   Gemini     │          │
│  │   Platform   │    │   Platform   │    │   Platform   │          │
│  └──────┬───────┘    └──────┬───────┘    └──────┬───────┘          │
│         │                    │                    │                  │
│         └────────────────────┼────────────────────┘                 │
│                              │                                       │
│                    ┌─────────▼─────────┐                            │
│                    │  AI Orchestrator  │                            │
│                    │   (Main Server)   │                            │
│                    └─────────┬─────────┘                            │
│                              │                                       │
│              ┌───────────────┼───────────────┐                      │
│              │               │               │                      │
│       ┌──────▼─────┐  ┌──────▼─────┐  ┌─────▼──────┐              │
│       │   Metrics  │  │  Platform  │  │  Resource  │              │
│       │  Reporter  │  │   Health   │  │  Monitor   │              │
│       └──────┬─────┘  └──────┬─────┘  └─────┬──────┘              │
│              │               │               │                      │
│              └───────────────┼───────────────┘                      │
│                              │                                       │
│                    ┌─────────▼─────────┐                            │
│                    │ Monitoring Server │                            │
│                    │   (Port 8000)     │                            │
│                    └─────────┬─────────┘                            │
│                              │                                       │
│              ┌───────────────┼───────────────┐                      │
│              │               │               │                      │
│       ┌──────▼─────┐  ┌──────▼─────┐  ┌─────▼──────┐              │
│       │  WebSocket │  │  REST API  │  │   Alert    │              │
│       │   Server   │  │  Endpoints │  │   System   │              │
│       └──────┬─────┘  └──────┬─────┘  └─────┬──────┘              │
│              │               │               │                      │
│              └───────────────┼───────────────┘                      │
│                              │                                       │
│                    ┌─────────▼─────────┐                            │
│                    │  Web Dashboard    │                            │
│                    │  (Browser UI)     │                            │
│                    └───────────────────┘                            │
│                                                                       │
└─────────────────────────────────────────────────────────────────────┘
```

## Component Architecture

### Frontend (Browser)

```
┌────────────────────────────────────────────────────────┐
│                   Dashboard UI (index.html)            │
├────────────────────────────────────────────────────────┤
│                                                         │
│  ┌──────────────────────────────────────────────────┐ │
│  │           Dashboard Controller (dashboard.js)     │ │
│  │  • WebSocket Management                           │ │
│  │  • UI Updates                                     │ │
│  │  • Chart Rendering                                │ │
│  │  • Theme Control                                  │ │
│  └──────────────┬────────────────┬──────────────────┘ │
│                 │                │                     │
│  ┌──────────────▼─────┐   ┌──────▼──────────────────┐ │
│  │ Metrics Collector  │   │   Alert Manager         │ │
│  │ (metrics-          │   │   (alerts.js)           │ │
│  │  collector.js)     │   │                         │ │
│  │                    │   │  • Rule Engine          │ │
│  │  • Data Storage    │   │  • Notifications        │ │
│  │  • Aggregation     │   │  • Email/Slack/Webhook  │ │
│  │  • Time Series     │   │  • Alert History        │ │
│  │  • Baselines       │   │                         │ │
│  └────────────────────┘   └─────────────────────────┘ │
│                                                         │
│  ┌──────────────────────────────────────────────────┐ │
│  │              Chart.js Visualizations              │ │
│  │  • Line Charts    • Bar Charts   • Doughnut      │ │
│  └──────────────────────────────────────────────────┘ │
│                                                         │
└────────────────────────────────────────────────────────┘
```

### Backend (Server)

```
┌────────────────────────────────────────────────────────┐
│         Monitoring Server (monitoring-server.js)       │
├────────────────────────────────────────────────────────┤
│                                                         │
│  ┌──────────────────────────────────────────────────┐ │
│  │              Express HTTP Server                  │ │
│  │  • Static File Serving                            │ │
│  │  • CORS                                           │ │
│  │  • JSON Parsing                                   │ │
│  └──────────────┬────────────────────────────────────┘ │
│                 │                                       │
│  ┌──────────────▼─────┐         ┌──────────────────┐  │
│  │  WebSocket Server  │         │   REST API       │  │
│  │  (ws://port/ws)    │         │   Routes         │  │
│  │                    │         │                  │  │
│  │  • Real-time       │         │  • GET /metrics  │  │
│  │    Updates         │         │  • POST /query   │  │
│  │  • Broadcast       │         │  • GET /health   │  │
│  │  • Client Mgmt     │         │  • GET /stats    │  │
│  └────────────────────┘         └──────────────────┘  │
│                                                         │
│  ┌──────────────────────────────────────────────────┐ │
│  │            In-Memory Metrics Store                │ │
│  │  • Current Metrics                                │ │
│  │  • Platform Data                                  │ │
│  │  • Resource Stats                                 │ │
│  └──────────────────────────────────────────────────┘ │
│                                                         │
│  ┌──────────────────────────────────────────────────┐ │
│  │         System Resource Monitor                   │ │
│  │  • CPU Usage (os.loadavg)                         │ │
│  │  • Memory Usage (os.totalmem/freemem)             │ │
│  │  • Network I/O                                    │ │
│  │  • Uptime Tracking                                │ │
│  └──────────────────────────────────────────────────┘ │
│                                                         │
└────────────────────────────────────────────────────────┘
```

## Data Flow

### Query Metrics Flow

```
┌──────────────┐
│AI Orchestrator│
│   Query      │
└──────┬───────┘
       │
       │ 1. Query Executed
       │    (platform, success, responseTime)
       │
       ▼
┌──────────────────┐
│ POST /api/       │
│   metrics/query  │
└──────┬───────────┘
       │
       │ 2. Record Metrics
       │
       ▼
┌──────────────────┐
│ Metrics Store    │
│ • Update totals  │
│ • Calculate avg  │
│ • Update platform│
└──────┬───────────┘
       │
       │ 3. Broadcast Update
       │
       ▼
┌──────────────────┐
│ WebSocket        │
│ Clients          │
└──────┬───────────┘
       │
       │ 4. Update UI
       │
       ▼
┌──────────────────┐
│ Dashboard        │
│ • Metrics Cards  │
│ • Charts         │
│ • Platform Cards │
└──────────────────┘
```

### Alert Flow

```
┌──────────────┐
│ Metrics      │
│ Update       │
└──────┬───────┘
       │
       │ 1. Evaluate Rules
       │
       ▼
┌──────────────────┐
│ Alert Manager    │
│ Rule Engine      │
└──────┬───────────┘
       │
       │ 2. Rule Triggered
       │
       ▼
┌──────────────────┐
│ Create Alert     │
│ • Title          │
│ • Message        │
│ • Severity       │
└──────┬───────────┘
       │
       ├──────┬──────┬──────┐
       │      │      │      │
       ▼      ▼      ▼      ▼
   ┌─────┐┌─────┐┌────┐┌─────┐
   │Email││Slack││Web-││Store│
   │     ││     ││hook││     │
   └─────┘└─────┘└────┘└─────┘
                         │
                         ▼
                   ┌──────────┐
                   │Dashboard │
                   │Alerts Tab│
                   └──────────┘
```

## Storage Architecture

### Browser Storage (LocalStorage)

```
orchestrator_metrics
├── timeSeries
│   ├── responseTime[]      # Last 1440 points (24h)
│   ├── errorRate[]         # Last 1440 points
│   ├── queryVolume[]       # Last 1440 points
│   ├── platformMetrics{}   # Per platform time-series
│   └── systemResources[]   # Resource history
│
├── currentMetrics
│   ├── totalQueries
│   ├── avgResponseTime
│   ├── errorRate
│   ├── platforms{}
│   └── resources{}
│
└── lastUpdated

orchestrator_alerts
├── alerts[]               # Active alerts
├── alertHistory[]         # Historical alerts
└── lastUpdated
```

### Server Storage (Memory)

```
metrics
├── totalQueries
├── successfulQueries
├── failedQueries
├── avgResponseTime
├── errorRate
├── platforms
│   ├── claude
│   │   ├── status
│   │   ├── totalQueries
│   │   ├── avgResponseTime
│   │   ├── errorRate
│   │   └── consecutiveFailures
│   ├── chatgpt
│   └── gemini
├── resources
│   ├── cpu
│   ├── memory
│   ├── network
│   ├── disk
│   └── uptime
└── startTime
```

## API Endpoints

```
Monitoring Server (Port 8000)
│
├── GET /                          → Dashboard HTML
├── GET /monitoring                → Dashboard HTML
│
├── WebSocket /ws                  → Real-time updates
│
├── API
│   ├── GET    /api/metrics        → Current metrics
│   ├── POST   /api/metrics/query  → Record query
│   ├── POST   /api/metrics/platform → Update platform
│   ├── GET    /api/platforms      → All platforms
│   ├── GET    /api/platforms/:name → Specific platform
│   ├── POST   /api/alerts/email   → Send email alert
│   ├── GET    /api/health         → Health check
│   ├── GET    /api/stats          → Statistics
│   └── POST   /api/reset          → Reset metrics (dev)
│
└── Static Files
    ├── index.html
    ├── dashboard.js
    ├── metrics-collector.js
    └── alerts.js
```

## WebSocket Protocol

```
Client → Server: Connection Request
Server → Client: Connection Accepted

Server → Client (Periodic Updates):
┌────────────────────────────┐
│ {                          │
│   type: "metrics",         │
│   data: { ... }            │
│ }                          │
└────────────────────────────┘

┌────────────────────────────┐
│ {                          │
│   type: "platform",        │
│   data: { ... }            │
│ }                          │
└────────────────────────────┘

┌────────────────────────────┐
│ {                          │
│   type: "resources",       │
│   data: { ... }            │
│ }                          │
└────────────────────────────┘

┌────────────────────────────┐
│ {                          │
│   type: "alert",           │
│   data: { ... }            │
│ }                          │
└────────────────────────────┘
```

## Alert System Architecture

```
┌─────────────────────────────────────────┐
│         Alert Manager                   │
├─────────────────────────────────────────┤
│                                          │
│  ┌────────────────────────────────────┐ │
│  │        Rule Engine                 │ │
│  │  • High Error Rate                 │ │
│  │  • Slow Response Time              │ │
│  │  • Platform Unhealthy              │ │
│  │  • High CPU/Memory                 │ │
│  │  • Consecutive Failures            │ │
│  │  • Custom Rules                    │ │
│  └──────────────┬─────────────────────┘ │
│                 │                        │
│  ┌──────────────▼─────────────────────┐ │
│  │    Alert Generation                │ │
│  │  • Create Alert Object             │ │
│  │  • Set Severity                    │ │
│  │  • Generate Message                │ │
│  │  • Apply Cooldown                  │ │
│  └──────────────┬─────────────────────┘ │
│                 │                        │
│  ┌──────────────▼─────────────────────┐ │
│  │    Notification Dispatcher         │ │
│  │                                    │ │
│  │  ┌──────┐  ┌──────┐  ┌──────────┐│ │
│  │  │Email │  │Slack │  │ Webhook  ││ │
│  │  └──────┘  └──────┘  └──────────┘│ │
│  └────────────────────────────────────┘ │
│                                          │
│  ┌────────────────────────────────────┐ │
│  │    Alert Storage                   │ │
│  │  • Active Alerts                   │ │
│  │  • Alert History                   │ │
│  │  • Acknowledgements                │ │
│  └────────────────────────────────────┘ │
│                                          │
└─────────────────────────────────────────┘
```

## Performance Optimization

### Frontend
- Chart.js rendering optimization
- Debounced UI updates
- Lazy loading of sections
- LocalStorage caching
- Efficient DOM manipulation

### Backend
- In-memory metrics storage
- WebSocket connection pooling
- Async/await for I/O operations
- Resource monitoring throttling
- Efficient data aggregation

### Network
- WebSocket for real-time updates
- Minimal HTTP requests
- Compressed responses
- CDN for static assets
- Connection keep-alive

## Scalability Considerations

```
Single Server Setup (Current)
┌─────────────────────────┐
│  Monitoring Server      │
│  • In-memory metrics    │
│  • WebSocket clients    │
│  • Alert system         │
└─────────────────────────┘

Scaled Setup (Future)
┌─────────────┐   ┌─────────────┐
│ Load        │   │ Load        │
│ Balancer    │   │ Balancer    │
└──────┬──────┘   └──────┬──────┘
       │                 │
   ┌───┴────┬────────────┴───┬────┐
   │        │                │    │
┌──▼──┐ ┌──▼──┐  ┌─────────▼──┐  │
│Web  │ │Web  │  │ WebSocket  │  │
│Server│ │Server│  │   Server   │  │
└─────┘ └─────┘  └────────────┘  │
                                  │
              ┌───────────────────▼┐
              │   Redis            │
              │   • Metrics Cache  │
              │   • Pub/Sub        │
              └───────────┬────────┘
                          │
              ┌───────────▼────────┐
              │  PostgreSQL        │
              │  • Metrics History │
              │  • Alert History   │
              └────────────────────┘
```

## Security Layers

```
┌─────────────────────────────────────┐
│      Reverse Proxy (Nginx)          │
│      • HTTPS/TLS                    │
│      • Rate Limiting                │
│      • DDoS Protection              │
└──────────────┬──────────────────────┘
               │
┌──────────────▼──────────────────────┐
│      Authentication Layer           │
│      • Basic Auth                   │
│      • JWT Tokens                   │
│      • API Keys                     │
└──────────────┬──────────────────────┘
               │
┌──────────────▼──────────────────────┐
│      Monitoring Server              │
│      • CORS                         │
│      • Input Validation             │
│      • Sanitization                 │
└─────────────────────────────────────┘
```

## Deployment Architecture

```
Production Environment

┌─────────────────────────────────────────┐
│           Internet                      │
└─────────────┬───────────────────────────┘
              │
┌─────────────▼───────────────────────────┐
│      CloudFlare / CDN                   │
│      • DDoS Protection                  │
│      • Static Asset Caching             │
└─────────────┬───────────────────────────┘
              │
┌─────────────▼───────────────────────────┐
│      Nginx Reverse Proxy                │
│      • Load Balancing                   │
│      • SSL Termination                  │
│      • Request Routing                  │
└─────────────┬───────────────────────────┘
              │
    ┌─────────┼─────────┐
    │                   │
┌───▼────────┐   ┌──────▼──────┐
│ Monitoring │   │ Orchestrator│
│ Server     │   │ Server      │
│ (Port 8000)│   │ (Port 3000) │
└────────────┘   └─────────────┘
```
