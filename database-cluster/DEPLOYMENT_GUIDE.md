# ISH Chat PostgreSQL Cluster Deployment Guide

## Overview

This guide provides step-by-step instructions for deploying the ISH Chat PostgreSQL cluster architecture in a production environment.

## Prerequisites

### System Requirements

**Hardware Requirements (Production):**
- Primary Database: 4 CPU, 16GB RAM, 500GB SSD
- Each Replica: 2 CPU, 8GB RAM, 500GB SSD
- etcd: 1 CPU, 2GB RAM, 50GB SSD
- HAProxy/PgBouncer: 1 CPU, 1GB RAM
- Monitoring: 2 CPU, 4GB RAM, 200GB SSD

**Software Requirements:**
- Docker 20.10+
- Docker Compose 2.0+
- Python 3.8+ (for migration scripts)
- OpenSSL (for SSL certificates)

**Network Requirements:**
- Internal network with low latency (< 5ms)
- Minimum 1Gbps bandwidth between nodes
- Separate replication network (recommended)

## Architecture Overview

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   Applications  │    │   HAProxy       │    │   PgBouncer     │
│                 │───▶│   Load Balancer │───▶│ Connection Pool │
└─────────────────┘    └─────────────────┘    └─────────────────┘
                                                       │
                       ┌─────────────────┐            │
                       │   PostgreSQL    │◀───────────┘
                       │     Primary     │
                       └─────────────────┘
                               │
                ┌──────────────┼──────────────┐
                │              │              │
       ┌─────────────────┐ ┌─────────────────┐ ┌─────────────────┐
       │ PostgreSQL      │ │ PostgreSQL      │ │ PostgreSQL      │
       │ Replica 1       │ │ Replica 2       │ │ (Optional)      │
       └─────────────────┘ └─────────────────┘ └─────────────────┘
```

## Quick Start

### 1. Environment Setup

Clone the repository and navigate to the database cluster directory:

```bash
cd /home/gary/multi-model-orchestrator/ish-chat-backend/database-cluster
```

Copy the environment template:

```bash
cp .env.example .env
```

### 2. Configure Environment Variables

Edit the `.env` file with your specific configuration:

```bash
# Database Credentials
POSTGRES_PASSWORD=your_secure_postgres_password
REPLICATION_PASSWORD=your_secure_replication_password
PATRONI_RESTAPI_PASSWORD=your_secure_patroni_password

# PgBouncer Configuration
PGBOUNCER_STATS_PASSWORD=your_secure_pgbouncer_stats_password

# Redis Configuration
REDIS_PASSWORD=your_secure_redis_password

# Grafana Configuration
GRAFANA_PASSWORD=your_secure_grafana_password

# AWS S3 Configuration for Backups
AWS_ACCESS_KEY_ID=your_aws_access_key
AWS_SECRET_ACCESS_KEY=your_aws_secret_key
WALE_S3_PREFIX=s3://your-backup-bucket/postgres
```

### 3. Generate SSL Certificates (Production)

For production environments, generate SSL certificates:

```bash
mkdir -p ssl
cd ssl

# Generate private key
openssl genrsa -out server.key 2048

# Generate certificate signing request
openssl req -new -key server.key -out server.csr

# Generate self-signed certificate (for testing)
openssl x509 -req -days 365 -in server.csr -signkey server.key -out server.crt

# Set permissions
chmod 600 server.key
chmod 644 server.crt
```

### 4. Deploy the Cluster

Start the PostgreSQL cluster:

```bash
# Deploy all services
docker-compose up -d

# Check service status
docker-compose ps
```

### 5. Initialize the Database

The database will be automatically initialized when containers start. Check the logs:

```bash
# View initialization logs
docker-compose logs postgres-primary

# Check database health
docker-compose exec postgres-primary pg_isready -U postgres
```

### 6. Configure Application

Update your ISH Chat application configuration to use PostgreSQL:

```bash
# Set environment variables for your application
export USE_POSTGRESQL=true
export POSTGRES_HOST=localhost
export POSTGRES_PORT=5432
export POSTGRES_DATABASE=ish_chat
export POSTGRES_USER=postgres
export POSTGRES_PASSWORD=your_secure_postgres_password
export INSTANCE_ID=default
```

### 7. Migrate Data from SQLite

If migrating from an existing SQLite database:

```bash
# Install migration dependencies
pip install psycopg2-binary sqlite3

# Run migration script
python scripts/migrate_from_sqlite.py \
    --sqlite-path /path/to/your/ish_chat.db \
    --postgres-host localhost \
    --postgres-port 5432 \
    --postgres-user postgres \
    --postgres-password your_secure_postgres_password \
    --instance-id default
```

## Detailed Configuration

### PostgreSQL Configuration

The main PostgreSQL configuration is in `config/postgresql.conf`. Key settings:

```ini
# Memory settings
shared_buffers = 256MB
effective_cache_size = 1GB
work_mem = 4MB

# Replication settings
wal_level = replica
max_wal_senders = 10
max_replication_slots = 10
wal_keep_size = 1GB

# Performance settings
random_page_cost = 1.1
effective_io_concurrency = 200
```

### Patroni Configuration

Patroni handles automatic failover. Configuration is in `config/patroni.yml`:

```yaml
scope: ish-chat-cluster
namespace: /service/

restapi:
  listen: 0.0.0.0:8008
  authentication:
    username: patroni
    password: ${PATRONI_RESTAPI_PASSWORD}

etcd:
  hosts: etcd:2379

bootstrap:
  dcs:
    ttl: 30
    loop_wait: 10
    postgresql:
      use_pg_rewind: true
      use_slots: true
```

### PgBouncer Configuration

PgBouncer provides connection pooling. Configuration is in `config/pgbouncer.ini`:

```ini
[databases]
ish_chat = host=postgres-primary port=5432 dbname=ish_chat
ish_chat_ro = host=postgres-replica1 port=5432 dbname=ish_chat

[pgbouncer]
listen_port = 6432
pool_mode = transaction
max_client_conn = 1000
default_pool_size = 20
```

### HAProxy Configuration

HAProxy provides load balancing. Configuration is in `config/haproxy.cfg`:

```haproxy
listen postgres_write
    bind *:5000
    mode tcp
    balance first
    server postgres-primary postgres-primary:5432 check

listen postgres_read
    bind *:5001
    mode tcp
    balance roundrobin
    server postgres-replica1 postgres-replica1:5432 check
    server postgres-replica2 postgres-replica2:5432 check
```

## Monitoring and Alerting

### Accessing Monitoring Interfaces

1. **HAProxy Statistics**: http://localhost:8404/stats
2. **Prometheus**: http://localhost:9090
3. **Grafana**: http://localhost:3000 (admin/your_grafana_password)
4. **Patroni API**: http://localhost:8008

### Health Checks

Run the health check script:

```bash
python scripts/health_check.py --output-format json --verbose
```

### Setting Up Alerts

Configure email alerts in the health check script:

```bash
# Update the health check script with your SMTP settings
smtp_server=smtp.gmail.com
smtp_port=587
smtp_username=your_email@gmail.com
smtp_password=your_app_password
alert_email=admin@yourcompany.com

# Run with alerts enabled
python scripts/health_check.py --send-alerts
```

## Backup and Recovery

### Automated Backups

Backups are automatically configured via the backup service:

```bash
# View backup logs
docker-compose logs backup

# Manually trigger backup
docker-compose exec backup /backup.sh
```

### Manual Backup

Create a manual backup:

```bash
# Using pg_dump
docker-compose exec postgres-primary pg_dump \
    -U postgres -d ish_chat \
    -f /backups/manual_backup_$(date +%Y%m%d_%H%M%S).sql

# Using WAL-G
docker-compose exec postgres-primary wal-g backup-push ish_chat
```

### Point-in-Time Recovery

Restore to a specific point in time:

```bash
# List available backups
docker-compose exec postgres-primary wal-g backup-list

# Restore to specific backup
docker-compose exec postgres-primary wal-g backup-fetch BACKUP_NAME /tmp/restore
```

## Scaling the Cluster

### Adding Read Replicas

To add additional read replicas:

1. Update `docker-compose.yml` to add new replica service
2. Update `config/haproxy.cfg` to include new replica
3. Update `config/pgbouncer.ini` with new replica configuration
4. Restart services:

```bash
docker-compose up -d --scale postgres-replica=3
```

### Upgrading PostgreSQL

To upgrade PostgreSQL versions:

1. Update the image version in `docker-compose.yml`
2. Test in staging environment first
3. Perform rolling upgrade:

```bash
# Upgrade primary first
docker-compose stop postgres-primary
docker-compose up -d postgres-primary

# Wait for primary to be healthy
docker-compose exec postgres-primary pg_isready -U postgres

# Upgrade replicas one by one
docker-compose stop postgres-replica1
docker-compose up -d postgres-replica1
# Repeat for other replicas
```

## Security Configuration

### Network Security

1. **Firewall Rules**:
```bash
# Allow only required ports
ufw allow 22/tcp    # SSH
ufw allow 80/tcp    # HTTP
ufw allow 443/tcp   # HTTPS
ufw allow 5432/tcp  # PostgreSQL (internal only)
ufw allow 6432/tcp  # PgBouncer (internal only)
```

2. **Internal Network**:
```bash
# Create isolated network for database
docker network create --driver bridge --subnet=172.20.0.0/16 postgres-internal
```

### SSL Configuration

1. Enable SSL in PostgreSQL:
```ini
# In postgresql.conf
ssl = on
ssl_cert_file = 'server.crt'
ssl_key_file = 'server.key'
ssl_ca_file = 'ca.crt'
```

2. Configure client SSL:
```bash
# Set environment variable
export PGSSLMODE=require
```

### Access Control

1. **Database Users**:
```sql
-- Application user with limited privileges
CREATE USER ish_chat_app WITH PASSWORD 'secure_password';
GRANT CONNECT ON DATABASE ish_chat TO ish_chat_app;
GRANT USAGE ON SCHEMA public TO ish_chat_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO ish_chat_app;

-- Read-only user
CREATE USER ish_chat_readonly WITH PASSWORD 'readonly_password';
GRANT CONNECT ON DATABASE ish_chat TO ish_chat_readonly;
GRANT USAGE ON SCHEMA public TO ish_chat_readonly;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO ish_chat_readonly;
```

## Troubleshooting

### Common Issues

1. **Replication Lag**:
```bash
# Check replication status
docker-compose exec postgres-primary psql -U postgres -c "SELECT * FROM pg_stat_replication;"

# Check lag on replicas
docker-compose exec postgres-replica1 psql -U postgres -c "SELECT pg_last_wal_receive_lsn(), pg_last_wal_replay_lsn();"
```

2. **Connection Pool Exhaustion**:
```bash
# Check PgBouncer stats
docker-compose exec pgbouncer psql -U stats -h localhost -p 6432 -c "SHOW POOLS;"

# Check active connections
docker-compose exec postgres-primary psql -U postgres -c "SELECT count(*) FROM pg_stat_activity WHERE state = 'active';"
```

3. **Failover Issues**:
```bash
# Check Patroni status
docker-compose exec postgres-primary patronictl list

# Check etcd health
docker-compose exec etcd etcdctl endpoint health
```

### Performance Tuning

1. **Monitor Slow Queries**:
```sql
-- Enable slow query logging
ALTER SYSTEM SET log_min_duration_statement = 1000;
SELECT pg_reload_conf();

-- View slow queries
SELECT query, calls, total_time, mean_time FROM pg_stat_statements ORDER BY total_time DESC LIMIT 10;
```

2. **Optimize Indexes**:
```sql
-- Analyze index usage
SELECT schemaname, tablename, indexname, idx_scan, idx_tup_read, idx_tup_fetch
FROM pg_stat_user_indexes
ORDER BY idx_scan DESC;

-- Identify missing indexes
SELECT schemaname, tablename, attname, n_distinct, correlation
FROM pg_stats
WHERE schemaname = 'public'
ORDER BY n_distinct DESC;
```

## Maintenance Tasks

### Regular Maintenance

1. **Daily**:
```bash
# Check cluster health
python scripts/health_check.py

# Check backup status
docker-compose logs --tail=100 backup
```

2. **Weekly**:
```bash
# Vacuum and analyze tables
docker-compose exec postgres-primary psql -U postgres -c "VACUUM ANALYZE;"

# Check disk usage
df -h
```

3. **Monthly**:
```bash
# Update statistics
docker-compose exec postgres-primary psql -U postgres -c "ANALYZE;"

# Review and optimize slow queries
# Check index usage and add missing indexes
```

### Schema Updates

When updating the database schema:

1. Test migrations in staging
2. Create migration scripts in `migrations/` directory
3. Apply to primary:
```bash
docker-compose exec postgres-primary psql -U postgres -d ish_chat -f migrations/your_migration.sql
```

## Support and Documentation

- **Architecture Overview**: See `ARCHITECTURE.md`
- **Migration Guide**: See `scripts/migrate_from_sqlite.py`
- **Health Check Script**: See `scripts/health_check.py`
- **Backup Script**: See `scripts/backup.sh`

For additional support, check the container logs:

```bash
# View all logs
docker-compose logs

# View specific service logs
docker-compose logs postgres-primary
docker-compose logs haproxy
docker-compose logs patroni
```