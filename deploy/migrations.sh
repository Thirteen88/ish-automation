#!/bin/bash
################################################################################
# Database Migration Script
# Handles database schema migrations during deployment
################################################################################

set -euo pipefail

ENVIRONMENT="${1:-production}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo "Running database migrations for $ENVIRONMENT..."

# Check if migrations directory exists
if [ ! -d "${SCRIPT_DIR}/../migrations" ]; then
    echo "No migrations directory found, creating one..."
    mkdir -p "${SCRIPT_DIR}/../migrations"
fi

# Get database credentials based on environment
case "$ENVIRONMENT" in
    development)
        DB_HOST="${POSTGRES_HOST:-localhost}"
        DB_PORT="${POSTGRES_PORT:-5432}"
        DB_NAME="${POSTGRES_DB:-ish_automation_dev}"
        DB_USER="${POSTGRES_USER:-ish_dev}"
        ;;
    staging)
        DB_HOST="${POSTGRES_HOST:-ish-postgres-staging.internal}"
        DB_PORT="${POSTGRES_PORT:-5432}"
        DB_NAME="${POSTGRES_DB:-ish_automation_staging}"
        DB_USER="${POSTGRES_USER:-ish_staging}"
        ;;
    production)
        DB_HOST="${POSTGRES_HOST:-ish-postgres-prod.internal}"
        DB_PORT="${POSTGRES_PORT:-5432}"
        DB_NAME="${POSTGRES_DB:-ish_automation}"
        DB_USER="${POSTGRES_USER:-ish_prod}"
        ;;
esac

# Test database connection
echo "Testing database connection..."
if command -v kubectl &> /dev/null; then
    POD=$(kubectl get pod -n ish-automation-${ENVIRONMENT} -l app=ish-postgres -o jsonpath='{.items[0].metadata.name}')
    kubectl exec -n ish-automation-${ENVIRONMENT} $POD -- \
        psql -U $DB_USER -d $DB_NAME -c "SELECT 1;" > /dev/null 2>&1
else
    docker exec ish-postgres psql -U $DB_USER -d $DB_NAME -c "SELECT 1;" > /dev/null 2>&1
fi

if [ $? -eq 0 ]; then
    echo "✓ Database connection successful"
else
    echo "✗ Database connection failed"
    exit 1
fi

# Create migrations table if it doesn't exist
echo "Creating migrations tracking table..."
SQL="
CREATE TABLE IF NOT EXISTS schema_migrations (
    id SERIAL PRIMARY KEY,
    version VARCHAR(255) NOT NULL UNIQUE,
    applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
"

if command -v kubectl &> /dev/null; then
    kubectl exec -n ish-automation-${ENVIRONMENT} $POD -- \
        psql -U $DB_USER -d $DB_NAME -c "$SQL"
else
    docker exec ish-postgres psql -U $DB_USER -d $DB_NAME -c "$SQL"
fi

# Run pending migrations
echo "Running pending migrations..."
MIGRATION_COUNT=0

for migration_file in ${SCRIPT_DIR}/../migrations/*.sql; do
    if [ -f "$migration_file" ]; then
        MIGRATION_NAME=$(basename "$migration_file" .sql)

        # Check if migration already applied
        CHECK_SQL="SELECT COUNT(*) FROM schema_migrations WHERE version = '$MIGRATION_NAME';"

        if command -v kubectl &> /dev/null; then
            APPLIED=$(kubectl exec -n ish-automation-${ENVIRONMENT} $POD -- \
                psql -U $DB_USER -d $DB_NAME -t -c "$CHECK_SQL" | tr -d ' ')
        else
            APPLIED=$(docker exec ish-postgres \
                psql -U $DB_USER -d $DB_NAME -t -c "$CHECK_SQL" | tr -d ' ')
        fi

        if [ "$APPLIED" = "0" ]; then
            echo "Applying migration: $MIGRATION_NAME"

            if command -v kubectl &> /dev/null; then
                kubectl exec -i -n ish-automation-${ENVIRONMENT} $POD -- \
                    psql -U $DB_USER -d $DB_NAME < "$migration_file"
                kubectl exec -n ish-automation-${ENVIRONMENT} $POD -- \
                    psql -U $DB_USER -d $DB_NAME -c \
                    "INSERT INTO schema_migrations (version) VALUES ('$MIGRATION_NAME');"
            else
                docker exec -i ish-postgres \
                    psql -U $DB_USER -d $DB_NAME < "$migration_file"
                docker exec ish-postgres \
                    psql -U $DB_USER -d $DB_NAME -c \
                    "INSERT INTO schema_migrations (version) VALUES ('$MIGRATION_NAME');"
            fi

            MIGRATION_COUNT=$((MIGRATION_COUNT + 1))
        else
            echo "Skipping migration (already applied): $MIGRATION_NAME"
        fi
    fi
done

echo "Migration complete. Applied $MIGRATION_COUNT new migration(s)."
