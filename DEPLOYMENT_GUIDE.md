# ISH Automation - Complete Production Deployment Guide

## Table of Contents
1. [Overview](#overview)
2. [Architecture](#architecture)
3. [Prerequisites](#prerequisites)
4. [Docker Deployment](#docker-deployment)
5. [Kubernetes Deployment](#kubernetes-deployment)
6. [CI/CD Pipeline](#cicd-pipeline)
7. [Environment Configuration](#environment-configuration)
8. [Monitoring & Observability](#monitoring--observability)
9. [Troubleshooting](#troubleshooting)
10. [Rollback Procedures](#rollback-procedures)

---

## Overview

This guide provides complete instructions for deploying the ISH Automation system to production environments. The system supports multiple deployment strategies:

- **Docker Compose**: For single-server deployments
- **Kubernetes**: For scalable, production-grade deployments
- **CI/CD**: Automated deployment via GitHub Actions

### System Components

- **API Server**: REST API for external integrations (Port 3000)
- **Web Interface**: Browser-based UI (Port 3001)
- **Mobile PWA**: Progressive Web App (Port 3002)
- **PostgreSQL**: Primary database
- **Redis**: Caching and session management
- **Nginx**: Reverse proxy and load balancer
- **Prometheus**: Metrics collection
- **Grafana**: Metrics visualization

---

## Architecture

### High-Level Architecture

```
                    ┌─────────────────┐
                    │   Nginx LB      │
                    │   (Port 80/443) │
                    └────────┬────────┘
                             │
          ┌──────────────────┼──────────────────┐
          │                  │                  │
    ┌─────▼─────┐     ┌─────▼─────┐     ┌─────▼─────┐
    │ API (3000)│     │ Web (3001)│     │ PWA (3002)│
    └─────┬─────┘     └─────┬─────┘     └─────┬─────┘
          │                 │                   │
          └────────┬────────┴───────────────────┘
                   │
          ┌────────┴────────┐
          │                 │
    ┌─────▼─────┐     ┌────▼────┐
    │ PostgreSQL│     │  Redis  │
    └───────────┘     └─────────┘
```

### Deployment Architecture

```
┌─────────────────────────────────────────────────────┐
│                   GitHub Actions                    │
│  (Build → Test → Security Scan → Deploy)           │
└────────────────┬────────────────────────────────────┘
                 │
    ┌────────────┼────────────┐
    │            │            │
┌───▼───┐   ┌───▼───┐   ┌───▼───┐
│  Dev  │   │Staging│   │  Prod │
└───────┘   └───────┘   └───────┘
```

---

## Prerequisites

### Required Software
- Docker 24.0+
- Docker Compose 2.20+
- kubectl 1.28+ (for Kubernetes)
- Node.js 18+ (for local development)
- Git

### Required Credentials
- GitHub Personal Access Token (for CI/CD)
- Container registry credentials
- Cloud provider credentials (AWS/GCP/Azure)
- API keys for AI services (stored in secrets)

### System Requirements

**Minimum (Development)**
- CPU: 2 cores
- RAM: 4 GB
- Disk: 20 GB

**Recommended (Production)**
- CPU: 8 cores
- RAM: 16 GB
- Disk: 100 GB SSD

---

## Docker Deployment

### Quick Start

1. **Clone the repository**
```bash
git clone https://github.com/your-org/ish-automation.git
cd ish-automation
```

2. **Configure environment**
```bash
cp .env.example .env
# Edit .env with your configuration
nano .env
```

3. **Build and start services**
```bash
docker-compose up -d
```

4. **Verify deployment**
```bash
docker-compose ps
curl http://localhost:3000/health
curl http://localhost:3001/health
curl http://localhost:3002/health
```

### Production Deployment with Docker Compose

1. **Set production environment**
```bash
export NODE_ENV=production
source config/environments/production.env
```

2. **Build optimized images**
```bash
docker-compose -f docker-compose.yml build --no-cache
```

3. **Deploy with resource limits**
```bash
docker-compose up -d
```

4. **Monitor logs**
```bash
docker-compose logs -f api web pwa
```

### Docker Commands Reference

```bash
# View logs
docker-compose logs -f [service]

# Restart service
docker-compose restart [service]

# Scale services
docker-compose up -d --scale api=3

# Stop all services
docker-compose down

# Remove volumes (careful!)
docker-compose down -v

# View resource usage
docker stats
```

---

## Kubernetes Deployment

### Setup Kubernetes Cluster

1. **Create namespace**
```bash
kubectl apply -f k8s/namespace.yaml
```

2. **Create secrets**
```bash
# From .env file
kubectl create secret generic ish-api-secrets \
  --from-env-file=.env \
  -n ish-automation

# Or individual secrets
kubectl create secret generic ish-api-secrets \
  --from-literal=OPENAI_API_KEY=sk-xxx \
  --from-literal=POSTGRES_PASSWORD=xxx \
  -n ish-automation
```

3. **Deploy ConfigMaps**
```bash
kubectl apply -f k8s/configmap.yaml
```

4. **Deploy services**
```bash
kubectl apply -f k8s/deployment.yaml
kubectl apply -f k8s/service.yaml
kubectl apply -f k8s/ingress.yaml
kubectl apply -f k8s/hpa.yaml
```

5. **Verify deployment**
```bash
kubectl get pods -n ish-automation
kubectl get services -n ish-automation
kubectl get ingress -n ish-automation
```

### Production Deployment Steps

```bash
# 1. Apply all configurations
kubectl apply -f k8s/

# 2. Wait for rollout
kubectl rollout status deployment/ish-api -n ish-automation

# 3. Check pod status
kubectl get pods -n ish-automation -w

# 4. Verify health
kubectl exec -n ish-automation deployment/ish-api -- \
  wget -q -O- http://localhost:3000/health

# 5. Check logs
kubectl logs -f deployment/ish-api -n ish-automation
```

### Blue-Green Deployment

```bash
# Deploy new version
./deploy/blue-green-deploy.sh production v1.2.0

# The script will:
# 1. Deploy new version (green)
# 2. Run health checks
# 3. Switch traffic to new version
# 4. Remove old version (blue)
```

---

## CI/CD Pipeline

### GitHub Actions Workflow

The CI/CD pipeline is defined in `.github/workflows/deploy.yml` and runs automatically on:
- Push to `main` → Production deployment
- Push to `staging` → Staging deployment
- Push to `develop` → Development deployment
- Pull requests → Testing only

### Pipeline Stages

1. **Test**: Run unit and integration tests
2. **Security**: npm audit and Trivy scanning
3. **Build**: Build Docker images
4. **Deploy-Dev**: Deploy to development (auto)
5. **Deploy-Staging**: Deploy to staging (auto)
6. **Deploy-Prod**: Deploy to production (requires approval)
7. **Rollback**: Automatic rollback on failure

### Required GitHub Secrets

```bash
KUBE_CONFIG_DEV       # Base64 encoded kubeconfig for dev
KUBE_CONFIG_STAGING   # Base64 encoded kubeconfig for staging
KUBE_CONFIG_PROD      # Base64 encoded kubeconfig for production
SLACK_WEBHOOK         # Slack webhook for notifications
GITHUB_TOKEN          # Auto-generated by GitHub
```

### Manual Deployment Trigger

```bash
# Via GitHub UI: Actions → Deploy ISH Automation → Run workflow

# Or via GitHub CLI:
gh workflow run deploy.yml \
  -f environment=production
```

---

## Environment Configuration

### Environment Files

Three environment configurations are provided:
- `config/environments/development.env`
- `config/environments/staging.env`
- `config/environments/production.env`

### Configuration Hierarchy

1. Default values (in code)
2. Environment-specific file
3. `.env` file (local overrides)
4. Environment variables (highest priority)

### Feature Flags

Feature flags are managed in `config/feature-flags.yml`:

```yaml
feature_flags:
  browser_automation:
    platforms:
      huggingchat: true    # Working reliably
      perplexity: false    # Currently disabled
      duckduckgo: false    # Currently disabled
```

### Secrets Management

**Development**: Use `.env` file
**Production**: Use Kubernetes secrets or cloud secret managers

```bash
# Create from file
kubectl create secret generic ish-api-secrets \
  --from-env-file=.env.production \
  -n ish-automation

# Create from cloud secret manager (AWS)
kubectl create secret generic ish-api-secrets \
  --from-literal=OPENAI_API_KEY=$(aws secretsmanager get-secret-value \
    --secret-id prod/ish/openai-key --query SecretString --output text) \
  -n ish-automation
```

---

## Monitoring & Observability

### Accessing Monitoring Tools

- **Prometheus**: http://localhost:9090
- **Grafana**: http://localhost:3003 (admin/admin)
- **Metrics**: http://localhost:3000/metrics

### Grafana Dashboards

1. **System Overview**: Overall health and performance
2. **API Metrics**: Request rates, errors, latency
3. **Resource Usage**: CPU, memory, disk
4. **Business Metrics**: Queries, platforms, response times

### Key Metrics to Monitor

```
# Request rate
rate(http_requests_total[5m])

# Error rate
rate(http_requests_total{status=~"5.."}[5m])

# Response time (95th percentile)
histogram_quantile(0.95, rate(http_request_duration_seconds_bucket[5m]))

# Service health
up{job=~"ish-.*"}

# Circuit breaker state
circuit_breaker_state
```

### Alerting

Alerts are configured in `deploy/prometheus/alerts.yml`:
- High error rate
- Service down
- High response time
- High CPU/memory usage
- Database connection issues

Alerts are sent to:
- Slack (via webhook)
- PagerDuty (for critical alerts)
- Email (for warnings)

---

## Troubleshooting

### Common Issues

#### 1. Service Won't Start

```bash
# Check logs
docker-compose logs api
kubectl logs deployment/ish-api -n ish-automation

# Check resource constraints
docker stats
kubectl top pods -n ish-automation

# Verify configuration
docker-compose config
kubectl get configmap -n ish-automation -o yaml
```

#### 2. Database Connection Failed

```bash
# Test connection
docker exec ish-api node -e "require('pg').Client({...}).connect()"

# Check PostgreSQL logs
docker-compose logs postgres
kubectl logs deployment/ish-postgres -n ish-automation

# Verify credentials
echo $POSTGRES_PASSWORD
kubectl get secret ish-api-secrets -n ish-automation -o yaml
```

#### 3. High Memory Usage

```bash
# Restart service
docker-compose restart api
kubectl rollout restart deployment/ish-api -n ish-automation

# Adjust resource limits
# Edit docker-compose.yml or k8s/deployment.yaml
```

#### 4. Health Check Failing

```bash
# Test health endpoint
curl -v http://localhost:3000/health

# Check application logs
docker-compose logs -f api

# Verify dependencies
curl http://localhost:5432  # PostgreSQL
curl http://localhost:6379  # Redis
```

### Debug Mode

Enable debug logging:

```bash
# Docker
docker-compose -f docker-compose.yml \
  -e LOG_LEVEL=debug up -d api

# Kubernetes
kubectl set env deployment/ish-api LOG_LEVEL=debug -n ish-automation
```

---

## Rollback Procedures

### Automatic Rollback

The CI/CD pipeline automatically rolls back failed deployments.

### Manual Rollback (Kubernetes)

```bash
# Option 1: Using rollback script
./deploy/rollback.sh production

# Option 2: Using kubectl
kubectl rollout undo deployment/ish-api -n ish-automation
kubectl rollout undo deployment/ish-web -n ish-automation
kubectl rollout undo deployment/ish-pwa -n ish-automation

# Verify rollback
kubectl rollout status deployment/ish-api -n ish-automation
```

### Manual Rollback (Docker)

```bash
# Option 1: Restore from backup
./deploy/restore-backup.sh production 20251021_120000

# Option 2: Deploy previous version
export IMAGE_VERSION=v1.1.0
docker-compose up -d

# Verify
docker-compose ps
curl http://localhost:3000/health
```

### Database Rollback

```bash
# Restore from backup
./deploy/restore-database.sh production 20251021_120000

# Or manually
docker exec -i ish-postgres psql -U ish_user ish_automation < backup.sql
```

---

## Production Deployment Checklist

### Pre-Deployment

- [ ] All tests passing
- [ ] Security scan completed
- [ ] Backup created
- [ ] Maintenance window scheduled
- [ ] Team notified
- [ ] Rollback plan ready

### Deployment

- [ ] Deploy to staging first
- [ ] Run smoke tests
- [ ] Monitor error rates
- [ ] Verify health checks
- [ ] Check resource usage
- [ ] Test critical workflows

### Post-Deployment

- [ ] Verify all services healthy
- [ ] Check monitoring dashboards
- [ ] Review error logs
- [ ] Test API endpoints
- [ ] Verify database connections
- [ ] Document deployment
- [ ] Notify team of completion

---

## Support

For issues or questions:
- GitHub Issues: https://github.com/your-org/ish-automation/issues
- Documentation: See README.md
- Team Slack: #ish-automation

## Additional Resources

- [Architecture Documentation](ARCHITECTURE_VISUAL.md)
- [API Documentation](API-DOCUMENTATION.md)
- [Monitoring Guide](MONITORING-REPORT.md)
- [Quick Start Guide](GETTING-STARTED.md)
