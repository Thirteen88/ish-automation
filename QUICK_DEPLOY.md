# ISH Automation - Quick Deployment Guide

## 🚀 Deploy in 5 Minutes

### Prerequisites Checklist
- [ ] Docker and Docker Compose installed
- [ ] kubectl configured (for K8s deployment)
- [ ] Environment variables ready
- [ ] API keys available

---

## Option 1: Docker Compose (Fastest)

### Step 1: Clone and Configure
```bash
git clone https://github.com/your-org/ish-automation.git
cd ish-automation
cp .env.example .env
```

### Step 2: Edit Environment
```bash
nano .env
# Add your API keys:
# - OPENAI_API_KEY
# - ANTHROPIC_API_KEY
# - POSTGRES_PASSWORD
# - REDIS_PASSWORD
```

### Step 3: Deploy
```bash
docker-compose up -d
```

### Step 4: Verify
```bash
# Check services
docker-compose ps

# Test API
curl http://localhost:3000/health

# Test Web
curl http://localhost:3001/health

# Test PWA
curl http://localhost:3002/health
```

**Done!** 🎉 Access:
- API: http://localhost:3000
- Web: http://localhost:3001
- PWA: http://localhost:3002
- Grafana: http://localhost:3003

---

## Option 2: Kubernetes (Production)

### Step 1: Prepare Cluster
```bash
# Create namespace
kubectl apply -f k8s/namespace.yaml

# Create secrets
kubectl create secret generic ish-api-secrets \
  --from-env-file=.env \
  -n ish-automation
```

### Step 2: Deploy
```bash
# Deploy all services
kubectl apply -f k8s/

# Wait for deployment
kubectl rollout status deployment/ish-api -n ish-automation
```

### Step 3: Verify
```bash
# Check pods
kubectl get pods -n ish-automation

# Check services
kubectl get svc -n ish-automation

# Test health
kubectl exec deployment/ish-api -n ish-automation -- \
  wget -q -O- http://localhost:3000/health
```

---

## Option 3: Automated with CI/CD

### Step 1: Configure GitHub
```bash
# Add secrets to GitHub repository:
# Settings → Secrets and variables → Actions → New secret

# Required secrets:
# - KUBE_CONFIG_PROD (base64 encoded kubeconfig)
# - SLACK_WEBHOOK (optional, for notifications)
```

### Step 2: Push to Deploy
```bash
# Development
git checkout develop
git push origin develop
# Auto-deploys to dev

# Staging
git checkout staging
git push origin staging
# Auto-deploys to staging

# Production
git checkout main
git push origin main
# Requires approval, then deploys to production
```

---

## Quick Commands Reference

### Docker Compose
```bash
# Start
docker-compose up -d

# Stop
docker-compose down

# View logs
docker-compose logs -f api

# Restart service
docker-compose restart api

# Scale
docker-compose up -d --scale api=3
```

### Kubernetes
```bash
# Deploy
kubectl apply -f k8s/

# Check status
kubectl get all -n ish-automation

# View logs
kubectl logs -f deployment/ish-api -n ish-automation

# Scale
kubectl scale deployment/ish-api --replicas=5 -n ish-automation

# Rollback
./deploy/rollback.sh production
```

### Health Checks
```bash
# API health
curl http://localhost:3000/health

# Metrics
curl http://localhost:3000/metrics

# All services
for port in 3000 3001 3002; do
  echo "Port $port:"
  curl -s http://localhost:$port/health | jq .
done
```

---

## Troubleshooting

### Service won't start
```bash
# Check logs
docker-compose logs api
# or
kubectl logs deployment/ish-api -n ish-automation

# Check configuration
docker-compose config
# or
kubectl get configmap ish-api-config -n ish-automation -o yaml
```

### Database connection failed
```bash
# Test database
docker exec ish-postgres psql -U ish_user -d ish_automation -c "SELECT 1;"
# or
kubectl exec deployment/ish-postgres -n ish-automation -- \
  psql -U ish_user -d ish_automation -c "SELECT 1;"
```

### Port already in use
```bash
# Change ports in docker-compose.yml
# or set environment variables:
export API_PORT=3100
export WEB_PORT=3101
export PWA_PORT=3102
```

---

## Environment Variables

### Required
```bash
NODE_ENV=production              # Environment
POSTGRES_PASSWORD=***            # Database password
REDIS_PASSWORD=***               # Redis password
```

### Optional (AI Services)
```bash
OPENAI_API_KEY=***               # OpenAI API key
ANTHROPIC_API_KEY=***            # Anthropic/Claude API key
GOOGLE_API_KEY=***               # Google AI API key
REPLICATE_API_KEY=***            # Replicate API key
TOGETHER_API_KEY=***             # Together AI API key
```

### Optional (Configuration)
```bash
API_PORT=3000                    # API server port
WEB_PORT=3001                    # Web interface port
PWA_PORT=3002                    # PWA server port
LOG_LEVEL=info                   # Logging level
ENABLE_MONITORING=true           # Enable monitoring
```

---

## Next Steps

After deployment:

1. **Configure Monitoring**
   - Access Grafana at http://localhost:3003
   - Login: admin/admin
   - Change password
   - View dashboards

2. **Test Functionality**
   - Send test query to API
   - Access web interface
   - Try mobile PWA

3. **Set Up Alerts**
   - Configure Slack webhook
   - Test alert notifications
   - Review alert rules

4. **Enable Backups**
   - Schedule automated backups
   - Test restore procedure
   - Configure retention

5. **Review Documentation**
   - [Full Deployment Guide](DEPLOYMENT_GUIDE.md)
   - [Incident Runbook](INCIDENT_RUNBOOK.md)
   - [Architecture Docs](ARCHITECTURE_VISUAL.md)

---

## Support

**Issues?** Check:
- [Deployment Guide](DEPLOYMENT_GUIDE.md) - Full documentation
- [Incident Runbook](INCIDENT_RUNBOOK.md) - Troubleshooting
- [GitHub Issues](https://github.com/your-org/ish-automation/issues)

**Emergency?** Run:
```bash
./deploy/rollback.sh production
```

---

## Production Checklist

Before going to production:

- [ ] Environment variables configured
- [ ] Secrets encrypted and stored securely
- [ ] SSL/TLS certificates installed
- [ ] Monitoring and alerts configured
- [ ] Backup strategy implemented
- [ ] Load testing completed
- [ ] Team trained on operations
- [ ] Incident runbook reviewed
- [ ] Rollback procedure tested

---

**Ready to deploy!** 🚀

For detailed instructions, see [DEPLOYMENT_GUIDE.md](DEPLOYMENT_GUIDE.md)
