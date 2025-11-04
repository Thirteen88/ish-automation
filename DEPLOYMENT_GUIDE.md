# ISH Chat Instance Manager Deployment Guide

## Overview

This guide provides comprehensive instructions for deploying the ISH Chat Instance Manager in various environments, from development to production.

## Prerequisites

### System Requirements

- **CPU**: 2+ cores (4+ recommended for production)
- **Memory**: 4GB+ RAM (8GB+ recommended for production)
- **Storage**: 20GB+ available space
- **Network**: Reliable internet connection for AI provider APIs

### Software Requirements

- **Python**: 3.8 or higher
- **Database**: PostgreSQL 12+ (SQLite for development)
- **Redis**: 6.0+ (optional but recommended)
- **Docker**: 20.10+ (for containerized deployment)
- **Node.js**: 16+ (for frontend development)

### AI Provider Accounts

- **ZAI**: API key from Zhipu AI
- **OpenAI**: API key from OpenAI
- **Anthropic**: API key from Anthropic
- **Perplexity**: API key from Perplexity

## Environment Setup

### Development Environment

1. **Clone Repository**
   ```bash
   git clone <repository-url>
   cd ish-chat-backend
   ```

2. **Create Virtual Environment**
   ```bash
   python -m venv venv
   source venv/bin/activate  # Linux/Mac
   # venv\Scripts\activate  # Windows
   ```

3. **Install Dependencies**
   ```bash
   pip install -r requirements.txt
   pip install -r requirements-dev.txt  # Development dependencies
   ```

4. **Environment Configuration**
   ```bash
   cp .env.example .env
   # Edit .env with your configuration
   ```

5. **Database Setup**
   ```bash
   # For PostgreSQL
   createdb ish_chat
   
   # Run migrations
   python -m alembic upgrade head
   ```

6. **Redis Setup** (Optional)
   ```bash
   # Using Docker
   docker run -d --name redis -p 6379:6379 redis:6-alpine
   
   # Or install locally
   # Ubuntu/Debian: sudo apt-get install redis-server
   # macOS: brew install redis
   ```

### Production Environment

#### System Preparation

1. **Update System**
   ```bash
   sudo apt update && sudo apt upgrade -y  # Ubuntu/Debian
   # yum update -y  # CentOS/RHEL
   ```

2. **Install Required Packages**
   ```bash
   # Ubuntu/Debian
   sudo apt install -y python3 python3-pip python3-venv postgresql redis-server nginx
   
   # CentOS/RHEL
   sudo yum install -y python3 python3-pip postgresql-server redis nginx
   ```

3. **Create Application User**
   ```bash
   sudo useradd -m -s /bin/bash ishchat
   sudo usermod -aG sudo ishchat
   ```

#### Database Setup

1. **PostgreSQL Installation**
   ```bash
   # Ubuntu/Debian
   sudo apt install -y postgresql postgresql-contrib
   
   # Initialize database
   sudo postgresql-setup --initdb
   sudo systemctl start postgresql
   sudo systemctl enable postgresql
   ```

2. **Create Database and User**
   ```bash
   sudo -u postgres psql
   CREATE DATABASE ish_chat;
   CREATE USER ishchat_user WITH PASSWORD 'secure_password';
   GRANT ALL PRIVILEGES ON DATABASE ish_chat TO ishchat_user;
   \q
   ```

3. **Configure PostgreSQL**
   ```bash
   sudo nano /etc/postgresql/12/main/postgresql.conf
   # Edit: listen_addresses = 'localhost'
   
   sudo nano /etc/postgresql/12/main/pg_hba.conf
   # Add: local   ish_chat   ishchat_user   md5
   
   sudo systemctl restart postgresql
   ```

#### Redis Setup

1. **Install Redis**
   ```bash
   # Ubuntu/Debian
   sudo apt install -y redis-server
   
   # CentOS/RHEL
   sudo yum install -y redis
   ```

2. **Configure Redis**
   ```bash
   sudo nano /etc/redis/redis.conf
   # Edit: bind 127.0.0.1
   # Edit: requirepass your_redis_password
   
   sudo systemctl start redis
   sudo systemctl enable redis
   ```

## Application Deployment

### Option 1: Direct Deployment

1. **Deploy Application Code**
   ```bash
   # Clone repository
   cd /home/ishchat
   git clone <repository-url> .
   
   # Set up virtual environment
   python3 -m venv venv
   source venv/bin/activate
   pip install -r requirements.txt
   ```

2. **Configure Environment**
   ```bash
   cp .env.example .env
   nano .env
   ```

   Example `.env` file:
   ```bash
   # Database
   DATABASE_URL=postgresql://ishchat_user:secure_password@localhost/ish_chat
   
   # Redis
   REDIS_HOST=localhost
   REDIS_PORT=6379
   REDIS_PASSWORD=your_redis_password
   
   # Application
   ENVIRONMENT=production
   DEBUG=false
   LOG_LEVEL=INFO
   BACKEND_HOST=0.0.0.0
   BACKEND_PORT=8000
   BACKEND_API_KEY=your-secure-api-key
   
   # AI Providers
   ZAI_API_KEY=your-zai-key
   OPENAI_API_KEY=your-openai-key
   ANTHROPIC_API_KEY=your-anthropic-key
   
   # Monitoring
   ENABLE_METRICS=true
   METRICS_PORT=9090
   ```

3. **Run Database Migrations**
   ```bash
   # Create migration environment
   export DATABASE_URL=postgresql://ishchat_user:secure_password@localhost/ish_chat
   
   # Run migrations
   python -m alembic upgrade head
   ```

4. **Test Application**
   ```bash
   python src/main_instance_manager.py
   ```

5. **Create Systemd Service**
   ```bash
   sudo nano /etc/systemd/system/instance-manager.service
   ```

   ```ini
   [Unit]
   Description=ISH Chat Instance Manager
   After=network.target postgresql.service redis.service
   
   [Service]
   Type=simple
   User=ishchat
   WorkingDirectory=/home/ishchat
   Environment=PATH=/home/ishchat/venv/bin
   ExecStart=/home/ishchat/venv/bin/python src/main_instance_manager.py
   Restart=always
   RestartSec=10
   
   [Install]
   WantedBy=multi-user.target
   ```

   ```bash
   # Enable and start service
   sudo systemctl daemon-reload
   sudo systemctl enable instance-manager
   sudo systemctl start instance-manager
   sudo systemctl status instance-manager
   ```

### Option 2: Docker Deployment

1. **Create Dockerfile**
   ```dockerfile
   FROM python:3.9-slim
   
   # Install system dependencies
   RUN apt-get update && apt-get install -y \
       gcc \
       postgresql-client \
       && rm -rf /var/lib/apt/lists/*
   
   # Set working directory
   WORKDIR /app
   
   # Install Python dependencies
   COPY requirements.txt .
   RUN pip install --no-cache-dir -r requirements.txt
   
   # Copy application code
   COPY src/ ./src/
   COPY config/ ./config/
   COPY alembic/ ./alembic/
   COPY alembic.ini .
   
   # Create non-root user
   RUN useradd --create-home --shell /bin/bash app
   RUN chown -R app:app /app
   USER app
   
   # Expose ports
   EXPOSE 8000 9090
   
   # Health check
   HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
       CMD curl -f http://localhost:8000/health || exit 1
   
   # Start application
   CMD ["python", "src/main_instance_manager.py"]
   ```

2. **Create Docker Compose File**
   ```yaml
   version: '3.8'
   
   services:
     postgres:
       image: postgres:13
       environment:
         POSTGRES_DB: ish_chat
         POSTGRES_USER: ishchat_user
         POSTGRES_PASSWORD: secure_password
       volumes:
         - postgres_data:/var/lib/postgresql/data
       ports:
         - "5432:5432"
       healthcheck:
         test: ["CMD-SHELL", "pg_isready -U ishchat_user -d ish_chat"]
         interval: 30s
         timeout: 10s
         retries: 3
   
     redis:
       image: redis:6-alpine
       command: redis-server --requirepass your_redis_password
       ports:
         - "6379:6379"
       volumes:
         - redis_data:/data
       healthcheck:
         test: ["CMD", "redis-cli", "--raw", "incr", "ping"]
         interval: 30s
         timeout: 10s
         retries: 3
   
     instance-manager:
       build: .
       ports:
         - "8000:8000"
         - "9090:9090"
       environment:
         DATABASE_URL: postgresql://ishchat_user:secure_password@postgres:5432/ish_chat
         REDIS_HOST: redis
         REDIS_PORT: 6379
         REDIS_PASSWORD: your_redis_password
         ENVIRONMENT: production
         DEBUG: false
       depends_on:
         postgres:
           condition: service_healthy
         redis:
           condition: service_healthy
       healthcheck:
         test: ["CMD", "curl", "-f", "http://localhost:8000/health"]
         interval: 30s
         timeout: 10s
         retries: 3
       restart: unless-stopped
   
     nginx:
       image: nginx:alpine
       ports:
         - "80:80"
         - "443:443"
       volumes:
         - ./nginx.conf:/etc/nginx/nginx.conf
         - ./ssl:/etc/nginx/ssl
       depends_on:
         - instance-manager
       restart: unless-stopped
   
   volumes:
     postgres_data:
     redis_data:
   ```

3. **Deploy with Docker Compose**
   ```bash
   # Build and start services
   docker-compose up -d --build
   
   # Run database migrations
   docker-compose exec instance-manager python -m alembic upgrade head
   
   # Check logs
   docker-compose logs -f instance-manager
   
   # Check service status
   docker-compose ps
   ```

### Option 3: Kubernetes Deployment

1. **Create Namespace**
   ```yaml
   # namespace.yaml
   apiVersion: v1
   kind: Namespace
   metadata:
     name: ish-chat
   ```

2. **Create ConfigMap**
   ```yaml
   # configmap.yaml
   apiVersion: v1
   kind: ConfigMap
   metadata:
     name: instance-manager-config
     namespace: ish-chat
   data:
     ENVIRONMENT: "production"
     DEBUG: "false"
     LOG_LEVEL: "INFO"
     BACKEND_HOST: "0.0.0.0"
     BACKEND_PORT: "8000"
     ENABLE_METRICS: "true"
     METRICS_PORT: "9090"
   ```

3. **Create Secret**
   ```yaml
   # secret.yaml
   apiVersion: v1
   kind: Secret
   metadata:
     name: instance-manager-secrets
     namespace: ish-chat
   type: Opaque
   data:
     DATABASE_URL: <base64-encoded-database-url>
     REDIS_PASSWORD: <base64-encoded-redis-password>
     BACKEND_API_KEY: <base64-encoded-api-key>
     ZAI_API_KEY: <base64-encoded-zai-key>
     OPENAI_API_KEY: <base64-encoded-openai-key>
     ANTHROPIC_API_KEY: <base64-encoded-anthropic-key>
   ```

4. **Create Deployment**
   ```yaml
   # deployment.yaml
   apiVersion: apps/v1
   kind: Deployment
   metadata:
     name: instance-manager
     namespace: ish-chat
   spec:
     replicas: 3
     selector:
       matchLabels:
         app: instance-manager
     template:
       metadata:
         labels:
           app: instance-manager
       spec:
         containers:
         - name: instance-manager
           image: ish-chat-instance-manager:latest
           ports:
           - containerPort: 8000
             name: http
           - containerPort: 9090
             name: metrics
           envFrom:
           - configMapRef:
               name: instance-manager-config
           - secretRef:
               name: instance-manager-secrets
           resources:
             requests:
               memory: "512Mi"
               cpu: "250m"
             limits:
               memory: "1Gi"
               cpu: "500m"
           livenessProbe:
             httpGet:
               path: /health
               port: 8000
             initialDelaySeconds: 30
             periodSeconds: 10
             timeoutSeconds: 5
             failureThreshold: 3
           readinessProbe:
             httpGet:
               path: /health
               port: 8000
             initialDelaySeconds: 5
             periodSeconds: 5
             timeoutSeconds: 3
             failureThreshold: 3
   ```

5. **Create Service**
   ```yaml
   # service.yaml
   apiVersion: v1
   kind: Service
   metadata:
     name: instance-manager-service
     namespace: ish-chat
   spec:
     selector:
       app: instance-manager
     ports:
     - name: http
       port: 80
       targetPort: 8000
     - name: metrics
       port: 9090
       targetPort: 9090
     type: ClusterIP
   ```

6. **Create Ingress**
   ```yaml
   # ingress.yaml
   apiVersion: networking.k8s.io/v1
   kind: Ingress
   metadata:
     name: instance-manager-ingress
     namespace: ish-chat
     annotations:
       kubernetes.io/ingress.class: nginx
       cert-manager.io/cluster-issuer: letsencrypt-prod
       nginx.ingress.kubernetes.io/ssl-redirect: "true"
   spec:
     tls:
     - hosts:
       - api.yourdomain.com
       secretName: instance-manager-tls
     rules:
     - host: api.yourdomain.com
       http:
         paths:
         - path: /
           pathType: Prefix
           backend:
             service:
               name: instance-manager-service
               port:
                 number: 80
   ```

7. **Deploy to Kubernetes**
   ```bash
   # Apply all manifests
   kubectl apply -f namespace.yaml
   kubectl apply -f configmap.yaml
   kubectl apply -f secret.yaml
   kubectl apply -f deployment.yaml
   kubectl apply -f service.yaml
   kubectl apply -f ingress.yaml
   
   # Check deployment
   kubectl get pods -n ish-chat
   kubectl get services -n ish-chat
   kubectl get ingress -n ish-chat
   
   # Check logs
   kubectl logs -f deployment/instance-manager -n ish-chat
   ```

## Load Balancer Configuration

### Nginx Configuration

```nginx
# nginx.conf
events {
    worker_connections 1024;
}

http {
    upstream instance_manager {
        least_conn;
        server 127.0.0.1:8000 max_fails=3 fail_timeout=30s;
        # Add more instances for high availability
    }
    
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
        ssl_ciphers ECDHE-RSA-AES256-GCM-SHA512:DHE-RSA-AES256-GCM-SHA512:ECDHE-RSA-AES256-GCM-SHA384:DHE-RSA-AES256-GCM-SHA384;
        ssl_prefer_server_ciphers off;
        
        # Security Headers
        add_header X-Frame-Options DENY;
        add_header X-Content-Type-Options nosniff;
        add_header X-XSS-Protection "1; mode=block";
        add_header Strict-Transport-Security "max-age=63072000; includeSubDomains; preload";
        
        # Rate Limiting
        limit_req_zone $binary_remote_addr zone=api:10m rate=10r/s;
        
        location / {
            limit_req zone=api burst=20 nodelay;
            
            proxy_pass http://instance_manager;
            proxy_set_header Host $host;
            proxy_set_header X-Real-IP $remote_addr;
            proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
            proxy_set_header X-Forwarded-Proto $scheme;
            
            # Timeouts
            proxy_connect_timeout 30s;
            proxy_send_timeout 30s;
            proxy_read_timeout 30s;
        }
        
        # Health check endpoint (no rate limiting)
        location /health {
            proxy_pass http://instance_manager;
            proxy_set_header Host $host;
            access_log off;
        }
        
        # Metrics endpoint (restrict access)
        location /metrics {
            allow 127.0.0.1;
            allow 10.0.0.0/8;
            deny all;
            
            proxy_pass http://instance_manager:9090/metrics;
            proxy_set_header Host $host;
        }
    }
}
```

## Monitoring Setup

### Prometheus Configuration

```yaml
# prometheus.yml
global:
  scrape_interval: 15s
  evaluation_interval: 15s

rule_files:
  - "instance_manager_rules.yml"

scrape_configs:
  - job_name: 'instance-manager'
    static_configs:
      - targets: ['localhost:9090']
    metrics_path: /metrics
    scrape_interval: 30s

  - job_name: 'node-exporter'
    static_configs:
      - targets: ['localhost:9100']

alerting:
  alertmanagers:
    - static_configs:
        - targets:
          - alertmanager:9093
```

### Grafana Dashboard

Create a Grafana dashboard with panels for:

- Request rate and response time
- Instance health status
- Auto-scaling events
- Error rates
- Resource utilization

### Alerting Rules

```yaml
# instance_manager_rules.yml
groups:
- name: instance_manager
  rules:
  - alert: HighErrorRate
    expr: instance_manager_error_rate > 0.1
    for: 5m
    labels:
      severity: warning
    annotations:
      summary: "High error rate detected"
      description: "Error rate is {{ $value }}% for {{ $labels.instance_id }}"

  - alert: InstanceUnhealthy
    expr: instance_manager_instances_healthy == 0
    for: 2m
    labels:
      severity: critical
    annotations:
      summary: "No healthy instances available"
      description: "Provider {{ $labels.provider_type }} has no healthy instances"

  - alert: HighResponseTime
    expr: instance_manager_request_duration_seconds{quantile="0.95"} > 5
    for: 5m
    labels:
      severity: warning
    annotations:
      summary: "High response time detected"
      description: "95th percentile response time is {{ $value }}s"
```

## Backup and Recovery

### Database Backup

```bash
#!/bin/bash
# backup.sh

BACKUP_DIR="/backups/ish_chat"
DATE=$(date +%Y%m%d_%H%M%S)
DB_NAME="ish_chat"
DB_USER="ishchat_user"

# Create backup directory
mkdir -p $BACKUP_DIR

# Database backup
pg_dump -U $DB_USER -h localhost $DB_NAME | gzip > $BACKUP_DIR/db_backup_$DATE.sql.gz

# Upload to cloud storage (optional)
# aws s3 cp $BACKUP_DIR/db_backup_$DATE.sql.gz s3://your-backup-bucket/

# Clean old backups (keep 7 days)
find $BACKUP_DIR -name "db_backup_*.sql.gz" -mtime +7 -delete

echo "Backup completed: db_backup_$DATE.sql.gz"
```

### Configuration Backup

```bash
#!/bin/bash
# backup_config.sh

BACKUP_DIR="/backups/config"
DATE=$(date +%Y%m%d_%H%M%S)

# Create backup directory
mkdir -p $BACKUP_DIR

# Backup configuration files
tar -czf $BACKUP_DIR/config_backup_$DATE.tar.gz \
    config/ \
    .env \
    nginx.conf \
    docker-compose.yml

echo "Configuration backup completed: config_backup_$DATE.tar.gz"
```

### Recovery Procedures

1. **Database Recovery**
   ```bash
   # Stop application
   sudo systemctl stop instance-manager
   
   # Restore database
   gunzip -c /backups/ish_chat/db_backup_20240101_120000.sql.gz | psql -U ishchat_user -d ish_chat
   
   # Start application
   sudo systemctl start instance-manager
   ```

2. **Configuration Recovery**
   ```bash
   # Extract configuration backup
   tar -xzf /backups/config/config_backup_20240101_120000.tar.gz
   
   # Restart application
   sudo systemctl restart instance-manager
   ```

## Security Hardening

### System Security

1. **Update System Regularly**
   ```bash
   # Set up automatic updates
   sudo apt install unattended-upgrades
   sudo dpkg-reconfigure -plow unattended-upgrades
   ```

2. **Configure Firewall**
   ```bash
   # Ubuntu/Debian (UFW)
   sudo ufw enable
   sudo ufw allow ssh
   sudo ufw allow 80/tcp
   sudo ufw allow 443/tcp
   sudo ufw deny 9090/tcp  # Restrict metrics access
   
   # CentOS/RHEL (firewalld)
   sudo firewall-cmd --permanent --add-service=ssh
   sudo firewall-cmd --permanent --add-service=http
   sudo firewall-cmd --permanent --add-service=https
   sudo firewall-cmd --reload
   ```

3. **SSH Security**
   ```bash
   sudo nano /etc/ssh/sshd_config
   # Edit: PermitRootLogin no
   # Edit: PasswordAuthentication no
   # Edit: PermitEmptyPasswords no
   
   sudo systemctl restart sshd
   ```

### Application Security

1. **Use HTTPS Everywhere**
   - Obtain SSL certificates (Let's Encrypt recommended)
   - Configure proper SSL settings
   - Redirect HTTP to HTTPS

2. **API Security**
   - Use strong API keys
   - Implement rate limiting
   - Validate all inputs
   - Use parameterized queries

3. **Environment Security**
   - Encrypt sensitive data at rest
   - Use environment variables for secrets
   - Rotate API keys regularly
   - Monitor access logs

## Performance Tuning

### Database Optimization

1. **Connection Pooling**
   ```python
   # In database configuration
   SQLALCHEMY_ENGINE_OPTIONS = {
       "pool_size": 20,
       "max_overflow": 30,
       "pool_timeout": 30,
       "pool_recycle": 3600,
       "pool_pre_ping": True
   }
   ```

2. **Indexing**
   ```sql
   -- Add indexes for frequently queried columns
   CREATE INDEX idx_ai_instances_provider_type ON ai_instances(provider_type);
   CREATE INDEX idx_ai_instances_status ON ai_instances(status);
   CREATE INDEX idx_request_logs_instance_id ON request_logs(instance_id);
   CREATE INDEX idx_request_logs_created_at ON request_logs(created_at);
   ```

3. **Query Optimization**
   - Use `EXPLAIN ANALYZE` to optimize slow queries
   - Implement pagination for large result sets
   - Use appropriate data types

### Application Optimization

1. **Caching Strategy**
   - Enable Redis caching
   - Configure appropriate TTL values
   - Cache frequently accessed data

2. **Async Operations**
   - Use async/await for I/O operations
   - Implement connection pooling
   - Optimize database queries

3. **Resource Limits**
   - Set appropriate memory limits
   - Configure timeout values
   - Monitor resource usage

## Troubleshooting

### Common Issues

1. **Application Won't Start**
   ```bash
   # Check logs
   sudo journalctl -u instance-manager -f
   
   # Check configuration
   python -c "from src.config.settings import settings; print(settings.dict())"
   
   # Check database connection
   python -c "from src.database.database import engine; print(engine.execute('SELECT 1').scalar())"
   ```

2. **High Memory Usage**
   ```bash
   # Monitor memory usage
   top -p $(pgrep -f instance_manager)
   
   # Check for memory leaks
   python -m memory_profiler src/main_instance_manager.py
   ```

3. **Database Connection Issues**
   ```bash
   # Check database status
   sudo systemctl status postgresql
   
   # Test connection
   psql -U ishchat_user -d ish_chat -c "SELECT 1;"
   
   # Check connection limits
   psql -U postgres -c "SELECT * FROM pg_stat_activity;"
   ```

### Performance Issues

1. **Slow Response Times**
   ```bash
   # Check system load
   uptime
   iostat -x 1
   
   # Check database performance
   sudo -u postgres psql -c "SELECT * FROM pg_stat_statements ORDER BY total_time DESC LIMIT 10;"
   
   # Profile application
   python -m cProfile -o profile.stats src/main_instance_manager.py
   ```

2. **High CPU Usage**
   ```bash
   # Identify CPU-intensive processes
   top
   
   # Profile with py-spy
   sudo py-spy top --pid $(pgrep -f instance_manager)
   
   sudo py-spy record --pid $(pgrep -f instance_manager) -o profile.svg
   ```

### Health Checks

1. **Application Health**
   ```bash
   curl -f http://localhost:8000/health
   
   # Detailed health check
   curl -f http://localhost:8000/api/instances/status
   ```

2. **Database Health**
   ```bash
   # Check database connectivity
   pg_isready -U ishchat_user -d ish_chat
   
   # Check database size
   sudo -u postgres psql -c "SELECT pg_size_pretty(pg_database_size('ish_chat'));"
   ```

3. **Redis Health**
   ```bash
   redis-cli ping
   redis-cli info memory
   redis-cli info stats
   ```

## Maintenance

### Regular Tasks

1. **Daily**
   - Check application logs
   - Monitor system resources
   - Review error rates

2. **Weekly**
   - Update system packages
   - Review performance metrics
   - Check backup integrity

3. **Monthly**
   - Rotate API keys
   - Update SSL certificates
   - Review and update configurations
   - Performance tuning

### Log Management

1. **Log Rotation**
   ```bash
   # Configure logrotate
   sudo nano /etc/logrotate.d/instance-manager
   ```

   ```
   /var/log/instance-manager/*.log {
       daily
       missingok
       rotate 30
       compress
       delaycompress
       notifempty
       create 644 ishchat ishchat
       postrotate
           systemctl reload instance-manager
       endscript
   }
   ```

2. **Log Monitoring**
   ```bash
   # Monitor error logs
   tail -f /var/log/instance-manager/error.log | grep ERROR
   
   # Monitor access patterns
   tail -f /var/log/nginx/access.log | grep -v "GET /health"
   ```

### Updates and Upgrades

1. **Application Updates**
   ```bash
   # Backup current version
   cp -r /home/ishchat /home/ishchat.backup
   
   # Update code
   cd /home/ishchat
   git pull origin main
   
   # Update dependencies
   source venv/bin/activate
   pip install -r requirements.txt
   
   # Run migrations
   python -m alembic upgrade head
   
   # Restart service
   sudo systemctl restart instance-manager
   ```

2. **System Updates**
   ```bash
   # Update packages
   sudo apt update && sudo apt upgrade -y
   
   # Update Python packages
   pip list --outdated
   pip install --upgrade package_name
   ```

This deployment guide provides comprehensive instructions for deploying the ISH Chat Instance Manager in various environments. Choose the deployment method that best fits your infrastructure and requirements.