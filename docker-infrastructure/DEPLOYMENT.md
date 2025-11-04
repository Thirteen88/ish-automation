# ISH Chat Deployment Guide

This guide provides step-by-step instructions for deploying the ISH Chat Docker infrastructure in different environments.

## 📋 Deployment Checklist

### Pre-deployment Requirements

- [ ] Docker 24.0+ and Docker Compose 2.0+ installed
- [ ] System meets minimum requirements (16GB RAM, 50GB disk)
- [ ] SSL certificates obtained (for production)
- [ ] Domain names configured and pointing to server
- [ ] Firewall rules configured
- [ ] Backup strategy in place
- [ ] Monitoring and alerting configured

### Security Requirements

- [ ] All API keys and passwords generated
- [ ] Secret files created and secured
- [ ] SSL/TLS certificates valid
- [ ] Network access properly restricted
- [ ] Security headers configured
- [ ] Rate limiting rules defined

## 🚀 Production Deployment

### 1. Server Preparation

```bash
# Update system packages
sudo apt update && sudo apt upgrade -y

# Install Docker and Docker Compose
curl -fsSL https://get.docker.com -o get-docker.sh
sudo sh get-docker.sh
sudo usermod -aG docker $USER

# Install Docker Compose
sudo curl -L "https://github.com/docker/compose/releases/latest/download/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose
sudo chmod +x /usr/local/bin/docker-compose

# Configure firewall
sudo ufw allow 22/tcp
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw enable
```

### 2. Application Deployment

```bash
# Clone repository
git clone <repository-url>
cd multi-model-orchestrator/ish-chat-backend/docker-infrastructure

# Create production environment file
cp config/production.env .env

# Setup secrets
cd secrets
cp postgres_password.txt.template postgres_password.txt
cp redis_password.txt.template redis_password.txt
cp zai_api_key.txt.template zai_api_key.txt
cp openai_api_key.txt.template openai_api_key.txt
cp anthropic_api_key.txt.template anthropic_api_key.txt

# Edit secrets with actual values
nano postgres_password.txt
nano redis_password.txt
nano zai_api_key.txt
nano openai_api_key.txt
nano anthropic_api_key.txt
```

### 3. SSL Configuration

```bash
# Using Let's Encrypt (recommended)
sudo apt install certbot
sudo certbot certonly --standalone -d your-domain.com -d www.your-domain.com

# Copy certificates
sudo cp /etc/letsencrypt/live/your-domain.com/fullchain.pem load-balancer/ssl/cert.pem
sudo cp /etc/letsencrypt/live/your-domain.com/privkey.pem load-balancer/ssl/key.pem

# Set permissions
sudo chown $USER:$USER load-balancer/ssl/*
chmod 600 load-balancer/ssl/key.pem
```

### 4. Configuration Updates

Edit `.env` file:
```bash
nano .env
```

Update the following values:
- `POSTGRES_PASSWORD`: Set strong password
- `REDIS_PASSWORD`: Set strong password
- Update domain names in nginx.conf
- Set appropriate resource limits
- Configure monitoring endpoints

### 5. Application Deployment

```bash
# Build and deploy
docker-compose down
docker-compose build --no-cache
docker-compose up -d

# Verify deployment
docker-compose ps
docker-compose logs -f

# Test health endpoint
curl -k https://your-domain.com/health
```

### 6. Post-deployment Verification

```bash
# Check all services are healthy
docker-compose exec ish-chat-app-1 python health_check.py --app main
docker-compose exec zai-provider python health_check.py --provider zai

# Test database connectivity
docker-compose exec postgres-primary psql -U ishchat -d ish_chat -c "SELECT version();"

# Test Redis connectivity
docker-compose exec redis redis-cli ping

# Verify monitoring
curl http://localhost:3000  # Grafana
curl http://localhost:9090  # Prometheus
```

## 🧪 Staging Deployment

### 1. Staging Environment Setup

```bash
# Create staging directory
mkdir -p /opt/ish-chat-staging
cd /opt/ish-chat-staging

# Clone repository
git clone <repository-url> .
cd docker-infrastructure

# Use staging configuration
cp config/staging.env .env

# Setup secrets (can use test credentials)
cd secrets
# ... copy and edit secret files as needed
```

### 2. Deploy Staging

```bash
# Deploy with staging overrides
docker-compose -f docker-compose.yml -f docker-compose.staging.yml up -d

# Verify staging deployment
docker-compose ps
curl http://localhost:8000/health
```

## 🔧 Development Deployment

### 1. Local Development Setup

```bash
# Clone repository
git clone <repository-url>
cd multi-model-orchestrator/ish-chat-backend/docker-infrastructure

# Use development configuration
cp config/development.env .env

# Start services (without SSL)
docker-compose -f docker-compose.yml -f docker-compose.dev.yml up -d
```

### 2. Development Tools

```bash
# Enable hot reloading
docker-compose -f docker-compose.yml -f docker-compose.dev.yml up

# View logs in real-time
docker-compose logs -f ish-chat-app-1

# Access services
# Application: http://localhost:8000
# Grafana: http://localhost:3000
# Prometheus: http://localhost:9090
```

## 🚨 Production Deployment Issues

### Common Problems and Solutions

#### 1. SSL Certificate Issues

```bash
# Problem: Certificate not found
# Solution: Check certificate paths and permissions
ls -la load-balancer/ssl/
docker-compose exec nginx-lb ls -la /etc/nginx/ssl/

# Test nginx configuration
docker-compose exec nginx-lb nginx -t
```

#### 2. Database Connection Issues

```bash
# Problem: Can't connect to database
# Solution: Check database status and credentials
docker-compose exec postgres-primary pg_isready
docker-compose logs postgres-primary

# Test connection manually
docker-compose exec ish-chat-app-1 python -c "
import psycopg2
conn = psycopg2.connect('postgresql://ishchat:password@postgres-primary:5432/ish_chat')
print('Database connection successful')
"
```

#### 3. High Memory Usage

```bash
# Problem: Out of memory errors
# Solution: Check resource usage and adjust limits
docker stats

# Adjust memory limits in docker-compose.yml
# Edit deploy.resources.limits.memory
```

#### 4. Service Startup Issues

```bash
# Problem: Services failing to start
# Solution: Check dependencies and logs
docker-compose logs [service-name]

# Check service dependencies
docker-compose exec [service-name] python health_check.py
```

## 🔄 Blue-Green Deployment

### 1. Blue Environment (Current)

```bash
# Tag current version as blue
docker-compose -f docker-compose.yml -f docker-compose.blue.yml up -d
```

### 2. Green Environment (New)

```bash
# Deploy new version as green
docker-compose -f docker-compose.yml -f docker-compose.green.yml up -d

# Test green environment
curl http://green.your-domain.com/health
```

### 3. Switch Traffic

```bash
# Update load balancer to point to green
# Update DNS or load balancer configuration

# Monitor green environment
docker-compose logs -f green-app

# Switch back if issues arise
```

## 📊 Monitoring and Alerting

### 1. Prometheus Configuration

```bash
# Verify Prometheus targets
curl http://localhost:9090/api/v1/targets

# Check alert rules
curl http://localhost:9090/api/v1/rules
```

### 2. Grafana Dashboards

```bash
# Access Grafana
# URL: http://localhost:3000
# Username: admin
# Password: admin123

# Import dashboards
# 1. Go to Dashboard -> Import
# 2. Upload dashboard JSON files
# 3. Configure data sources
```

### 3. Alert Setup

```bash
# Configure alertmanager
# Edit monitoring/alertmanager.yml

# Test alerts
curl -X POST http://localhost:9093/api/v1/alerts
```

## 🔒 Security Hardening

### 1. Container Security

```bash
# Scan images for vulnerabilities
docker scan ish-chat-app:latest

# Use non-root containers
# Verify user in Dockerfile
docker-compose exec ish-chat-app-1 whoami
```

### 2. Network Security

```bash
# Configure firewall rules
sudo ufw deny 5432/tcp  # PostgreSQL
sudo ufw deny 6379/tcp  # Redis
sudo ufw deny 9090/tcp  # Prometheus (internal only)

# Allow only necessary ports
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw allow 22/tcp
```

### 3. Secret Management

```bash
# Verify secret files permissions
ls -la secrets/
chmod 600 secrets/*.txt

# Rotate secrets regularly
# Update API keys and passwords
# Restart services with new secrets
docker-compose up -d
```

## 📈 Performance Optimization

### 1. Database Optimization

```bash
# Tune PostgreSQL configuration
# Edit database/postgres-primary.conf
# Adjust shared_buffers, work_mem, etc.

# Monitor slow queries
docker-compose exec postgres-primary psql -U ishchat -d ish_chat -c "
SELECT query, mean_time, calls
FROM pg_stat_statements
ORDER BY mean_time DESC
LIMIT 10;
"
```

### 2. Redis Optimization

```bash
# Monitor Redis performance
docker-compose exec redis redis-cli info stats

# Adjust memory policies
# Edit redis configuration in docker-compose.yml
```

### 3. Application Optimization

```bash
# Tune worker processes
# Edit main-app.Dockerfile CMD instruction

# Monitor application metrics
curl http://localhost:9010/metrics
```

## 🔄 Maintenance and Updates

### 1. Rolling Updates

```bash
# Update one instance at a time
docker-compose up -d --no-deps ish-chat-app-1
# Wait for health check
docker-compose up -d --no-deps ish-chat-app-2
```

### 2. Database Updates

```bash
# Backup before updates
docker-compose exec postgres-primary pg_dump -U ishchat ish_chat > backup.sql

# Apply migrations
docker-compose exec ish-chat-app-1 python manage.py migrate
```

### 3. Certificate Renewal

```bash
# Auto-renew Let's Encrypt certificates
sudo crontab -e
# Add: 0 12 * * * /usr/bin/certbot renew --quiet

# Reload nginx after renewal
docker-compose exec nginx-lb nginx -s reload
```

## 📞 Emergency Procedures

### 1. Service Recovery

```bash
# Restart specific service
docker-compose restart [service-name]

# Full system restart
docker-compose down
docker-compose up -d
```

### 2. Data Recovery

```bash
# Restore database from backup
docker-compose exec -T postgres-primary psql -U ishchat ish_chat < backup.sql

# Restore volumes
docker run --rm -v backup-volume:/backup -v data-volume:/data ubuntu tar xvf /backup/data.tar
```

### 3. Disaster Recovery

```bash
# Deploy to backup server
# Follow deployment steps on backup infrastructure

# Update DNS to point to backup server
# Monitor traffic and performance
```

## 📋 Deployment Checklist Summary

### Before Deployment
- [ ] Infrastructure requirements verified
- [ ] Security configurations applied
- [ ] SSL certificates obtained
- [ ] Database backups created
- [ ] Monitoring configured
- [ ] Rollback plan prepared

### During Deployment
- [ ] Services deployed sequentially
- [ ] Health checks passing
- [ ] Monitoring dashboards active
- [ ] Load balancer functioning
- [ ] SSL/TLS working
- [ ] API endpoints responding

### After Deployment
- [ ] Full system verification
- [ ] Performance benchmarks met
- [ ] Monitoring alerts configured
- [ ] Documentation updated
- [ ] Team training completed
- [ ] Support procedures documented