# ISH Chat Comprehensive Monitoring Guide

## Overview

This guide provides comprehensive documentation for the ISH Chat monitoring system, which includes Prometheus metrics collection, Grafana visualization, AlertManager notification system, and business KPI tracking.

## Architecture

### Monitoring Stack Components

```
┌─────────────────┐    ┌──────────────────┐    ┌─────────────────┐
│   ISH Chat      │    │   Prometheus     │    │   AlertManager  │
│   Applications  │───▶│   Collection     │───▶│   Notifications │
│   (Metrics)     │    │   & Storage      │    │   & Routing      │
└─────────────────┘    └──────────────────┘    └─────────────────┘
         │                       │                       │
         │                       ▼                       ▼
         │              ┌─────────────────┐    ┌─────────────────┐
         │              │     Grafana      │    │   Slack/Email   │
         └──────────────│   Visualization │    │   Notifications │
                        │   & Dashboards  │    │                 │
                        └─────────────────┘    └─────────────────┘
```

### Key Components

1. **Prometheus**: Metrics collection and storage
2. **Grafana**: Data visualization and dashboards
3. **AlertManager**: Alert routing and notifications
4. **Node Exporter**: System metrics collection
5. **Custom Exporters**: Application-specific metrics
6. **Loki/Promtail**: Log aggregation (optional)
7. **Thanos**: Long-term storage (optional)

## Quick Start

### Prerequisites

- Docker 20.10+ and Docker Compose
- At least 4GB RAM and 5GB disk space
- Network access to ISH Chat applications
- SMTP server for email notifications (optional)

### Deployment

1. **Clone and Setup**
   ```bash
   cd /home/gary/multi-model-orchestrator/ish-chat-backend
   chmod +x scripts/monitoring/deploy-monitoring.sh
   ```

2. **Deploy Monitoring Stack**
   ```bash
   ./scripts/monitoring/deploy-monitoring.sh deploy
   ```

3. **Access Dashboards**
   - Grafana: http://localhost:3000 (admin/admin123)
   - Prometheus: http://localhost:9090
   - AlertManager: http://localhost:9093

### Management Commands

```bash
# Stop monitoring stack
./scripts/monitoring/deploy-monitoring.sh stop

# Restart services
./scripts/monitoring/deploy-monitoring.sh restart

# View logs
./scripts/monitoring/deploy-monitoring.sh logs [service_name]

# Check status
./scripts/monitoring/deploy-monitoring.sh status

# Clean up everything
./scripts/monitoring/deploy-monitoring.sh cleanup
```

## Configuration

### Prometheus Configuration

**Location**: `monitoring/prometheus/prometheus.yml`

Key settings:
- **Scrape Interval**: 15 seconds for application metrics
- **Retention**: 15 days or 10GB
- **Evaluation Interval**: 15 seconds for alerting rules

#### Service Discovery

The Prometheus configuration includes multiple job types:

1. **ISH Chat Services**
   ```yaml
   - job_name: 'ish-chat-instance-manager'
     static_configs:
       - targets: ['localhost:9090']
   ```

2. **System Metrics**
   ```yaml
   - job_name: 'node-exporter'
     static_configs:
       - targets: ['localhost:9100']
   ```

3. **Blackbox Monitoring**
   ```yaml
   - job_name: 'blackbox-http'
     metrics_path: /probe
     static_configs:
       - targets:
         - http://localhost:8000/health
   ```

### AlertManager Configuration

**Location**: `monitoring/alertmanager/alertmanager.yml`

#### Routing Rules

Alerts are routed based on severity and service:

- **Critical Alerts**: Immediate notification to on-call teams
- **Warning Alerts**: Standard notification to relevant teams
- **Info Alerts**: Aggregated notifications
- **Business KPI Alerts**: Product and business teams

#### Notification Channels

1. **Email Notifications**
   - Configured for all severity levels
   - Different recipients based on alert type
   - HTML formatting with runbook links

2. **Slack Integration**
   - Real-time notifications
   - Color-coded by severity
   - Channel-based routing

3. **Inhibition Rules**
   - Prevent alert spam during major outages
   - Service-level inhibition patterns

### Grafana Configuration

#### Data Sources

1. **Prometheus**: Primary metrics source
2. **Loki**: Log aggregation (if enabled)
3. **Multiple Prometheus instances** for different services

#### Dashboards

1. **System Overview**: High-level system health
2. **AI Provider Performance**: Detailed provider metrics
3. **Instance Health**: Instance availability and performance
4. **Business KPIs**: Business metrics and trends
5. **SLO Monitoring**: Service level objectives

## Metrics

### Core Application Metrics

#### Request Metrics
- `ish_chat_requests_total`: Total requests processed
- `ish_chat_request_duration_seconds`: Request latency histograms
- Labels: `provider_type`, `model_name`, `instance_id`, `status`, `user_type`, `feature`

#### Instance Management
- `ish_chat_instances_total`: Total registered instances
- `ish_chat_instances_healthy`: Number of healthy instances
- Labels: `provider_type`, `status`, `region`

#### Load Balancing
- `ish_chat_load_balancer_selections_total`: Load balancer selections
- `ish_chat_load_balancer_failovers_total`: Failover events
- Labels: `strategy`, `provider_type`, `model_name`, `reason`

### Performance Metrics

#### Response Times
- Histograms with configurable buckets
- Percentiles: 50th, 95th, 99th
- Per-provider and per-model breakdowns

#### Error Rates
- Success/error rate calculations
- Categorized by error type
- Time-window analysis

#### Resource Usage
- CPU, memory, disk utilization
- Network traffic patterns
- Container resource usage

### Business KPI Metrics

#### User Engagement
- `ish_chat_user_requests_total`: User request counts
- `ish_chat_user_session_duration_seconds`: Session lengths
- `ish_chat_new_users_total`: New user acquisition

#### Quality Metrics
- `ish_chat_user_satisfaction_score`: Satisfaction ratings
- `ish_chat_response_quality_score`: Response quality
- `ish_chat_content_moderation_alerts_total`: Content issues

#### Cost Metrics
- `ish_chat_cost_estimate_dollars`: Cost tracking
- `ish_chat_tokens_used_total`: Token consumption
- `ish_chat_api_quota_used`: API quota utilization

### SLO/SLI Metrics

#### Service Level Objectives
- `ish_chat_slo_compliance`: SLO compliance percentages
- `ish_chat_slo_budget_consumed`: Error budget consumption
- Labels: `slo_name`, `service`, `time_window`

#### Service Level Indicators
- `ish_chat_sli_availability`: Availability measurements
- `ish_chat_sli_latency_seconds`: Latency measurements
- `ish_chat_sli_error_rate`: Error rate measurements

## Alerting

### Alert Rules

#### System Health Alerts

**Critical Alerts**:
- Service down (Instance Manager, Router, Load Balancer)
- No healthy instances available
- Database or Redis connectivity issues
- System resource exhaustion

**Warning Alerts**:
- High response times
- Increased error rates
- Resource utilization thresholds
- Performance degradation

#### Business Alerts

**Cost Alerts**:
- Daily budget exceeded
- Unexpected cost spikes
- High cost per request

**User Experience Alerts**:
- Low user satisfaction scores
- High content moderation alerts
- User activity drops

### Alert Severity Levels

1. **Critical**: Immediate attention required
   - Service outages
   - Security incidents
   - Major performance issues

2. **Warning**: Attention needed soon
   - Performance degradation
   - Resource utilization warnings
   - Cost threshold breaches

3. **Info**: FYI notifications
   - System state changes
   - Capacity planning information
   - Performance trends

### Notification Channels

#### Email Configuration

Edit `monitoring/alertmanager/alertmanager.yml`:

```yaml
global:
  smtp_smarthost: 'localhost:587'
  smtp_from: 'alerts@ish-chat.local'
  smtp_auth_username: 'alerts@ish-chat.local'
  smtp_auth_password: 'your-smtp-password'
```

#### Slack Integration

1. Create Slack webhook URL
2. Update AlertManager configuration:
```yaml
slack_configs:
  - api_url: 'https://hooks.slack.com/services/YOUR/SLACK/WEBHOOK'
    channel: '#alerts-critical'
    title: '🚨 Critical Alert: {{ .GroupLabels.alertname }}'
```

## Business Intelligence

### KPI Tracking

#### User Metrics
- **Active Users**: Daily/weekly/monthly active users
- **Retention Rates**: 7-day, 30-day retention
- **Churn Analysis**: User churn rates and reasons
- **Session Analytics**: Session duration and frequency

#### Performance Metrics
- **Provider Rankings**: Performance-based provider rankings
- **Response Quality**: Automated quality scoring
- **User Satisfaction**: Feedback-based satisfaction scores
- **Feature Adoption**: Feature usage analytics

#### Cost Analysis
- **Cost per User**: CPU analysis by user segment
- **Provider Efficiency**: Cost-performance analysis
- **Token Optimization**: Token usage efficiency
- **Budget Tracking**: Real-time budget monitoring

### Reporting

#### Automated Reports
- Daily performance summaries
- Weekly business metrics
- Monthly cost analysis
- Quarterly trend analysis

#### Custom Dashboards
- Executive overview dashboards
- Technical performance dashboards
- Business KPI dashboards
- Cost optimization dashboards

## Advanced Features

### High Availability

#### Prometheus HA
- Multiple Prometheus instances
- Remote write to Thanos for long-term storage
- Federation for large deployments

#### AlertManager HA
- Multiple AlertManager instances
- Peer communication for failover
- Load balancer configuration

### Log Aggregation

#### Loki Integration
- Structured log collection
- Log correlation with metrics
- Alerting on log patterns

#### Promtail Configuration
- Multi-source log collection
- Log parsing and enrichment
- Label-based log routing

### Advanced Metrics

#### Custom Business Metrics
- Revenue tracking
- Customer lifetime value
- Acquisition cost analysis
- Market penetration metrics

#### Predictive Analytics
- Performance trend prediction
- Capacity planning forecasts
- Cost optimization recommendations
- User behavior prediction

## Troubleshooting

### Common Issues

#### Services Not Starting
```bash
# Check logs
docker-compose -f docker-compose.monitoring.yml logs [service_name]

# Check resource usage
docker stats

# Check port conflicts
netstat -tulpn | grep [port]
```

#### Metrics Not Appearing
1. Verify Prometheus configuration
2. Check target health in Prometheus UI
3. Review application metrics code
4. Verify network connectivity

#### Alerts Not Firing
1. Check AlertManager logs
2. Verify alert rule syntax
3. Test alert rule evaluation
4. Check notification channel configuration

#### Grafana Issues
1. Verify data source configuration
2. Check dashboard JSON syntax
3. Review query expressions
4. Test data source connectivity

### Performance Optimization

#### Prometheus Tuning
```yaml
# Increase memory allocation
--storage.tsdb.min-block-duration=2h
--storage.tsdb.max-block-duration=2h

# Optimize query performance
--query.max-samples=50000000
--query.timeout=2m
```

#### Resource Allocation
```yaml
# docker-compose.monitoring.yml
services:
  prometheus:
    deploy:
      resources:
        limits:
          memory: 4G
          cpus: '2'
```

### Backup and Recovery

#### Data Backup
```bash
# Prometheus data backup
docker exec ish-chat-prometheus tar czf - /prometheus > backup-prometheus-$(date +%Y%m%d).tar.gz

# Grafana backup
docker exec ish-chat-grafana tar czf - /var/lib/grafana > backup-grafana-$(date +%Y%m%d).tar.gz
```

#### Configuration Backup
```bash
# Backup all configurations
tar czf monitoring-config-$(date +%Y%m%d).tar.gz monitoring/
```

## Security

### Access Control

#### Grafana Security
- Change default admin password
- Configure user roles and permissions
- Enable anonymous access (if required)
- Set up API keys for automation

#### Prometheus Security
- Network access controls
- TLS encryption
- Basic authentication
- Authorization rules

### Data Protection

#### Sensitive Data
- Avoid logging sensitive information
- Use environment variables for secrets
- Implement data retention policies
- Regular security audits

## Maintenance

### Regular Tasks

#### Daily
- Check alert status and system health
- Review resource utilization
- Monitor storage usage

#### Weekly
- Review performance trends
- Update dashboard configurations
- Check backup integrity

#### Monthly
- Update monitoring configurations
- Review and optimize alert rules
- Performance tuning

#### Quarterly
- Capacity planning review
- Cost optimization analysis
- Security audit

### Updates and Upgrades

#### Component Updates
```bash
# Update all services
docker-compose -f docker-compose.monitoring.yml pull
docker-compose -f docker-compose.monitoring.yml up -d

# Update specific service
docker-compose -f docker-compose.monitoring.yml up -d [service_name]
```

#### Configuration Updates
1. Test changes in development environment
2. Update configuration files
3. Restart affected services
4. Verify functionality

## Best Practices

### Monitoring Design
1. **Start with key metrics**: Focus on business-critical metrics first
2. **Use consistent labeling**: Standardize label names across metrics
3. **Implement SLOs**: Define and track service level objectives
4. **Document everything**: Maintain clear documentation for configurations

### Alert Management
1. **Alert on symptoms, not causes**: Focus on user-impacting issues
2. **Use appropriate severity levels**: Avoid alert fatigue
3. **Include runbooks**: Provide clear instructions for resolution
4. **Regular review**: Continuously optimize alert rules

### Performance Optimization
1. **Monitor the monitoring system**: Track resource usage of monitoring stack
2. **Optimize queries**: Use efficient PromQL queries
3. **Manage retention**: Configure appropriate data retention periods
4. **Scale appropriately**: Size infrastructure for expected load

### Business Intelligence
1. **Align with business goals**: Track metrics that matter to the business
2. **Provide actionable insights**: Make data actionable for decision making
3. **Automate reporting**: Reduce manual reporting overhead
4. **Continuous improvement**: Regularly review and enhance KPIs

## Appendix

### Configuration Templates

#### Prometheus Configuration Template
```yaml
global:
  scrape_interval: 15s
  evaluation_interval: 15s

rule_files:
  - "alert_rules.yml"

scrape_configs:
  - job_name: 'ish-chat-app'
    static_configs:
      - targets: ['app:9090']
```

#### AlertManager Configuration Template
```yaml
route:
  group_by: ['alertname']
  group_wait: 10s
  group_interval: 10s
  repeat_interval: 1h
  receiver: 'web.hook'

receivers:
  - name: 'web.hook'
    webhook_configs:
      - url: 'http://127.0.0.1:5001/'
```

### Query Examples

#### PromQL Examples
```promql
# Request rate by provider
sum(rate(ish_chat_requests_total[5m])) by (provider_type)

# 95th percentile response time
histogram_quantile(0.95, rate(ish_chat_request_duration_seconds_bucket[5m]))

# Error rate
sum(rate(ish_chat_requests_total{status="error"}[5m])) / sum(rate(ish_chat_requests_total[5m]))

# Instance health
sum(ish_chat_instances_healthy) by (provider_type)
```

### API Endpoints

#### Prometheus APIs
- `GET /api/v1/query`: Instant query
- `GET /api/v1/query_range`: Range query
- `GET /api/v1/labels`: List labels
- `GET /api/v1/targets`: Scrape targets

#### Grafana APIs
- `GET /api/health`: Health check
- `GET /api/dashboards`: List dashboards
- `POST /api/dashboards/db`: Create dashboard
- `GET /api/datasources`: List datasources

### Community Resources

#### Documentation
- [Prometheus Documentation](https://prometheus.io/docs/)
- [Grafana Documentation](https://grafana.com/docs/)
- [AlertManager Documentation](https://prometheus.io/docs/alerting/latest/alertmanager/)

#### Community
- [Prometheus Community](https://prometheus.io/community/)
- [Grafana Community](https://grafana.com/community/)
- [Slack Channels](https://grafana.com/community/slack)

---

## Support

For ISH Chat monitoring support:
1. Check this documentation first
2. Review logs and metrics
3. Consult troubleshooting section
4. Contact the monitoring team

Last updated: $(date +%Y-%m-%d)
Version: 1.0.0