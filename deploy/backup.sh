#!/bin/bash
################################################################################
# Backup Script
# Creates backup of database and critical data before deployment
################################################################################

set -euo pipefail

ENVIRONMENT="${1:-production}"
TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
BACKUP_DIR="backups/${ENVIRONMENT}/${TIMESTAMP}"

echo "Creating backup for $ENVIRONMENT environment..."
mkdir -p "$BACKUP_DIR"

# Backup PostgreSQL database
echo "Backing up PostgreSQL database..."
if command -v kubectl &> /dev/null; then
    POD=$(kubectl get pod -n ish-automation-${ENVIRONMENT} -l app=ish-postgres -o jsonpath='{.items[0].metadata.name}')
    kubectl exec -n ish-automation-${ENVIRONMENT} $POD -- pg_dump -U ish_user ish_automation > "${BACKUP_DIR}/database.sql"
else
    docker exec ish-postgres pg_dump -U ish_user ish_automation > "${BACKUP_DIR}/database.sql"
fi

# Backup Redis data
echo "Backing up Redis data..."
if command -v kubectl &> /dev/null; then
    POD=$(kubectl get pod -n ish-automation-${ENVIRONMENT} -l app=ish-redis -o jsonpath='{.items[0].metadata.name}')
    kubectl exec -n ish-automation-${ENVIRONMENT} $POD -- redis-cli --rdb /tmp/dump.rdb
    kubectl cp -n ish-automation-${ENVIRONMENT} ${POD}:/tmp/dump.rdb "${BACKUP_DIR}/redis.rdb"
else
    docker exec ish-redis redis-cli SAVE
    docker cp ish-redis:/data/dump.rdb "${BACKUP_DIR}/redis.rdb"
fi

# Backup configuration files
echo "Backing up configuration files..."
cp -r config/ "${BACKUP_DIR}/config/"
cp .env "${BACKUP_DIR}/.env" 2>/dev/null || true

# Create backup manifest
cat > "${BACKUP_DIR}/manifest.json" <<EOF
{
  "timestamp": "$TIMESTAMP",
  "environment": "$ENVIRONMENT",
  "files": [
    "database.sql",
    "redis.rdb",
    "config/",
    ".env"
  ],
  "created_by": "${USER:-unknown}"
}
EOF

# Compress backup
echo "Compressing backup..."
tar -czf "backups/${ENVIRONMENT}_${TIMESTAMP}.tar.gz" -C "$BACKUP_DIR" .

echo "Backup completed: backups/${ENVIRONMENT}_${TIMESTAMP}.tar.gz"
