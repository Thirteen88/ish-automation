# ISH Automation - Production Incident Runbook

## Quick Reference

**Emergency Contacts:**
- On-Call Engineer: [Phone/Slack]
- Team Lead: [Phone/Slack]
- DevOps Team: #devops-oncall

**Critical Links:**
- Status Page: https://status.ish-automation.com
- Grafana: https://grafana.ish-automation.com
- Logs: https://logs.ish-automation.com
- Runbooks: https://docs.ish-automation.com/runbooks

---

## Incident Response Process

### 1. Acknowledge Alert
```bash
# Acknowledge in Slack/PagerDuty
# Update status page
# Notify team
```

### 2. Assess Severity

**P0 - Critical**: Complete service outage
**P1 - High**: Significant degradation
**P2 - Medium**: Minor issues, workaround available
**P3 - Low**: No immediate impact

### 3. Initial Investigation
```bash
# Check service health
curl https://api.ish-automation.com/health

# Check Grafana dashboards
# Review recent deployments
# Check error logs
```

---

## Common Incidents

### Incident: Service Down (P0)

**Symptoms:**
- Health check failing
- 503 errors
- No response from service

**Investigation:**
```bash
# Check pod status
kubectl get pods -n ish-automation

# Check recent events
kubectl get events -n ish-automation --sort-by='.lastTimestamp'

# Check logs
kubectl logs -f deployment/ish-api -n ish-automation --tail=100
```

**Resolution:**
```bash
# Option 1: Restart pods
kubectl rollout restart deployment/ish-api -n ish-automation

# Option 2: Rollback
./deploy/rollback.sh production

# Option 3: Scale up
kubectl scale deployment/ish-api --replicas=5 -n ish-automation
```

---

### Incident: High Error Rate (P1)

**Symptoms:**
- Error rate > 5%
- Multiple 500 errors
- User complaints

**Investigation:**
```bash
# Check error logs
kubectl logs deployment/ish-api -n ish-automation | grep ERROR

# Check Prometheus
rate(http_requests_total{status=~"5.."}[5m])

# Check database connections
kubectl exec deployment/ish-postgres -n ish-automation -- psql -U ish_user -c "SELECT count(*) FROM pg_stat_activity;"
```

**Resolution:**
```bash
# Identify error source
# Fix configuration if needed
# Restart affected services
# Monitor recovery
```

---

### Incident: Database Connection Issues (P0)

**Symptoms:**
- "Connection timeout" errors
- Database unreachable
- All queries failing

**Investigation:**
```bash
# Check PostgreSQL status
kubectl get pods -n ish-automation | grep postgres

# Check database logs
kubectl logs deployment/ish-postgres -n ish-automation

# Test connection
kubectl exec deployment/ish-api -n ish-automation -- \
  psql -h ish-postgres -U ish_user -d ish_automation -c "SELECT 1;"
```

**Resolution:**
```bash
# Option 1: Restart database
kubectl rollout restart deployment/ish-postgres -n ish-automation

# Option 2: Fix connection pool
# Update connection settings in configmap
kubectl edit configmap ish-api-config -n ish-automation

# Option 3: Restore from backup
./deploy/restore-database.sh production [timestamp]
```

---

### Incident: High Memory Usage (P1)

**Symptoms:**
- Memory > 80%
- OOMKilled pods
- Slow response times

**Investigation:**
```bash
# Check memory usage
kubectl top pods -n ish-automation

# Check for memory leaks
kubectl logs deployment/ish-api -n ish-automation | grep "memory"
```

**Resolution:**
```bash
# Option 1: Restart pods
kubectl rollout restart deployment/ish-api -n ish-automation

# Option 2: Increase memory limits
kubectl set resources deployment/ish-api \
  --limits=memory=4Gi -n ish-automation

# Option 3: Scale horizontally
kubectl scale deployment/ish-api --replicas=5 -n ish-automation
```

---

### Incident: Deployment Failed (P1)

**Symptoms:**
- Rollout stuck
- Pods CrashLoopBackOff
- ImagePullBackOff

**Investigation:**
```bash
# Check deployment status
kubectl rollout status deployment/ish-api -n ish-automation

# Check pod events
kubectl describe pod [pod-name] -n ish-automation

# Check image
kubectl get deployment/ish-api -n ish-automation -o yaml | grep image
```

**Resolution:**
```bash
# Option 1: Rollback immediately
./deploy/rollback.sh production

# Option 2: Fix and redeploy
# Fix the issue
# Deploy again
./deploy/deploy.sh production [version]

# Verify
kubectl get pods -n ish-automation
```

---

## Post-Incident Checklist

- [ ] Incident resolved and verified
- [ ] Status page updated
- [ ] Team notified
- [ ] Logs collected
- [ ] Metrics captured
- [ ] Incident report created
- [ ] Root cause identified
- [ ] Prevention measures documented
- [ ] Runbook updated if needed

---

## Escalation Matrix

1. **On-Call Engineer** → Attempt resolution (30 min)
2. **Team Lead** → If not resolved
3. **DevOps Lead** → For infrastructure issues
4. **CTO** → For critical P0 incidents

---

## Emergency Commands

### Quick Health Check
```bash
curl -f https://api.ish-automation.com/health || echo "FAILED"
```

### Emergency Rollback
```bash
./deploy/rollback.sh production
```

### Scale Up Quickly
```bash
kubectl scale deployment/ish-api --replicas=10 -n ish-automation
```

### Emergency Maintenance Mode
```bash
kubectl patch ingress ish-ingress -n ish-automation \
  -p '{"spec":{"rules":[{"http":{"paths":[{"path":"/","pathType":"Prefix","backend":{"service":{"name":"maintenance","port":{"number":80}}}}]}}]}}'
```

---

## Contact Information

**On-Call Rotation:** See PagerDuty schedule
**Emergency Slack:** #ish-incidents
**Status Page:** https://status.ish-automation.com
