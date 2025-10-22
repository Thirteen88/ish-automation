# Production Deployment Guide

This guide covers deploying the ISH AI Orchestrator API service in production environments.

## Table of Contents

1. [Prerequisites](#prerequisites)
2. [Deployment Options](#deployment-options)
3. [Docker Deployment](#docker-deployment)
4. [Kubernetes Deployment](#kubernetes-deployment)
5. [PM2 Deployment](#pm2-deployment)
6. [Nginx Configuration](#nginx-configuration)
7. [Security Hardening](#security-hardening)
8. [Monitoring & Logging](#monitoring--logging)
9. [Scaling](#scaling)

## Prerequisites

- Node.js 18+ or Docker
- Reverse proxy (Nginx/Apache)
- SSL certificate
- Domain name
- Firewall configured

## Deployment Options

### Option 1: Docker (Recommended)

Most portable and easiest to deploy.

**Pros:**
- Consistent environment
- Easy to scale
- Isolated dependencies
- Simple rollbacks

**Cons:**
- Slightly more resource usage
- Requires Docker knowledge

### Option 2: PM2 (Node.js)

Good for traditional VPS deployments.

**Pros:**
- Native Node.js performance
- Built-in monitoring
- Easy clustering
- Low overhead

**Cons:**
- Manual dependency management
- Environment-specific issues

### Option 3: Kubernetes

Best for large-scale deployments.

**Pros:**
- Auto-scaling
- Self-healing
- Load balancing
- Rolling updates

**Cons:**
- Complex setup
- Higher learning curve
- Resource overhead

## Docker Deployment

### 1. Create Dockerfile

```dockerfile
FROM node:18-alpine

# Create app directory
WORKDIR /app

# Install dependencies
COPY package*.json ./
RUN npm ci --production

# Copy application
COPY . .

# Create non-root user
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001

# Change ownership
RUN chown -R nodejs:nodejs /app

# Switch to non-root user
USER nodejs

# Expose port
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3000/health', (r) => {process.exit(r.statusCode === 200 ? 0 : 1)})"

# Start application
CMD ["npm", "start"]
```

### 2. Create docker-compose.yml

```yaml
version: '3.8'

services:
  api:
    build: .
    container_name: ish-api-service
    restart: unless-stopped
    ports:
      - "3000:3000"
    environment:
      - NODE_ENV=production
      - PORT=3000
      - HOST=0.0.0.0
    env_file:
      - .env
    volumes:
      - ./logs:/app/logs
      - ./data:/app/data
    networks:
      - ish-network
    healthcheck:
      test: ["CMD", "wget", "--quiet", "--tries=1", "--spider", "http://localhost:3000/health"]
      interval: 30s
      timeout: 10s
      retries: 3
      start_period: 40s

  # Optional: Redis for shared caching
  redis:
    image: redis:7-alpine
    container_name: ish-redis
    restart: unless-stopped
    ports:
      - "6379:6379"
    volumes:
      - redis-data:/data
    networks:
      - ish-network

  # Optional: Nginx reverse proxy
  nginx:
    image: nginx:alpine
    container_name: ish-nginx
    restart: unless-stopped
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./nginx.conf:/etc/nginx/nginx.conf:ro
      - ./ssl:/etc/nginx/ssl:ro
    depends_on:
      - api
    networks:
      - ish-network

networks:
  ish-network:
    driver: bridge

volumes:
  redis-data:
```

### 3. Build and Deploy

```bash
# Build image
docker-compose build

# Start services
docker-compose up -d

# View logs
docker-compose logs -f api

# Scale services
docker-compose up -d --scale api=3

# Stop services
docker-compose down
```

### 4. Update Deployment

```bash
# Pull latest changes
git pull

# Rebuild and restart
docker-compose up -d --build

# Zero-downtime update (with multiple instances)
docker-compose up -d --scale api=2 --no-recreate
docker-compose up -d --scale api=3 --force-recreate
```

## Kubernetes Deployment

### 1. Create deployment.yaml

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: ish-api-service
  labels:
    app: ish-api
spec:
  replicas: 3
  selector:
    matchLabels:
      app: ish-api
  template:
    metadata:
      labels:
        app: ish-api
    spec:
      containers:
      - name: api
        image: your-registry/ish-api-service:latest
        ports:
        - containerPort: 3000
        env:
        - name: NODE_ENV
          value: "production"
        - name: PORT
          value: "3000"
        envFrom:
        - secretRef:
            name: ish-api-secrets
        resources:
          requests:
            memory: "256Mi"
            cpu: "250m"
          limits:
            memory: "512Mi"
            cpu: "500m"
        livenessProbe:
          httpGet:
            path: /health
            port: 3000
          initialDelaySeconds: 30
          periodSeconds: 10
        readinessProbe:
          httpGet:
            path: /health
            port: 3000
          initialDelaySeconds: 5
          periodSeconds: 5
---
apiVersion: v1
kind: Service
metadata:
  name: ish-api-service
spec:
  selector:
    app: ish-api
  ports:
  - protocol: TCP
    port: 80
    targetPort: 3000
  type: LoadBalancer
---
apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata:
  name: ish-api-hpa
spec:
  scaleTargetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: ish-api-service
  minReplicas: 2
  maxReplicas: 10
  metrics:
  - type: Resource
    resource:
      name: cpu
      target:
        type: Utilization
        averageUtilization: 70
  - type: Resource
    resource:
      name: memory
      target:
        type: Utilization
        averageUtilization: 80
```

### 2. Deploy to Kubernetes

```bash
# Create secrets
kubectl create secret generic ish-api-secrets \
  --from-env-file=.env

# Deploy application
kubectl apply -f deployment.yaml

# Check status
kubectl get pods
kubectl get services

# View logs
kubectl logs -f deployment/ish-api-service

# Scale manually
kubectl scale deployment/ish-api-service --replicas=5
```

## PM2 Deployment

### 1. Install PM2

```bash
npm install -g pm2
```

### 2. Create ecosystem.config.js

```javascript
module.exports = {
  apps: [{
    name: 'ish-api-service',
    script: 'server.js',
    instances: 'max',
    exec_mode: 'cluster',
    env: {
      NODE_ENV: 'production',
      PORT: 3000
    },
    error_file: './logs/err.log',
    out_file: './logs/out.log',
    log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
    merge_logs: true,
    autorestart: true,
    max_restarts: 10,
    min_uptime: '10s',
    max_memory_restart: '500M',
    watch: false,
    ignore_watch: ['node_modules', 'logs', 'data'],
  }]
};
```

### 3. Deploy with PM2

```bash
# Start application
pm2 start ecosystem.config.js

# View status
pm2 status

# View logs
pm2 logs

# Monitor
pm2 monit

# Restart
pm2 restart ish-api-service

# Stop
pm2 stop ish-api-service

# Delete
pm2 delete ish-api-service

# Save configuration
pm2 save

# Setup startup script
pm2 startup
```

## Nginx Configuration

### 1. Create nginx.conf

```nginx
upstream ish_api {
    least_conn;
    server localhost:3000;
    # Add more servers for load balancing
    # server localhost:3001;
    # server localhost:3002;
}

# Rate limiting
limit_req_zone $binary_remote_addr zone=api_limit:10m rate=10r/s;

server {
    listen 80;
    server_name api.yourdomain.com;

    # Redirect to HTTPS
    return 301 https://$server_name$request_uri;
}

server {
    listen 443 ssl http2;
    server_name api.yourdomain.com;

    # SSL Configuration
    ssl_certificate /etc/nginx/ssl/cert.pem;
    ssl_certificate_key /etc/nginx/ssl/key.pem;
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers HIGH:!aNULL:!MD5;
    ssl_prefer_server_ciphers on;

    # Security Headers
    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-XSS-Protection "1; mode=block" always;

    # Logging
    access_log /var/log/nginx/ish-api-access.log;
    error_log /var/log/nginx/ish-api-error.log;

    # Client body size
    client_max_body_size 10M;

    # Gzip
    gzip on;
    gzip_types text/plain text/css application/json application/javascript text/xml application/xml application/xml+rss text/javascript;

    location / {
        # Rate limiting
        limit_req zone=api_limit burst=20 nodelay;

        # Proxy settings
        proxy_pass http://ish_api;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;

        # Timeouts
        proxy_connect_timeout 60s;
        proxy_send_timeout 60s;
        proxy_read_timeout 60s;
    }

    # SSE streaming endpoint
    location ~ ^/v1/query/.*/stream$ {
        proxy_pass http://ish_api;
        proxy_http_version 1.1;
        proxy_set_header Connection '';
        proxy_buffering off;
        proxy_cache off;
        chunked_transfer_encoding off;
    }
}
```

### 2. Enable Configuration

```bash
# Test configuration
sudo nginx -t

# Reload Nginx
sudo systemctl reload nginx
```

## Security Hardening

### 1. Environment Variables

Never commit sensitive data. Use environment variables:

```bash
# Production .env
NODE_ENV=production
API_KEYS=secure-random-key-1,secure-random-key-2
JWT_SECRET=use-a-long-random-string
ALLOWED_ORIGINS=https://yourdomain.com
```

### 2. Firewall Rules

```bash
# Allow only necessary ports
sudo ufw allow 22/tcp    # SSH
sudo ufw allow 80/tcp    # HTTP
sudo ufw allow 443/tcp   # HTTPS
sudo ufw enable
```

### 3. SSL/TLS Certificate

Use Let's Encrypt:

```bash
sudo apt install certbot python3-certbot-nginx
sudo certbot --nginx -d api.yourdomain.com
```

### 4. API Key Rotation

Regularly rotate API keys:

```bash
# Generate new key
NEW_KEY=$(openssl rand -hex 32)

# Update .env
# Notify clients
# Remove old key after grace period
```

## Monitoring & Logging

### 1. Application Monitoring

Use PM2 monitoring:

```bash
pm2 install pm2-logrotate
pm2 set pm2-logrotate:max_size 10M
pm2 set pm2-logrotate:retain 30
```

### 2. External Monitoring

- **Uptime**: Use UptimeRobot, Pingdom
- **APM**: Use New Relic, DataDog
- **Logs**: Use Logstash, Papertrail

### 3. Health Check Monitoring

```bash
# Simple cron job
*/5 * * * * curl -f http://localhost:3000/health || echo "API down" | mail -s "Alert" admin@example.com
```

## Scaling

### Horizontal Scaling

1. **Load Balancer**: Distribute across multiple instances
2. **Session Store**: Use Redis for shared sessions
3. **Database**: Use external database (MongoDB, PostgreSQL)
4. **Cache**: Use Redis for shared caching

### Vertical Scaling

1. **CPU**: Increase cores for PM2 clustering
2. **Memory**: Increase RAM for larger caches
3. **Disk**: SSD for faster I/O

### Auto-scaling

Use Kubernetes HPA or cloud auto-scaling:

```yaml
# AWS Auto Scaling Group
# GCP Managed Instance Groups
# Azure VM Scale Sets
```

## Backup & Recovery

### 1. Database Backups

```bash
# Automated daily backups
0 2 * * * /usr/local/bin/backup-script.sh
```

### 2. Configuration Backups

```bash
# Backup .env and config files
tar -czf backup-$(date +%Y%m%d).tar.gz .env config/
```

### 3. Disaster Recovery

- Document recovery procedures
- Test restoration regularly
- Keep off-site backups

## Performance Optimization

1. **Enable caching**: Use Redis
2. **Enable compression**: Gzip in Nginx
3. **CDN**: For static assets
4. **Database indexing**: For faster queries
5. **Connection pooling**: For database connections

## Troubleshooting

### Check Logs

```bash
# PM2 logs
pm2 logs

# Docker logs
docker-compose logs -f

# System logs
journalctl -u ish-api-service
```

### Common Issues

1. **Port already in use**: Change PORT in .env
2. **Permission denied**: Check file permissions
3. **Out of memory**: Increase memory limit
4. **SSL errors**: Check certificate validity

## Support

For production support, contact: support@ish-orchestrator.com
