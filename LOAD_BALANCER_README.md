# ISH Chat Load Balancer & API Gateway

A comprehensive, production-ready load balancer and API gateway system for the ISH Chat multi-instance architecture.

## 🚀 Overview

This implementation provides enterprise-grade load balancing, API gateway capabilities, SSL termination, rate limiting, authentication, monitoring, and performance optimization for the ISH Chat system.

## 📋 Features

### 🔄 Load Balancing
- **Layer 7 Load Balancing**: Intelligent request routing based on content and headers
- **Multiple Algorithms**: Round-robin, least connections, IP hash, weighted load balancing
- **Health Checks**: Active and passive health monitoring with automatic failover
- **Session Persistence**: Sticky sessions and connection pooling
- **Circuit Breaker**: Automatic failure detection and recovery

### 🛡️ Security & Authentication
- **SSL/TLS Termination**: Full encryption with modern cipher suites
- **Certificate Management**: Let's Encrypt integration with auto-renewal
- **API Key Authentication**: Secure API key management and validation
- **JWT Authentication**: JSON Web Token support with refresh tokens
- **Rate Limiting**: Multi-level rate limiting (IP, user, endpoint-specific)
- **Security Headers**: Comprehensive security header configuration
- **IP Filtering**: Whitelist/blacklist support for enhanced security

### 📊 Monitoring & Observability
- **Health Checks**: Comprehensive health monitoring for all components
- **Metrics Collection**: Prometheus-compatible metrics export
- **Real-time Monitoring**: Grafana dashboards and alerts
- **Performance Monitoring**: Response times, throughput, error rates
- **System Monitoring**: CPU, memory, disk, and network metrics
- **Log Management**: Structured logging with JSON format

### ⚡ Performance Optimization
- **Caching**: Multi-level caching (proxy cache, fastcgi cache)
- **Compression**: Brotli and gzip compression
- **Connection Pooling**: Keep-alive connections and pooling
- **HTTP/2 Support**: Modern protocol support for improved performance
- **Resource Optimization**: Memory and CPU usage optimization
- **CDN Integration**: Ready for CDN deployment

## 🏗️ Architecture

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   Clients       │────│  Nginx LB/GW    │────│  ISH Chat Apps  │
│                 │    │                 │    │                 │
│ Web/Mobile/API  │    │ - Load Balance  │    │ - App Instance 1│
│                 │    │ - SSL Terminate │    │ - App Instance 2│
└─────────────────┘    │ - API Gateway   │    │                 │
                       │ - Rate Limit    │    └─────────────────┘
                       │ - Auth/Security │              
                       │                 │    ┌─────────────────┐
                       │                 │────│  AI Providers   │
                       │                 │    │                 │
                       │                 │    │ - ZAI           │
                       │                 │    │ - OpenAI        │
                       │                 │    │ - Claude        │
                       │                 │    │ - Perplexity    │
                       │                 │    └─────────────────┘
                       │                 │              
                       │                 │    ┌─────────────────┐
                       │                 │────│   Data Layer    │
                       │                 │    │                 │
                       │                 │    │ - PostgreSQL    │
                       │                 │    │ - Redis         │
                       │                 │    │ - Monitoring    │
                       └─────────────────┘    └─────────────────┘
```

## 📁 Directory Structure

```
ish-chat-backend/
├── docker-infrastructure/
│   ├── load-balancer/
│   │   ├── nginx-enhanced.conf      # Enhanced Nginx configuration
│   │   ├── nginx-performance.conf   # Performance-optimized config
│   │   ├── nginx.Dockerfile         # Custom Nginx Docker image
│   │   └── ssl/
│   │       ├── generate-certs.sh    # Self-signed cert generation
│   │       ├── letsencrypt-setup.sh # Let's Encrypt setup
│   │       └── ssl-config.conf      # SSL configuration
│   └── docker-compose.yml           # Complete deployment definition
├── src/
│   ├── api_gateway/
│   │   ├── __init__.py
│   │   └── middleware.py            # API gateway middleware
│   ├── auth/
│   │   ├── auth_service.py          # Authentication service
│   │   └── rate_limiter.py          # Rate limiting service
│   └── monitoring/
│       ├── health_check.py          # Health check system
│       └── metrics.py               # Metrics collection
└── scripts/
    ├── deploy-load-balancer.sh      # Main deployment script
    ├── setup-redis-cluster.sh       # Redis cluster setup
    └── monitor-deployment.sh        # Monitoring script
```

## 🚀 Quick Start

### Prerequisites

- Docker 20.10+
- Docker Compose 2.0+
- 4GB+ RAM
- 10GB+ available disk space
- OpenSSL (for SSL certificates)

### 1. Clone and Setup

```bash
# Navigate to the project directory
cd /home/gary/multi-model-orchestrator/ish-chat-backend

# Make scripts executable
chmod +x scripts/*.sh
chmod +x docker-infrastructure/load-balancer/ssl/*.sh
```

### 2. Deploy the System

```bash
# Run the deployment script
./scripts/deploy-load-balancer.sh deploy
```

This will:
- ✅ Check system requirements
- ✅ Generate SSL certificates
- ✅ Create environment configuration
- ✅ Build Docker images
- ✅ Start all services
- ✅ Verify deployment
- ✅ Show access URLs

### 3. Access the Services

Once deployed, you can access:

- **Main Application**: http://localhost or https://localhost
- **Grafana Dashboard**: http://localhost:3000 (admin/admin)
- **Prometheus Metrics**: http://localhost:9090
- **Health Check**: http://localhost/health

## ⚙️ Configuration

### Environment Variables

Key environment variables in `.env`:

```bash
# SSL Configuration
SSL_DOMAIN=your-domain.com
SSL_EMAIL=admin@your-domain.com
ENABLE_SSL=true

# Authentication
JWT_SECRET_KEY=your-secret-key
BACKEND_API_KEY=your-api-key

# Rate Limiting
RATE_LIMIT_PER_MINUTE=60

# Performance
CACHE_TTL=3600
MAX_FILE_SIZE=10485760

# API Keys
ZAI_API_KEY=your-zai-key
OPENAI_API_KEY=your-openai-key
ANTHROPIC_API_KEY=your-anthropic-key
```

### Nginx Configuration

The Nginx configuration includes:

- **Load Balancing**: Round-robin with health checks
- **SSL/TLS**: Modern configuration with HTTP/2
- **Rate Limiting**: Multiple zones for different endpoints
- **Caching**: Proxy and FastCGI caching
- **Security**: Comprehensive security headers
- **Monitoring**: Status endpoints and metrics

### API Gateway Configuration

The API gateway provides:

- **Authentication**: JWT and API key validation
- **Rate Limiting**: Sliding window and token bucket algorithms
- **Security**: IP filtering and request validation
- **Monitoring**: Request logging and metrics

## 🔧 Management Commands

### Deployment Management

```bash
# Deploy the system
./scripts/deploy-load-balancer.sh deploy

# Stop all services
./scripts/deploy-load-balancer.sh stop

# Restart services
./scripts/deploy-load-balancer.sh restart

# View logs
./scripts/deploy-load-balancer.sh logs

# Check status
./scripts/deploy-load-balancer.sh status

# Update services
./scripts/deploy-load-balancer.sh update

# Clean up everything
./scripts/deploy-load-balancer.sh clean
```

### Monitoring

```bash
# Run health checks
./scripts/monitor-deployment.sh check

# Generate monitoring report
./scripts/monitor-deployment.sh report

# Set up alerts
./scripts/monitor-deployment.sh alerts

# Continuous monitoring
./scripts/monitor-deployment.sh watch
```

### Redis Cluster

```bash
# Setup Redis cluster
./scripts/setup-redis-cluster.sh setup

# Start Redis nodes
./scripts/setup-redis-cluster.sh start

# Monitor Redis cluster
./scripts/setup-redis-cluster.sh monitor
```

## 🔍 Monitoring and Observability

### Health Endpoints

- **Load Balancer**: `GET /health`
- **Applications**: `GET /health` on ports 8010, 8011
- **Ready Check**: `GET /ready`
- **Live Check**: `GET /live`

### Metrics

- **Prometheus**: `http://localhost:9090/metrics`
- **Nginx Status**: `http://localhost/nginx_status`
- **Application Metrics**: Available via `/metrics` endpoint

### Grafana Dashboards

Access Grafana at `http://localhost:3000`:
- Username: `admin`
- Password: Check environment variable `GRAFANA_ADMIN_PASSWORD`

Pre-configured dashboards:
- System Overview
- Application Performance
- Database Metrics
- Network Statistics

## 🔒 Security Features

### SSL/TLS

- **Certificates**: Auto-generated or Let's Encrypt
- **Protocols**: TLS 1.2 and 1.3 only
- **Ciphers**: Modern, secure cipher suites
- **HSTS**: HTTP Strict Transport Security
- **OCSP Stapling**: Certificate status checking

### Authentication

- **API Keys**: Secure key management with Redis backend
- **JWT Tokens**: Access and refresh tokens
- **Rate Limiting**: Multi-level protection
- **IP Filtering**: Whitelist/blacklist support

### Security Headers

- **X-Frame-Options**: Clickjacking protection
- **X-Content-Type-Options**: MIME type sniffing protection
- **X-XSS-Protection**: XSS protection
- **Content-Security-Policy**: CSP headers
- **Referrer-Policy**: Referrer control

## ⚡ Performance Optimization

### Caching Strategy

- **Proxy Cache**: HTTP response caching
- **FastCGI Cache**: Application response caching
- **Static Assets**: Long-term caching
- **Browser Caching**: Optimal cache headers

### Connection Optimization

- **Keep-Alive**: Persistent connections
- **Connection Pooling**: Efficient connection reuse
- **HTTP/2**: Multiplexed requests
- **Compression**: Brotli and gzip

### Resource Optimization

- **Memory Usage**: Optimized memory allocation
- **CPU Usage**: Efficient processing
- **Disk I/O**: Optimized file operations
- **Network**: Efficient data transfer

## 🛠️ Customization

### Adding New Services

1. Update `docker-compose.yml` with new service
2. Add upstream configuration in Nginx
3. Add health check configuration
4. Update monitoring dashboards

### Modifying Rate Limits

Edit the rate limiting zones in `nginx-enhanced.conf`:

```nginx
limit_req_zone $binary_remote_addr zone=api:10m rate=50r/s;
limit_req_zone $binary_remote_addr zone=upload:10m rate=5r/s;
```

### Custom Authentication

Implement custom authentication in `src/auth/auth_service.py`:

```python
async def custom_auth(request: Request) -> AuthResult:
    # Your custom logic here
    pass
```

## 🚨 Troubleshooting

### Common Issues

1. **SSL Certificate Issues**:
   ```bash
   # Regenerate certificates
   docker-infrastructure/load-balancer/ssl/generate-certs.sh
   
   # Or setup Let's Encrypt
   docker-infrastructure/load-balancer/ssl/letsencrypt-setup.sh
   ```

2. **Services Not Starting**:
   ```bash
   # Check logs
   ./scripts/deploy-load-balancer.sh logs
   
   # Check Docker status
   docker-compose ps
   ```

3. **Performance Issues**:
   ```bash
   # Check resource usage
   ./scripts/monitor-deployment.sh check
   
   # Analyze metrics
   curl http://localhost:9090/metrics
   ```

### Debug Mode

Enable debug logging by setting:
```bash
LOG_LEVEL=DEBUG
DEBUG=true
```

### Health Check Failures

Check individual service health:
```bash
# Check load balancer
curl http://localhost/health

# Check applications
curl http://localhost:8010/health
curl http://localhost:8011/health

# Check AI providers
curl http://localhost:8001/health  # ZAI
curl http://localhost:8002/health  # OpenAI
curl http://localhost:8003/health  # Claude
curl http://localhost:8004/health  # Perplexity
```

## 📈 Scaling

### Horizontal Scaling

1. Add more application instances in `docker-compose.yml`
2. Update Nginx upstream configuration
3. Adjust load balancing weights
4. Monitor performance metrics

### Vertical Scaling

1. Increase resource limits in `docker-compose.yml`
2. Adjust Nginx worker processes
3. Optimize cache sizes
4. Tune database connections

## 🔄 Maintenance

### Regular Tasks

1. **Certificate Renewal**: Automated via Let's Encrypt
2. **Log Rotation**: Configured in logrotate
3. **Database Backup**: Implement backup strategy
4. **Security Updates**: Regular Docker image updates

### Backup Strategy

```bash
# Backup Docker volumes
docker run --rm -v ish-chat_postgres_primary_data:/data -v $(pwd):/backup alpine tar czf /backup/postgres-backup.tar.gz -C /data .

# Backup configurations
cp -r docker-infrastructure/ backup/
cp .env backup/
```

## 📚 Documentation

- **API Documentation**: Available at `/docs` endpoint
- **Configuration**: Detailed in-line documentation
- **Monitoring**: Grafana dashboard documentation
- **Security**: Security best practices guide

## 🤝 Contributing

1. Fork the repository
2. Create feature branch
3. Make changes with tests
4. Update documentation
5. Submit pull request

## 📄 License

This project is licensed under the MIT License.

## 🆘 Support

For issues and questions:
1. Check troubleshooting section
2. Review logs and metrics
3. Create GitHub issue with details
4. Contact support team

---

**Version**: 1.0.0  
**Last Updated**: $(date)  
**Maintainer**: ISH Chat Team