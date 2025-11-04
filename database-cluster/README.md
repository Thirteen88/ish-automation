# ISH Chat PostgreSQL Cluster

A comprehensive, high-availability PostgreSQL cluster architecture designed specifically for the ISH Chat multi-instance system.

## 🚀 Features

### High Availability
- **Automatic Failover**: Patroni-managed failover within 30 seconds
- **Streaming Replication**: Real-time replication to multiple replicas
- **Health Monitoring**: Continuous health checks and automatic recovery
- **Consensus Management**: etcd-based distributed consensus

### Performance & Scaling
- **Read Replicas**: Multiple read replicas for query distribution
- **Connection Pooling**: PgBouncer for efficient connection management
- **Load Balancing**: HAProxy for intelligent request routing
- **Query Optimization**: Optimized indexes and query patterns

### Data Protection
- **Automated Backups**: Continuous WAL archiving to S3
- **Point-in-Time Recovery**: Restore to any point in time
- **Data Encryption**: Encryption at rest and in transit
- **Row-Level Security**: Multi-instance data isolation

### Monitoring & Observability
- **Real-time Metrics**: Prometheus metrics collection
- **Visualization**: Grafana dashboards and alerts
- **Health Checks**: Comprehensive health monitoring
- **Performance Analytics**: Query performance tracking

## 📋 Architecture Overview

```
Applications → HAProxy → PgBouncer → PostgreSQL Primary
                     ↘         ↙
                    Read Replicas
                        ↓
                     etcd Cluster
                        ↓
                 Monitoring Stack
```

## 🛠️ Quick Start

### Prerequisites
- Docker 20.10+
- Docker Compose 2.0+
- Python 3.8+ (for migrations)

### 1. Clone and Configure
```bash
cd /home/gary/multi-model-orchestrator/ish-chat-backend/database-cluster
cp .env.example .env
# Edit .env with your configuration
```

### 2. Deploy Cluster
```bash
docker-compose up -d
```

### 3. Verify Deployment
```bash
# Check service status
docker-compose ps

# Check database health
docker-compose exec postgres-primary pg_isready -U postgres
```

### 4. Access Monitoring
- **HAProxy Stats**: http://localhost:8404/stats
- **Grafana**: http://localhost:3000 (admin/your_grafana_password)
- **Prometheus**: http://localhost:9090

## 📊 Configuration

### Environment Variables

Key configuration options in `.env`:

```bash
# Database Credentials
POSTGRES_PASSWORD=your_secure_password
REPLICATION_PASSWORD=your_replication_password

# Backup Configuration
AWS_ACCESS_KEY_ID=your_aws_key
AWS_SECRET_ACCESS_KEY=your_aws_secret
WALE_S3_PREFIX=s3://your-backup-bucket

# Monitoring
GRAFANA_PASSWORD=your_grafana_password
```

### Connection Strings

- **Primary (Write)**: `postgresql://postgres:password@localhost:5432/ish_chat`
- **Replicas (Read)**: `postgresql://postgres:password@localhost:5433/ish_chat`
- **PgBouncer**: `postgresql://app:password@localhost:6432/ish_chat`
- **HAProxy Write**: `postgresql://postgres:password@localhost:5000/ish_chat`
- **HAProxy Read**: `postgresql://postgres:password@localhost:5001/ish_chat`

## 🔄 Migration from SQLite

### Automated Migration
```bash
python scripts/migrate_from_sqlite.py \
    --sqlite-path /path/to/ish_chat.db \
    --postgres-host localhost \
    --postgres-user postgres \
    --postgres-password your_password \
    --instance-id default
```

### Application Configuration
Update your application to use PostgreSQL:

```python
# Set environment variables
USE_POSTGRESQL=true
POSTGRES_HOST=localhost
POSTGRES_PORT=5432
POSTGRES_DATABASE=ish_chat
POSTGRES_USER=postgres
POSTGRES_PASSWORD=your_password
INSTANCE_ID=default
```

## 🔧 Management

### Health Checks
```bash
# Run comprehensive health check
python scripts/health_check.py --output-format json

# Check specific components
python scripts/health_check.py --postgres-host localhost --verbose
```

### Backup Operations
```bash
# Manual backup
docker-compose exec backup /backup.sh

# List backups (WAL-G)
docker-compose exec postgres-primary wal-g backup-list

# Restore from backup
docker-compose exec postgres-primary wal-g backup-fetch BACKUP_NAME /tmp/restore
```

### Scaling Operations
```bash
# Add read replica
docker-compose up -d --scale postgres-replica=3

# Update configuration
docker-compose restart haproxy pgbouncer
```

## 📈 Monitoring

### Key Metrics
- **Database Connections**: Active connection count and pool utilization
- **Replication Lag**: Delay between primary and replicas
- **Query Performance**: Slow query identification and optimization
- **Resource Usage**: CPU, memory, and disk utilization

### Alerting
Configure alerts for:
- Replication lag > 10 seconds
- Connection pool utilization > 80%
- Disk usage > 85%
- Database unavailability

### Dashboards
Pre-configured Grafana dashboards for:
- Cluster overview
- Performance metrics
- Replication status
- Backup monitoring

## 🔒 Security

### Network Security
- Internal network isolation
- TLS encryption for all connections
- Firewall rules restricting access
- Private communication between nodes

### Access Control
- Role-based access control (RBAC)
- Row-level security for instance isolation
- Minimal privilege principle
- Regular credential rotation

### Data Protection
- Encryption at rest (optional)
- Encrypted backups in S3
- Audit logging for all operations
- Secure key management

## 🚀 Performance Optimization

### Connection Management
- PgBouncer connection pooling (20-100 connections)
- Connection timeout and retry logic
- Read/write split routing
- Load balancing across replicas

### Query Optimization
- Optimized indexes for common queries
- Query result caching with Redis
- Prepared statements for repeated queries
- Automatic query performance monitoring

### Resource Tuning
- Memory allocation optimization
- I/O performance tuning
- Parallel query execution
- Workload-based resource allocation

## 🛠️ Troubleshooting

### Common Issues

**Replication Lag**
```bash
# Check replication status
SELECT * FROM pg_stat_replication;

# Check lag on replicas
SELECT pg_last_wal_receive_lsn(), pg_last_wal_replay_lsn();
```

**Connection Issues**
```bash
# Check PgBouncer status
SHOW POOLS;

# Check active connections
SELECT count(*) FROM pg_stat_activity WHERE state = 'active';
```

**Failover Problems**
```bash
# Check Patroni status
patronictl list

# Check etcd health
etcdctl endpoint health
```

### Performance Issues

**Slow Queries**
```sql
-- Identify slow queries
SELECT query, calls, total_time, mean_time
FROM pg_stat_statements
ORDER BY total_time DESC LIMIT 10;
```

**Index Usage**
```sql
-- Check index effectiveness
SELECT * FROM pg_stat_user_indexes
ORDER BY idx_scan DESC;
```

## 📚 Documentation

- **[Architecture Overview](./ARCHITECTURE.md)**: Detailed system architecture
- **[Deployment Guide](./DEPLOYMENT_GUIDE.md)**: Step-by-step deployment instructions
- **[Configuration Reference](./config/)**: All configuration options
- **[Migration Scripts](./scripts/)**: Database migration utilities

## 🤝 Support

### Getting Help
1. Check container logs: `docker-compose logs`
2. Run health check: `python scripts/health_check.py`
3. Review documentation in this repository
4. Check Grafana dashboards for insights

### Contributing
1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests if applicable
5. Submit a pull request

## 📄 License

This project is part of the ISH Chat system and follows the same licensing terms.

## 🔗 Related Projects

- **[ISH Chat Backend](../src/)**: Main application backend
- **[Multi-Model Orchestrator](../../)**: Parent orchestration system
- **[Claude Orchestrator](../../../claude-orchestrator/)**: AI orchestration platform

---

**Note**: This PostgreSQL cluster is specifically designed for the ISH Chat multi-instance system and includes optimizations for AI workloads, real-time communication, and high-concurrency scenarios.