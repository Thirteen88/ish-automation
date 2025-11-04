#!/bin/bash
# ISH Chat PostgreSQL Backup Script
# Performs automated backups with WAL-E/WAL-G integration

set -euo pipefail

# Configuration
BACKUP_TYPE=${BACKUP_TYPE:-full}  # full, incremental, or base
POSTGRES_HOST=${POSTGRES_HOST:-postgres-primary}
POSTGRES_PORT=${POSTGRES_PORT:-5432}
POSTGRES_USER=${POSTGRES_USER:-postgres}
POSTGRES_PASSWORD=${POSTGRES_PASSWORD}
POSTGRES_DATABASE=${POSTGRES_DATABASE:-ish_chat}
BACKUP_DIR=${BACKUP_DIR:-/backups}
RETENTION_DAYS=${RETENTION_DAYS:-30}
COMPRESS=${COMPRESS:-true}
S3_BUCKET=${S3_BUCKET:-ish-chat-backups}
AWS_ACCESS_KEY_ID=${AWS_ACCESS_KEY_ID}
AWS_SECRET_ACCESS_KEY=${AWS_SECRET_ACCESS_KEY}
WALE_S3_PREFIX=${WALE_S3_PREFIX:-s3://ish-chat-backups/postgres}

# Logging
LOG_FILE="/var/log/postgres-backup.log"
exec 1> >(tee -a "$LOG_FILE")
exec 2>&1

# Function to log with timestamp
log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1"
}

# Function to check prerequisites
check_prerequisites() {
    log "Checking prerequisites..."

    # Check if PostgreSQL is accessible
    if ! pg_isready -h "$POSTGRES_HOST" -p "$POSTGRES_PORT" -U "$POSTGRES_USER"; then
        log "ERROR: PostgreSQL is not accessible"
        exit 1
    fi

    # Check AWS credentials
    if [[ -z "$AWS_ACCESS_KEY_ID" || -z "$AWS_SECRET_ACCESS_KEY" ]]; then
        log "ERROR: AWS credentials not configured"
        exit 1
    fi

    # Check WAL-G/WAL-E installation
    if ! command -v wal-g &> /dev/null && ! command -v wale &> /dev/null; then
        log "WARNING: Neither WAL-G nor WAL-E found. Using pg_dump instead."
        USE_WAL_G=false
    else
        if command -v wal-g &> /dev/null; then
            USE_WAL_G=true
            log "Using WAL-G for backups"
        else
            USE_WAL_G=false
            log "Using WAL-E for backups"
        fi
    fi

    # Create backup directory
    mkdir -p "$BACKUP_DIR"

    log "Prerequisites check completed"
}

# Function to get database size
get_database_size() {
    psql -h "$POSTGRES_HOST" -p "$POSTGRES_PORT" -U "$POSTGRES_USER" -d "$POSTGRES_DATABASE" -t -c \
        "SELECT pg_database_size('$POSTGRES_DATABASE');" | tr -d '[:space:]'
}

# Function to perform WAL-G backup
backup_with_walg() {
    local backup_name="ish-chat-backup-$(date +%Y%m%d_%H%M%S)"

    log "Starting WAL-G backup: $backup_name"

    export AWS_ACCESS_KEY_ID
    export AWS_SECRET_ACCESS_KEY
    export WALE_S3_PREFIX

    # Set PostgreSQL connection for WAL-G
    export PGHOST="$POSTGRES_HOST"
    export PGPORT="$POSTGRES_PORT"
    export PGUSER="$POSTGRES_USER"
    export PGPASSWORD="$POSTGRES_PASSWORD"

    # Perform backup
    if [[ "$BACKUP_TYPE" == "full" ]]; then
        wal-g backup-push "$POSTGRES_DATABASE"
    else
        wal-g backup-push --delta "$POSTGRES_DATABASE"
    fi

    if [[ $? -eq 0 ]]; then
        log "WAL-G backup completed successfully"

        # List recent backups
        log "Recent backups:"
        wal-g backup-list | head -10

        # Clean old backups
        log "Cleaning old backups (retention: $RETENTION_DAYS days)..."
        wal-g delete --confirm --retain "$RETENTION_DAYS"

        return 0
    else
        log "ERROR: WAL-G backup failed"
        return 1
    fi
}

# Function to perform traditional pg_dump backup
backup_with_pgdump() {
    local backup_file="$BACKUP_DIR/ish-chat-backup-$(date +%Y%m%d_%H%M%S).sql"
    local compressed_file="${backup_file}.gz"

    log "Starting pg_dump backup: $backup_file"

    # Get database size for progress tracking
    db_size=$(get_database_size)
    log "Database size: $(numfmt --to=iec "$db_size") bytes"

    # Perform backup
    local dump_start=$(date +%s)

    if [[ "$COMPRESS" == "true" ]]; then
        pg_dump -h "$POSTGRES_HOST" -p "$POSTGRES_PORT" -U "$POSTGRES_USER" \
            -d "$POSTGRES_DATABASE" \
            --verbose \
            --no-password \
            --format=custom \
            --compress=9 \
            --file="$compressed_file"
        backup_file="$compressed_file"
    else
        pg_dump -h "$POSTGRES_HOST" -p "$POSTGRES_PORT" -U "$POSTGRES_USER" \
            -d "$POSTGRES_DATABASE" \
            --verbose \
            --no-password \
            --format=custom \
            --file="$backup_file"
    fi

    local dump_end=$(date +%s)
    local dump_duration=$((dump_end - dump_start))

    if [[ $? -eq 0 ]]; then
        log "pg_dump backup completed in ${dump_duration}s"

        # Get backup file size
        backup_size=$(stat -f%z "$backup_file" 2>/dev/null || stat -c%s "$backup_file")
        log "Backup size: $(numfmt --to=iec "$backup_size") bytes"

        # Verify backup integrity
        log "Verifying backup integrity..."
        if pg_restore --list --format=custom "$backup_file" > /dev/null 2>&1; then
            log "Backup integrity check passed"
        else
            log "WARNING: Backup integrity check failed"
        fi

        # Upload to S3 if configured
        if [[ -n "$S3_BUCKET" ]]; then
            log "Uploading backup to S3..."
            aws s3 cp "$backup_file" "s3://$S3_BUCKET/postgres-backups/" \
                --storage-class STANDARD_IA \
                --server-side-encryption AES256

            if [[ $? -eq 0 ]]; then
                log "Backup uploaded to S3 successfully"
            else
                log "WARNING: Failed to upload backup to S3"
            fi
        fi

        return 0
    else
        log "ERROR: pg_dump backup failed"
        # Clean up failed backup
        rm -f "$backup_file" "$compressed_file"
        return 1
    fi
}

# Function to perform base backup using pg_basebackup
backup_with_basebackup() {
    local backup_dir="$BACKUP_DIR/base-backup-$(date +%Y%m%d_%H%M%S)"

    log "Starting pg_basebackup: $backup_dir"

    mkdir -p "$backup_dir"

    pg_basebackup -h "$POSTGRES_HOST" -p "$POSTGRES_PORT" -U "$POSTGRES_USER" \
        -D "$backup_dir" \
        -Ft -z -P -v -W

    if [[ $? -eq 0 ]]; then
        log "pg_basebackup completed successfully"

        # Create backup info file
        cat > "$backup_dir/backup_info.txt" << EOF
Backup Information:
==================
Date: $(date)
Host: $POSTGRES_HOST:$POSTGRES_PORT
Database: $POSTGRES_DATABASE
Type: Base Backup
Size: $(du -sh "$backup_dir" | cut -f1)
EOF

        # Compress and upload
        local archive_file="${backup_dir}.tar.gz"
        tar -czf "$archive_file" -C "$(dirname "$backup_dir")" "$(basename "$backup_dir")"

        log "Base backup archived: $archive_file"

        # Remove uncompressed directory
        rm -rf "$backup_dir"

        return 0
    else
        log "ERROR: pg_basebackup failed"
        rm -rf "$backup_dir"
        return 1
    fi
}

# Function to clean old backups
cleanup_old_backups() {
    log "Cleaning up old backups (retention: $RETENTION_DAYS days)..."

    # Clean local backups
    find "$BACKUP_DIR" -name "ish-chat-backup-*" -type f -mtime +$RETENTION_DAYS -delete
    find "$BACKUP_DIR" -name "base-backup-*" -type f -mtime +$RETENTION_DAYS -delete

    # Clean S3 backups if configured
    if [[ -n "$S3_BUCKET" ]]; then
        aws s3 ls "s3://$S3_BUCKET/postgres-backups/" | \
            while read -r line; do
                create_date=$(echo "$line" | awk '{print $1" "$2}')
                create_date=$(date -d "$create_date" +%s)
                older_than=$(date -d "$RETENTION_DAYS days ago" +%s)

                if [[ $create_date -lt $older_than ]]; then
                    file_name=$(echo "$line" | awk '{print $4}')
                    aws s3 rm "s3://$S3_BUCKET/postgres-backups/$file_name"
                    log "Deleted old S3 backup: $file_name"
                fi
            done
    fi

    log "Old backups cleanup completed"
}

# Function to verify backup
verify_backup() {
    local backup_file="$1"

    log "Verifying backup: $backup_file"

    if [[ ! -f "$backup_file" ]]; then
        log "ERROR: Backup file not found: $backup_file"
        return 1
    fi

    # Check file size
    local file_size=$(stat -f%z "$backup_file" 2>/dev/null || stat -c%s "$backup_file")
    if [[ $file_size -lt 1000 ]]; then
        log "ERROR: Backup file is too small: $file_size bytes"
        return 1
    fi

    # Verify custom format backup
    if [[ "$backup_file" == *.sql || "$backup_file" == *.dump ]]; then
        if pg_restore --list --format=custom "$backup_file" > /dev/null 2>&1; then
            log "Backup verification passed"
            return 0
        else
            log "ERROR: Backup verification failed"
            return 1
        fi
    fi

    # For compressed files, check if they can be decompressed
    if [[ "$backup_file" == *.gz ]]; then
        if gzip -t "$backup_file" 2>/dev/null; then
            log "Backup verification passed"
            return 0
        else
            log "ERROR: Compressed backup verification failed"
            return 1
        fi
    fi

    log "Backup verification completed"
    return 0
}

# Function to send notification
send_notification() {
    local status="$1"
    local message="$2"

    # Add your notification logic here (email, Slack, etc.)
    log "NOTIFICATION: [$status] $message"

    # Example: Send to Slack webhook
    # if [[ -n "$SLACK_WEBHOOK_URL" ]]; then
    #     curl -X POST -H 'Content-type: application/json' \
    #         --data "{\"text\":\"$message\"}" \
    #         "$SLACK_WEBHOOK_URL"
    # fi
}

# Function to create backup report
create_backup_report() {
    local backup_file="$1"
    local start_time="$2"
    local end_time="$3"
    local status="$4"

    local report_file="$BACKUP_DIR/backup-report-$(date +%Y%m%d_%H%M%S).json"

    local db_size=$(get_database_size)
    local backup_size=0
    if [[ -f "$backup_file" ]]; then
        backup_size=$(stat -f%z "$backup_file" 2>/dev/null || stat -c%s "$backup_file")
    fi

    cat > "$report_file" << EOF
{
    "backup_info": {
        "database": "$POSTGRES_DATABASE",
        "host": "$POSTGRES_HOST:$POSTGRES_PORT",
        "backup_type": "$BACKUP_TYPE",
        "backup_file": "$backup_file",
        "start_time": "$start_time",
        "end_time": "$end_time",
        "status": "$status",
        "database_size_bytes": $db_size,
        "backup_size_bytes": $backup_size,
        "compression_ratio": $(echo "scale=2; $backup_size / $db_size" | bc -l)
    },
    "configuration": {
        "retention_days": $RETENTION_DAYS,
        "compress": $COMPRESS,
        "s3_bucket": "$S3_BUCKET"
    }
}
EOF

    log "Backup report created: $report_file"
}

# Main execution
main() {
    local start_time=$(date '+%Y-%m-%d %H:%M:%S')
    local start_timestamp=$(date +%s)

    log "=== ISH Chat PostgreSQL Backup Started ==="
    log "Backup type: $BACKUP_TYPE"
    log "Database: $POSTGRES_DATABASE@$POSTGRES_HOST:$POSTGRES_PORT"
    log "Retention: $RETENTION_DAYS days"

    # Check prerequisites
    check_prerequisites

    # Create backup
    local backup_file=""
    local backup_status="failed"

    if [[ "$USE_WAL_G" == "true" ]]; then
        if backup_with_walg; then
            backup_status="success"
        fi
    elif [[ "$BACKUP_TYPE" == "base" ]]; then
        if backup_with_basebackup; then
            backup_status="success"
        fi
    else
        backup_file="$BACKUP_DIR/ish-chat-backup-$(date +%Y%m%d_%H%M%S).sql"
        if [[ "$COMPRESS" == "true" ]]; then
            backup_file="${backup_file}.gz"
        fi

        if backup_with_pgdump; then
            backup_status="success"
            verify_backup "$backup_file"
        fi
    fi

    # Clean old backups
    cleanup_old_backups

    # Generate report
    local end_time=$(date '+%Y-%m-%d %H:%M:%S')
    local end_timestamp=$(date +%s)
    local duration=$((end_timestamp - start_timestamp))

    create_backup_report "$backup_file" "$start_time" "$end_time" "$backup_status"

    # Send notification
    if [[ "$backup_status" == "success" ]]; then
        send_notification "SUCCESS" "PostgreSQL backup completed successfully in ${duration}s"
        log "=== ISH Chat PostgreSQL Backup Completed Successfully in ${duration}s ==="
        exit 0
    else
        send_notification "FAILURE" "PostgreSQL backup failed after ${duration}s"
        log "=== ISH Chat PostgreSQL Backup Failed after ${duration}s ==="
        exit 1
    fi
}

# Trap to handle interruption
trap 'log "Backup interrupted"; exit 1' INT TERM

# Run main function
main "$@"