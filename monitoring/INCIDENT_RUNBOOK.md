# ISH Chat Monitoring Incident Runbook

## 🚨 Incident Response Procedures

This runbook provides step-by-step procedures for responding to common monitoring incidents and alerts in the ISH Chat system.

## 📋 Incident Severity Levels

| Severity | Description | Response Time | Escalation |
|----------|-------------|---------------|------------|
| **Critical** | Service outage, major functionality impact | 15 minutes | Immediate escalation |
| **High** | Significant performance degradation | 1 hour | Team lead escalation |
| **Medium** | Minor performance issues, warnings | 4 hours | Standard procedures |
| **Low** | Informational alerts, FYI notifications | 24 hours | Documentation update |

## 🔧 Common Incidents

### 1. Service Outage Incidents

#### Instance Manager Down
**Alert**: `InstanceManagerDown`

**Symptoms**:
- No instance management functionality
- Auto-scaling not working
- Instance health checks failing

**Immediate Actions**:
1. **Verify Service Status**
   ```bash
   # Check if service is running
   docker-compose -f docker-compose.monitoring.yml ps instance-manager
   
   # Check service logs
   docker-compose -f docker-compose.monitoring.yml logs instance-manager
   ```

2. **Restart Service**
   ```bash
   # Restart instance manager
   docker-compose -f docker-compose.monitoring.yml restart instance-manager
   
   # Monitor health
   watch -n 5 'curl -f http://localhost:9090/health'
   ```

3. **Check Dependencies**
   ```bash
   # Verify database connectivity
   docker exec -it ish-chat-instance-manager python -c "
   from src.database.database import engine
   print(engine.execute('SELECT 1').scalar())
   "
   
   # Check Redis connection
   docker exec -it ish-chat-instance-manager python -c "
   import redis
   r = redis.Redis(host='redis', port=6379)
   print(r.ping())
   "
   ```

4. **Investigate Root Cause**
   - Review application logs for errors
   - Check resource utilization (CPU, memory)
   - Verify configuration changes
   - Check recent deployments

**Escalation Criteria**:
- Service doesn't recover after restart
- Multiple services affected
- Database connectivity issues

#### Intelligent Router Down
**Alert**: `IntelligentRouterDown`

**Symptoms**:
- No intelligent routing functionality
- Requests not being distributed optimally
- Fallback to basic load balancing

**Immediate Actions**:
1. **Check Router Status**
   ```bash
   # Check router service
   docker-compose -f docker-compose.monitoring.yml ps intelligent-router
   
   # Check router logs
   docker-compose -f docker-compose.monitoring.yml logs intelligent-router
   ```

2. **Verify Routing Configuration**
   ```bash
   # Check routing configuration
   curl http://localhost:9091/routing/config
   
   # Test routing endpoint
   curl -X POST http://localhost:9091/route \
     -H "Content-Type: application/json" \
     -d '{"provider_type": "openai", "model_name": "gpt-4"}'
   ```

3. **Restart Router Service**
   ```bash
   docker-compose -f docker-compose.monitoring.yml restart intelligent-router
   ```

4. **Verify ML Models**
   ```bash
   # Check ML model status
   curl http://localhost:9091/ml/models/status
   
   # Reload models if needed
   curl -X POST http://localhost:9091/ml/models/reload
   ```

#### Load Balancer Down
**Alert**: `LoadBalancerDown`

**Symptoms**:
- No request distribution
- Single point of failure
- Uneven load distribution

**Immediate Actions**:
1. **Check Load Balancer Status**
   ```bash
   # Check load balancer service
   docker-compose -f docker-compose.monitoring.yml ps load-balancer
   
   # Check load balancer logs
   docker-compose -f docker-compose.monitoring.yml logs load-balancer
   ```

2. **Verify Load Balancer Configuration**
   ```bash
   # Check current configuration
   curl http://localhost:9092/config
   
   # Check health of upstream servers
   curl http://localhost:9092/upstream/health
   ```

3. **Restart Load Balancer**
   ```bash
   docker-compose -f docker-compose.monitoring.yml restart load-balancer
   ```

4. **Manual Failover** (if needed)
   ```bash
   # Configure manual routing
   curl -X POST http://localhost:9092/config/manual \
     -H "Content-Type: application/json" \
     -d '{"strategy": "round_robin", "instances": ["instance1", "instance2"]}'
   ```

### 2. Performance Degradation Incidents

#### High Response Times
**Alert**: `HighResponseTime`

**Symptoms**:
- Slow API responses
- User experience degradation
- Performance SLA breaches

**Immediate Actions**:
1. **Identify Bottleneck**
   ```bash
   # Check response times by provider
   curl -G 'http://localhost:9090/api/v1/query' \
     --data-urlencode 'query=histogram_quantile(0.95, rate(ish_chat_request_duration_seconds_bucket[5m]))'
   
   # Check system resources
   docker stats
   ```

2. **Analyze Provider Performance**
   ```bash
   # Check slow providers
   curl -G 'http://localhost:9090/api/v1/query' \
     --data-urlencode 'query=topk(5, histogram_quantile(0.95, rate(ish_chat_request_duration_seconds_bucket[5m])) by (provider_type))'
   
   # Check instance health
   curl -G 'http://localhost:9090/api/v1/query' \
     --data-urlencode 'query=ish_chat_instance_load'
   ```

3. **Optimize Load Balancing**
   ```bash
   # Check load balancer strategy effectiveness
   curl http://localhost:9092/strategy/performance
   
   # Switch to performance-based routing
   curl -X POST http://localhost:9092/strategy/update \
     -H "Content-Type: application/json" \
     -d '{"strategy": "performance_based"}'
   ```

4. **Scale Resources**
   ```bash
   # Add more instances if needed
   curl -X POST http://localhost:9091/instances/scale \
     -H "Content-Type: application/json" \
     -d '{"provider_type": "openai", "desired_instances": 5}'
   ```

#### High Error Rates
**Alert**: `HighErrorRate`

**Symptoms**:
- Increased request failures
- User complaints
- Service quality degradation

**Immediate Actions**:
1. **Identify Error Source**
   ```bash
   # Check error rates by provider
   curl -G 'http://localhost:9090/api/v1/query' \
     --data-urlencode 'query=sum(rate(ish_chat_requests_total{status="error"}[5m])) by (provider_type)'
   
   # Check error types
   curl -G 'http://localhost:9090/api/v1/query' \
     --data-urlencode 'query=sum(rate(ish_chat_requests_total[5m])) by (status, provider_type)'
   ```

2. **Check Circuit Breaker Status**
   ```bash
   # Check circuit breaker states
   curl -G 'http://localhost:9090/api/v1/query' \
     --data-urlencode 'query=ish_chat_circuit_breaker_state'
   
   # Reset circuit breakers if needed
   curl -X POST http://localhost:9091/circuit/reset
   ```

3. **Verify Provider Connectivity**
   ```bash
   # Test provider endpoints
   for provider in openai anthropic zai; do
     curl -f -s "http://localhost:9091/providers/$provider/health" || echo "$provider is unhealthy"
   done
   ```

4. **Failover to Healthy Providers**
   ```bash
   # Configure failover
   curl -X POST http://localhost:9092/failover/configure \
     -H "Content-Type: application/json" \
     -d '{"unhealthy_provider": "openai", "failover_to": ["anthropic", "zai"]}'
   ```

### 3. Resource Issues

#### High CPU Usage
**Alert**: `HighCPUUsage`

**Symptoms**:
- System responsiveness issues
- Request timeouts
- Performance degradation

**Immediate Actions**:
1. **Identify Resource Consumer**
   ```bash
   # Check CPU usage by container
   docker stats --no-stream --format "table {{.Container}}\t{{.CPUPerc}}"
   
   # Check CPU usage by process
   docker exec -it ish-chat-instance-manager top
   ```

2. **Scale Services**
   ```bash
   # Scale horizontally if possible
   docker-compose -f docker-compose.monitoring.yml up -d --scale instance-manager=3
   
   # Scale individual instances
   curl -X POST http://localhost:9091/instances/scale \
     -H "Content-Type: application/json" \
     -d '{"provider_type": "openai", "desired_instances": 10}'
   ```

3. **Optimize Configuration**
   ```bash
   # Reduce concurrent requests
   curl -X POST http://localhost:9091/config/update \
     -H "Content-Type: application/json" \
     -d '{"max_concurrent_requests": 50}'
   
   # Optimize garbage collection
   curl -X POST http://localhost:9091/config/gc/optimize
   ```

#### High Memory Usage
**Alert**: `HighMemoryUsage`

**Symptoms**:
- Memory pressure
- OOM errors
- Service instability

**Immediate Actions**:
1. **Check Memory Usage**
   ```bash
   # Check memory by container
   docker stats --no-stream --format "table {{.Container}}\t{{.MemUsage}}\t{{.MemPerc}}"
   
   # Check memory leaks
   docker exec -it ish-chat-instance-manager python -m memory_profiler src/main.py
   ```

2. **Restart Services**
   ```bash
   # Restart memory-intensive services
   docker-compose -f docker-compose.monitoring.yml restart instance-manager
   
   # Clear caches if needed
   curl -X POST http://localhost:9091/cache/clear
   ```

3. **Increase Memory Limits**
   ```bash
   # Update Docker memory limits
   docker-compose -f docker-compose.monitoring.yml up -d --memory=4g instance-manager
   ```

#### Disk Space Issues
**Alert**: `DiskSpaceRunningLow`

**Symptoms**:
- Write failures
- Service crashes
- Data corruption risk

**Immediate Actions**:
1. **Check Disk Usage**
   ```bash
   # Check disk usage
   df -h
   
   # Find large files
   find /var/lib/docker -type f -size +1G -exec ls -lh {} \;
   ```

2. **Clean Up Docker Resources**
   ```bash
   # Clean up unused containers, images, and networks
   docker system prune -a
   
   # Clean up unused volumes
   docker volume prune
   ```

3. **Rotate Logs**
   ```bash
   # Rotate application logs
   logrotate -f /etc/logrotate.d/ish-chat
   
   # Compress old logs
   find /var/log -name "*.log" -mtime +7 -exec gzip {} \;
   ```

4. **Archive Old Data**
   ```bash
   # Archive old Prometheus data
   docker exec ish-chat-prometheus tsdb delete --min-time=2024-01-01T00:00:00Z
   
   # Archive old monitoring data
   tar czf /backup/monitoring-old-$(date +%Y%m%d).tar.gz /monitoring/data/old/
   ```

### 4. Database Issues

#### Database Connection Issues
**Alert**: `PostgreSQLDown`

**Symptoms**:
- Database connectivity failures
- Service unable to persist data
- Feature degradation

**Immediate Actions**:
1. **Check Database Status**
   ```bash
   # Check PostgreSQL service
   docker-compose -f docker-compose.monitoring.yml ps postgres
   
   # Check database logs
   docker-compose -f docker-compose.monitoring.yml logs postgres
   
   # Test database connectivity
   docker exec -it postgres psql -U ishchat_user -d ish_chat -c "SELECT 1;"
   ```

2. **Restart Database**
   ```bash
   # Restart PostgreSQL
   docker-compose -f docker-compose.monitoring.yml restart postgres
   
   # Wait for database to be ready
   docker exec -it postgres pg_isready -U ishchat_user -d ish_chat
   ```

3. **Check Database Configuration**
   ```bash
   # Check connection limits
   docker exec -it postgres psql -U ishchat_user -d ish_chat -c "SHOW max_connections;"
   
   # Check active connections
   docker exec -it postgres psql -U ishchat_user -d ish_chat -c "SELECT count(*) FROM pg_stat_activity;"
   ```

4. **Verify Database Health**
   ```bash
   # Check database size
   docker exec -it postgres psql -U ishchat_user -d ish_chat -c "SELECT pg_size_pretty(pg_database_size('ish_chat'));"
   
   # Check table statistics
   docker exec -it postgres psql -U ishchat_user -d ish_chat -c "SELECT schemaname,tablename,attname,n_distinct,correlation FROM pg_stats;"
   ```

#### Database Performance Issues
**Alert**: `PostgreSQLSlowQueries`

**Symptoms**:
- Slow query performance
- Database timeouts
- Application performance degradation

**Immediate Actions**:
1. **Identify Slow Queries**
   ```bash
   # Check slow queries
   docker exec -it postgres psql -U ishchat_user -d ish_chat -c "
   SELECT query, mean_time, calls, total_time
   FROM pg_stat_statements
   ORDER BY mean_time DESC
   LIMIT 10;
   "
   ```

2. **Optimize Database**
   ```bash
   # Update statistics
   docker exec -it postgres psql -U ishchat_user -d ish_chat -c "ANALYZE;"
   
   # Rebuild indexes
   docker exec -it postgres psql -U ishchat_user -d ish_chat -c "REINDEX DATABASE ish_chat;"
   ```

3. **Check Database Locks**
   ```bash
   # Check for locks
   docker exec -it postgres psql -U ishchat_user -d ish_chat -c "
   SELECT blocked_locks.pid AS blocked_pid,
          blocked_activity.usename AS blocked_user,
          blocking_locks.pid AS blocking_pid,
          blocking_activity.usename AS blocking_user,
          blocked_activity.query AS blocked_statement,
          blocking_activity.query AS current_statement_in_blocking_process
   FROM pg_catalog.pg_locks blocked_locks
   JOIN pg_catalog.pg_stat_activity blocked_activity ON blocked_activity.pid = blocked_locks.pid
   JOIN pg_catalog.pg_locks blocking_locks ON blocking_locks.locktype = blocked_locks.locktype
   JOIN pg_catalog.pg_stat_activity blocking_activity ON blocking_activity.pid = blocking_locks.pid
   WHERE NOT blocked_locks.granted;
   "
   ```

### 5. Cache Issues

#### Redis Connectivity Issues
**Alert**: `RedisDown`

**Symptoms**:
- Cache misses
- Performance degradation
- Session loss

**Immediate Actions**:
1. **Check Redis Status**
   ```bash
   # Check Redis service
   docker-compose -f docker-compose.monitoring.yml ps redis
   
   # Check Redis logs
   docker-compose -f docker-compose.monitoring.yml logs redis
   
   # Test Redis connectivity
   docker exec -it redis redis-cli ping
   ```

2. **Restart Redis**
   ```bash
   # Restart Redis
   docker-compose -f docker-compose.monitoring.yml restart redis
   
   # Check Redis info
   docker exec -it redis redis-cli info memory
   ```

3. **Check Redis Memory Usage**
   ```bash
   # Check memory usage
   docker exec -it redis redis-cli info memory | grep used_memory_human
   
   # Check key count
   docker exec -it redis redis-cli dbsize
   ```

4. **Clear Cache if Needed**
   ```bash
   # Clear all cache
   docker exec -it redis redis-cli FLUSHALL
   
   # Clear specific patterns
   docker exec -it redis redis-cli --scan --pattern "session:*" | xargs docker exec -it redis redis-cli DEL
   ```

### 6. Cost Management Incidents

#### High Cost Spike
**Alert**: `UnexpectedCostSpike`

**Symptoms**:
- Sudden cost increase
- Budget overruns
- Resource overutilization

**Immediate Actions**:
1. **Identify Cost Source**
   ```bash
   # Check cost by provider
   curl -G 'http://localhost:9090/api/v1/query' \
     --data-urlencode 'query=sum(rate(ish_chat_cost_estimate_dollars[1h])) by (provider_type)'
   
   # Check token usage
   curl -G 'http://localhost:9090/api/v1/query' \
     --data-urlencode 'query=sum(rate(ish_chat_tokens_used_total[1h])) by (provider_type, model_name)'
   ```

2. **Implement Cost Controls**
   ```bash
   # Set rate limits
   curl -X POST http://localhost:9091/rate-limit/configure \
     -H "Content-Type: application/json" \
     -d '{"provider_type": "openai", "requests_per_minute": 100}'
   
   # Enable cost-aware routing
   curl -X POST http://localhost:9092/routing/cost-optimized \
     -H "Content-Type: application/json" \
     -d '{"max_cost_per_request": 0.01}'
   ```

3. **Scale Down Expensive Resources**
   ```bash
   # Reduce expensive provider instances
   curl -X POST http://localhost:9091/instances/scale \
     -H "Content-Type: application/json" \
     -d '{"provider_type": "openai", "desired_instances": 2}'
   ```

## 🚨 Communication Procedures

### Alert Acknowledgment
1. **Acknowledge Alert**: Respond to alert notification within SLA
2. **Update Status**: Provide initial assessment and ETA
3. **Create Incident**: Create incident ticket for tracking
4. **Stakeholder Communication**: Notify relevant stakeholders

### Incident Updates
1. **Regular Updates**: Provide updates every 30 minutes for critical incidents
2. **Status Changes**: Update when status changes (investigating, identified, resolving, resolved)
3. **ETA Updates**: Provide realistic ETAs and update if they change
4. **Resolution**: Post-mortem and prevention measures

### Escalation Procedures
1. **Team Lead**: Escalate to team lead after 30 minutes without resolution
2. **Manager**: Escalate to manager after 1 hour for critical incidents
3. **Executive**: Escalate to executive leadership for major outages

## 📊 Post-Incident Procedures

### Incident Documentation
1. **Timeline**: Create detailed timeline of events
2. **Root Cause**: Document root cause analysis
3. **Impact Assessment**: Document business and user impact
4. **Resolution Steps**: Document steps taken to resolve

### Prevention Measures
1. **Monitoring Improvements**: Add or improve monitoring/alerting
2. **Process Improvements**: Update procedures and runbooks
3. **Technical Fixes**: Implement technical improvements
4. **Training**: Provide training to prevent recurrence

### Review Meeting
1. **Participants**: Include all incident responders
2. **Timeline Review**: Walk through incident timeline
3. **Lessons Learned**: Identify key learnings
4. **Action Items**: Create actionable improvement items

## 📱 Emergency Contacts

### On-Call Team
- **Primary On-Call**: [Phone number]
- **Secondary On-Call**: [Phone number]
- **Team Lead**: [Phone number]

### Escalation Contacts
- **Engineering Manager**: [Phone number]
- **VP Engineering**: [Phone number]
- **CTO**: [Phone number]

### External Contacts
- **Cloud Provider Support**: [Contact information]
- **Database Administrator**: [Contact information]
- **Security Team**: [Contact information]

## 🔧 Quick Commands Reference

### Service Management
```bash
# Check all services
docker-compose -f docker-compose.monitoring.yml ps

# Restart service
docker-compose -f docker-compose.monitoring.yml restart [service]

# View logs
docker-compose -f docker-compose.monitoring.yml logs -f [service]

# Scale service
docker-compose -f docker-compose.monitoring.yml up -d --scale [service]=3
```

### Health Checks
```bash
# Check ISH Chat services
curl -f http://localhost:8000/health

# Check monitoring services
curl -f http://localhost:9090/-/healthy
curl -f http://localhost:9093/-/healthy
curl -f http://localhost:3000/api/health
```

### Metrics Queries
```bash
# High error rate
curl -G 'http://localhost:9090/api/v1/query' \
  --data-urlencode 'query=sum(rate(ish_chat_requests_total{status="error"}[5m])) by (provider_type)'

# High response time
curl -G 'http://localhost:9090/api/v1/query' \
  --data-urlencode 'query=histogram_quantile(0.95, rate(ish_chat_request_duration_seconds_bucket[5m]))'

# Instance health
curl -G 'http://localhost:9090/api/v1/query' \
  --data-urlencode 'query=sum(ish_chat_instances_healthy) by (provider_type)'
```

---

*This runbook should be updated regularly based on incident learnings and system changes.*

*Last updated: $(date +%Y-%m-%d)*
*Version: 1.0.0*
*Maintained by: ISH Chat Operations Team*