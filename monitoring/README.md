# ISH Chat Monitoring System

## 🎯 Overview

This comprehensive monitoring system provides complete visibility into the ISH Chat multi-instance AI system with enterprise-grade monitoring, alerting, and business intelligence capabilities.

## 🏗️ Architecture

```
┌─────────────────┐    ┌──────────────────┐    ┌─────────────────┐
│   ISH Chat      │    │   Prometheus     │    │   AlertManager  │
│   Applications  │───▶│   Metrics        │───▶│   Notifications │
│   (Port 9090)   │    │   Collection     │    │   (Email/Slack) │
└─────────────────┘    └──────────────────┘    └─────────────────┘
         │                       │                       │
         │                       ▼                       ▼
         │              ┌─────────────────┐    ┌─────────────────┐
         │              │     Grafana      │    │   Notification  │
         └──────────────│   Visualization │    │   Channels      │
                        │   (Port 3000)   │    │                 │
                        └─────────────────┘    └─────────────────┘
```

## 🚀 Quick Start

### 1. Prerequisites
- Docker 20.10+ and Docker Compose
- 4GB+ RAM and 5GB+ disk space
- Network access to ISH Chat services

### 2. Deploy Monitoring Stack
```bash
cd /home/gary/multi-model-orchestrator/ish-chat-backend
./scripts/monitoring/deploy-monitoring.sh deploy
```

### 3. Access Dashboards
- **Grafana**: http://localhost:3000 (admin/admin123)
- **Prometheus**: http://localhost:9090
- **AlertManager**: http://localhost:9093

## 📊 Key Features

### 🔍 Comprehensive Metrics Collection
- **Application Metrics**: Request rates, response times, error rates
- **Instance Management**: Health status, auto-scaling events
- **Load Balancing**: Strategy performance, failover tracking
- **Business KPIs**: User engagement, cost tracking, satisfaction scores

### 📈 Advanced Dashboards
1. **System Overview**: Real-time system health and performance
2. **AI Provider Performance**: Detailed provider analytics
3. **Instance Health**: Instance availability and performance metrics
4. **Business KPIs**: Business metrics and user analytics

### 🚨 Intelligent Alerting
- **Multi-severity alerts**: Critical, warning, and info levels
- **Smart routing**: Team-based alert distribution
- **Multiple channels**: Email, Slack, and webhook notifications
- **SLO monitoring**: Service level objective tracking

### 💼 Business Intelligence
- **User Analytics**: Engagement, retention, and satisfaction metrics
- **Cost Management**: Real-time cost tracking and optimization
- **Performance Trends**: Predictive analytics and capacity planning
- **Quality Monitoring**: Response quality and content moderation

## 🛠️ Management

### Common Commands
```bash
# Deploy monitoring stack
./scripts/monitoring/deploy-monitoring.sh deploy

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

### Service Management
```bash
# Check specific service logs
docker-compose -f docker-compose.monitoring.yml logs prometheus

# Restart specific service
docker-compose -f docker-compose.monitoring.yml restart grafana

# Scale service
docker-compose -f docker-compose.monitoring.yml up -d --scale prometheus=2
```

## 📋 Dashboards

### 1. System Overview Dashboard
**URL**: http://localhost:3000/d/system-overview

**Key Metrics**:
- System health status
- Total requests per minute
- Error rates
- Response time distribution
- Instance health overview
- System resource usage

### 2. AI Provider Performance Dashboard
**URL**: http://localhost:3000/d/ai-provider-performance

**Key Metrics**:
- Provider-specific performance
- Response time percentiles
- Error rates by provider
- Token usage analytics
- Cost per request
- Circuit breaker status

### 3. Instance Health Dashboard
**URL**: http://localhost:3000/d/instance-health

**Key Metrics**:
- Instance availability
- Health check success rates
- Auto-scaling events
- Load distribution
- Circuit breaker status

## 🚨 Alert Management

### Alert Categories

#### Critical Alerts (Immediate Action Required)
- Service outages (Instance Manager, Router, Load Balancer)
- No healthy instances available
- Database connectivity issues
- SLO breaches

#### Warning Alerts (Attention Needed Soon)
- High response times
- Increased error rates
- Resource utilization warnings
- Cost threshold breaches

#### Info Alerts (FYI Notifications)
- System state changes
- Performance trends
- Capacity planning information

### Notification Channels

#### Email Configuration
Edit `monitoring/alertmanager/alertmanager.yml`:
```yaml
global:
  smtp_smarthost: 'your-smtp-server:587'
  smtp_from: 'alerts@ish-chat.local'
  smtp_auth_username: 'your-email@domain.com'
  smtp_auth_password: 'your-password'
```

#### Slack Integration
1. Create Slack webhook URL
2. Update AlertManager configuration with webhook URL
3. Configure channel routing for different alert types

### Customizing Alerts

1. **Edit Alert Rules**: Modify files in `monitoring/prometheus/*rules.yml`
2. **Add New Rules**: Follow existing patterns for new alert types
3. **Adjust Thresholds**: Fine-tune alert thresholds based on your environment
4. **Test Rules**: Use Prometheus UI to test rule evaluation

## 🔧 Configuration

### Prometheus Configuration
**File**: `monitoring/prometheus/prometheus.yml`

Key settings:
- `scrape_interval`: How often to scrape metrics (default: 15s)
- `evaluation_interval`: How often to evaluate alert rules (default: 15s)
- `retention.time`: How long to store metrics (default: 15d)

### Adding New Metrics

1. **Instrument Application Code**: Add Prometheus metrics to your application
2. **Configure Scrape Target**: Add new target to Prometheus configuration
3. **Create Dashboard**: Add panels to Grafana dashboard
4. **Add Alert Rules**: Create alert rules for new metrics

### Custom Business Metrics

Use the enhanced metrics service (`src/services/enhanced_prometheus_metrics_service.py`):

```python
# Record user activity
metrics.record_user_activity(
    user_type='premium',
    provider_type='openai',
    feature='chat_completion',
    session_duration=300.0
)

# Record business KPIs
metrics.update_slo_metrics(
    slo_name='response_time',
    service='api',
    time_window='24h',
    compliance=0.995,
    budget_consumed=0.15
)
```

## 📈 Performance Optimization

### Resource Allocation

**Default Resource Requirements**:
- Prometheus: 2GB RAM, 2 CPU cores
- Grafana: 512MB RAM, 1 CPU core
- AlertManager: 256MB RAM, 0.5 CPU core
- Exporters: 128MB RAM each

**Scaling Considerations**:
- Increase Prometheus memory for high-cardinality metrics
- Scale Grafana for multiple concurrent users
- Add multiple Prometheus instances for HA

### Query Optimization

1. **Use Efficient PromQL**: Avoid expensive queries
2. **Add Recording Rules**: Pre-compute expensive queries
3. **Optimize Labeling**: Reduce label cardinality
4. **Use Query Federation**: Distribute query load

### Storage Optimization

1. **Configure Retention**: Adjust data retention based on storage capacity
2. **Use Remote Storage**: Implement Thanos for long-term storage
3. **Compact Data**: Enable data compaction for older data
4. **Monitor Disk Usage**: Set up alerts for disk space

## 🔒 Security

### Access Control

#### Grafana Security
1. **Change Default Password**: Update admin credentials
2. **Configure User Roles**: Set appropriate permissions
3. **Enable Anonymous Access**: If required for public dashboards
4. **Set Up API Keys**: For automation and integrations

#### Prometheus Security
1. **Network Controls**: Limit access to Prometheus endpoints
2. **Enable TLS**: Encrypt traffic to Prometheus
3. **Authentication**: Configure basic auth or OAuth
4. **Authorization**: Set up access control rules

### Data Protection

1. **Avoid Sensitive Data**: Don't log sensitive information
2. **Use Environment Variables**: Store secrets securely
3. **Implement Retention**: Configure appropriate data retention
4. **Regular Audits**: Review security configurations

## 🛠️ Troubleshooting

### Common Issues

#### Services Not Starting
```bash
# Check logs
docker-compose -f docker-compose.monitoring.yml logs

# Check port conflicts
netstat -tulpn | grep :9090

# Check resource usage
docker stats
```

#### Metrics Not Appearing
1. Verify Prometheus configuration
2. Check target health in Prometheus UI (Status → Targets)
3. Review application metrics code
4. Verify network connectivity

#### Alerts Not Firing
1. Check AlertManager logs
2. Verify alert rule syntax in Prometheus UI
3. Test alert rule evaluation
4. Check notification channel configuration

#### Grafana Issues
1. Verify data source configuration
2. Check dashboard JSON syntax
3. Review query expressions
4. Test data source connectivity

### Performance Issues

#### High Memory Usage
1. Check time series cardinality
2. Optimize PromQL queries
3. Adjust memory limits
4. Implement query federation

#### Slow Queries
1. Add recording rules
2. Optimize query expressions
3. Increase query timeout
4. Use query parallelization

## 📚 Documentation

### Additional Resources
- [Complete Monitoring Guide](../MONITORING_GUIDE.md)
- [API Documentation](../docs/api.md)
- [Troubleshooting Guide](../docs/troubleshooting.md)
- [Business Intelligence Guide](../docs/business-intelligence.md)

### Community Support
- [Prometheus Documentation](https://prometheus.io/docs/)
- [Grafana Documentation](https://grafana.com/docs/)
- [AlertManager Documentation](https://prometheus.io/docs/alerting/latest/alertmanager/)

## 🔄 Maintenance

### Regular Tasks

#### Daily
- [ ] Check alert status and system health
- [ ] Review resource utilization
- [ ] Monitor storage usage
- [ ] Verify backup completion

#### Weekly
- [ ] Review performance trends
- [ ] Update dashboard configurations
- [ ] Check backup integrity
- [ ] Review alert effectiveness

#### Monthly
- [ ] Update monitoring configurations
- [ ] Review and optimize alert rules
- [ ] Performance tuning
- [ ] Security audit

#### Quarterly
- [ ] Capacity planning review
- [ ] Cost optimization analysis
- [ ] Architecture review
- [ ] Documentation updates

### Backup Procedures

#### Configuration Backup
```bash
# Backup monitoring configuration
tar czf monitoring-config-backup-$(date +%Y%m%d).tar.gz monitoring/
```

#### Data Backup
```bash
# Backup Prometheus data
docker exec ish-chat-prometheus tar czf - /prometheus > prometheus-data-$(date +%Y%m%d).tar.gz

# Backup Grafana data
docker exec ish-chat-grafana tar czf - /var/lib/grafana > grafana-data-$(date +%Y%m%d).tar.gz
```

### Update Procedures

#### Component Updates
```bash
# Update all services
docker-compose -f docker-compose.monitoring.yml pull
docker-compose -f docker-compose.monitoring.yml up -d

# Update specific service
docker-compose -f docker-compose.monitoring.yml up -d prometheus
```

## 📞 Support

### Getting Help
1. **Check Documentation**: Review this README and complete monitoring guide
2. **Review Logs**: Check service logs for error messages
3. **Consult Troubleshooting**: Use troubleshooting section
4. **Contact Team**: Reach out to monitoring team for assistance

### Reporting Issues
When reporting issues, include:
- Service affected
- Error messages from logs
- Steps to reproduce
- Expected vs actual behavior
- System specifications

---

## 📋 Quick Reference

### Access URLs
- **Grafana**: http://localhost:3000 (admin/admin123)
- **Prometheus**: http://localhost:9090
- **AlertManager**: http://localhost:9093

### Key Files
- **Deployment Script**: `scripts/monitoring/deploy-monitoring.sh`
- **Prometheus Config**: `monitoring/prometheus/prometheus.yml`
- **Alert Rules**: `monitoring/prometheus/*rules.yml`
- **AlertManager Config**: `monitoring/alertmanager/alertmanager.yml`
- **Grafana Dashboards**: `monitoring/grafana/dashboards/`

### Important Ports
- **Prometheus**: 9090
- **AlertManager**: 9093
- **Grafana**: 3000
- **Node Exporter**: 9100
- **Postgres Exporter**: 9187
- **Redis Exporter**: 9121

### Environment Variables
- `COMPOSE_PROJECT_NAME=ish-chat-monitoring`
- `PROMETHEUS_RETENTION=15d`
- `GRAFANA_ADMIN_PASSWORD=admin123`
- `ALERTMANAGER_SMTP_HOST=localhost:587`

---

*Last updated: $(date +%Y-%m-%d)*
*Version: 1.0.0*
*Maintained by: ISH Chat Monitoring Team*