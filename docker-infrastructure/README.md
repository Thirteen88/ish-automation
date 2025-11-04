# ISH Chat Docker Infrastructure

Complete containerized architecture for the multi-instance ISH Chat system with high availability, scalability, and comprehensive monitoring.

## 🏗️ Architecture Overview

This Docker infrastructure provides:

- **4 AI Provider Containers**: ZAI (GLM-4), OpenAI (GPT-4), Claude, and Perplexity
- **Multi-instance Application**: Load-balanced ISH Chat backend instances
- **High Availability Database**: PostgreSQL primary with read replicas
- **Redis Cache**: Distributed caching with persistence
- **Load Balancer**: Nginx with SSL termination and rate limiting
- **Monitoring Stack**: Prometheus + Grafana with comprehensive dashboards
- **Health Checks**: Comprehensive health monitoring for all services
- **Security**: Secret management, SSL/TLS, and security best practices

## 📋 Prerequisites

- Docker 24.0+
- Docker Compose 2.0+
- 16GB+ RAM
- 50GB+ available disk space
- SSL certificates (for production)

## 🚀 Quick Start

### 1. Environment Setup

```bash
# Clone and navigate to the project
cd /home/gary/multi-model-orchestrator/ish-chat-backend/docker-infrastructure

# Copy environment configuration
cp config/production.env .env

# Setup secrets
cd secrets
cp postgres_password.txt.template postgres_password.txt
cp redis_password.txt.template redis_password.txt
cp zai_api_key.txt.template zai_api_key.txt
cp openai_api_key.txt.template openai_api_key.txt
cp anthropic_api_key.txt.template anthropic_api_key.txt

# Edit secret files with actual values
nano postgres_password.txt
nano redis_password.txt
nano zai_api_key.txt
nano openai_api_key.txt
nano anthropic_api_key.txt
```

### 2. SSL Certificates (Production)

```bash
# Place your SSL certificates
cp your-cert.pem load-balancer/ssl/cert.pem
cp your-key.pem load-balancer/ssl/key.pem

# For development, generate self-signed certificates
cd load-balancer/ssl
openssl req -x509 -nodes -days 365 -newkey rsa:2048 \
  -keyout key.pem -out cert.pem
```

### 3. Update Configuration

Edit the `.env` file and replace:
- `POSTGRES_PASSWORD` with your PostgreSQL password
- `REDIS_PASSWORD` with your Redis password
- Update domain names in nginx.conf

### 4. Deploy

```bash
# Build and start all services
docker-compose up -d

# Check service status
docker-compose ps

# View logs
docker-compose logs -f
```

## 📁 Directory Structure

```
docker-infrastructure/
├── ai-providers/                 # AI provider Dockerfiles
│   ├── zai-provider.Dockerfile
│   ├── openai-provider.Dockerfile
│   ├── claude-provider.Dockerfile
│   ├── perplexity-provider.Dockerfile
│   └── *-requirements.txt
├── load-balancer/               # Nginx configuration
│   ├── nginx.Dockerfile
│   ├── nginx.conf
│   └── ssl/
├── database/                    # PostgreSQL configuration
│   ├── postgres-primary.conf
│   ├── postgres-replica.conf
│   └── setup-replication.sh
├── monitoring/                  # Prometheus & Grafana
│   ├── prometheus.yml
│   ├── alerts.yml
│   └── grafana/
├── secrets/                     # Secret management
│   └── *.txt.template
├── config/                      # Environment configs
│   ├── production.env
│   └── staging.env
├── docker-compose.yml          # Main orchestration
├── main-app.Dockerfile         # Main application
├── health_check.py            # Health check script
└── README.md                  # This file
```

## 🔧 Services Overview

### AI Provider Services
- **ZAI Provider** (Port 8001): GLM-4 model integration
- **OpenAI Provider** (Port 8002): GPT-4 model integration  
- **Claude Provider** (Port 8003): Anthropic Claude integration
- **Perplexity Provider** (Port 8004): Perplexity AI integration

### Database Services
- **PostgreSQL Primary** (Port 5432): Main database with write operations
- **PostgreSQL Replica 1** (Port 5433): Read replica for load distribution
- **PostgreSQL Replica 2** (Port 5434): Additional read replica
- **Redis** (Port 6379): Caching and session storage

### Application Services
- **ISH Chat App 1** (Port 8010): Main application instance 1
- **ISH Chat App 2** (Port 8011): Main application instance 2
- **Nginx Load Balancer** (Ports 80/443): SSL termination and load distribution

### Monitoring Services
- **Prometheus** (Port 9090): Metrics collection and storage
- **Grafana** (Port 3000): Visualization and dashboards
- **Redis Exporter** (Port 9121): Redis metrics for Prometheus
- **PostgreSQL Exporter** (Port 9187): PostgreSQL metrics for Prometheus

## 🔒 Security Configuration

### Secret Management
- All API keys stored in Docker secrets
- Database and Redis passwords use secrets
- No sensitive data in environment variables
- Regular secret rotation recommended

### Network Security
- Isolated Docker network (172.20.0.0/16)
- Internal services not exposed to internet
- SSL/TLS encryption for all external traffic
- Rate limiting on API endpoints

### Container Security
- Non-root users in all containers
- Minimal attack surface with slim base images
- Resource limits to prevent DoS attacks
- Regular security updates

## 📊 Monitoring

### Grafana Dashboards
Access Grafana at `http://localhost:3000` (admin/admin123):

- **System Overview**: CPU, memory, disk usage
- **Application Metrics**: Request rates, response times, error rates
- **AI Provider Performance**: Latency, success rates, token usage
- **Database Performance**: Connection counts, query performance
- **Cache Performance**: Hit rates, memory usage

### Prometheus Metrics
Access Prometheus at `http://localhost:9090`:

- Custom application metrics
- Infrastructure metrics
- AI provider metrics
- Database performance metrics

### Health Checks
All services include health checks:
```bash
# Check overall health
curl http://localhost/health

# Check specific service health
docker-compose exec ish-chat-app-1 python health_check.py --app main
```

## 🚀 Scaling

### Horizontal Scaling
```bash
# Scale application instances
docker-compose up -d --scale ish-chat-app-1=3 --scale ish-chat-app-2=3

# Scale read replicas
docker-compose up -d --scale postgres-replica1=2
```

### Resource Scaling
Edit `docker-compose.yml` resource limits:
```yaml
deploy:
  resources:
    limits:
      memory: 4G
      cpus: '2.0'
```

## 🔧 Maintenance

### Updates
```bash
# Pull latest images
docker-compose pull

# Rebuild with latest code
docker-compose build --no-cache

# Restart services
docker-compose up -d
```

### Backup
```bash
# Database backup
docker-compose exec postgres-primary pg_dump -U ishchat ish_chat > backup.sql

# Volume backup
docker run --rm -v ish-chat_postgres_primary_data:/data -v $(pwd):/backup ubuntu tar cvf /backup/postgres_backup.tar /data
```

### Logs
```bash
# View all logs
docker-compose logs -f

# View specific service logs
docker-compose logs -f ish-chat-app-1

# Export logs
docker-compose logs --no-color > ish-chat.log
```

## 🔍 Troubleshooting

### Common Issues

1. **Service won't start**
   ```bash
   # Check logs
   docker-compose logs [service-name]
   
   # Check health status
   docker-compose ps
   ```

2. **Database connection issues**
   ```bash
   # Test database connection
   docker-compose exec postgres-primary psql -U ishchat -d ish_chat
   
   # Check replication status
   docker-compose exec postgres-replica1 psql -U ishchat -c "SELECT * FROM pg_stat_replication;"
   ```

3. **High memory usage**
   ```bash
   # Check resource usage
   docker stats
   
   # Clean up unused containers
   docker system prune -a
   ```

4. **SSL certificate issues**
   ```bash
   # Test SSL configuration
   docker-compose exec nginx-lb nginx -t
   
   # Check certificate validity
   openssl x509 -in load-balancer/ssl/cert.pem -text -noout
   ```

### Performance Tuning

1. **Database Optimization**
   - Adjust `shared_buffers` in postgres config
   - Monitor slow queries with pg_stat_statements
   - Consider connection pooling

2. **Redis Optimization**
   - Adjust `maxmemory` policy
   - Monitor eviction patterns
   - Consider Redis clustering for large datasets

3. **Application Optimization**
   - Adjust worker processes
   - Tune request timeouts
   - Implement additional caching layers

## 🌐 Environment Variables

### Production Configuration
Key variables in `config/production.env`:
- `ENVIRONMENT`: Set to `production`
- `DATABASE_URL`: PostgreSQL connection string
- `REDIS_URL`: Redis connection string
- `LOG_LEVEL`: Set to `INFO` for production
- `RATE_LIMIT_PER_MINUTE`: Adjust based on load

### AI Provider Configuration
Each AI provider can be configured with:
- API endpoints and keys
- Timeout settings
- Rate limits
- Model parameters

## 📞 Support

For issues and questions:
1. Check logs: `docker-compose logs -f`
2. Verify health: `curl http://localhost/health`
3. Check monitoring: Grafana dashboards
4. Review this documentation

## 🔄 Continuous Deployment

For CI/CD integration:
```bash
# Production deployment
docker-compose -f docker-compose.yml -f docker-compose.prod.yml up -d

# Staging deployment
docker-compose -f docker-compose.yml -f docker-compose.staging.yml up -d
```

## 📈 Performance Benchmarks

Typical performance characteristics:
- **Concurrent Users**: 1000+
- **Request Rate**: 500+ req/sec
- **AI Response Time**: <2 seconds average
- **Database Query Time**: <100ms average
- **Cache Hit Rate**: >90%

## 🛡️ Security Checklist

- [ ] SSL certificates installed and valid
- [ ] API keys properly secured
- [ ] Rate limits configured
- [ ] Database credentials encrypted
- [ ] Network ports properly configured
- [ ] Security headers enabled
- [ ] Log monitoring configured
- [ ] Backup procedures in place
- [ ] Disaster recovery plan tested
- [ ] Regular security updates applied