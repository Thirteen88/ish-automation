-- ISH Chat Database Initialization Script
-- This script is executed when the PostgreSQL container starts for the first time

-- Create database if it doesn't exist
SELECT 'CREATE DATABASE ish_chat'
WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'ish_chat')\gexec

\c ish_chat

-- Enable necessary extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";
CREATE EXTENSION IF NOT EXISTS "btree_gin";
CREATE EXTENSION IF NOT EXISTS "btree_gist";

-- Create application user
DO
$do$
BEGIN
   IF NOT EXISTS (
      SELECT FROM pg_catalog.pg_roles
      WHERE  rolname = 'ish_chat_app') THEN

      CREATE ROLE ish_chat_app LOGIN PASSWORD 'secure_app_password';
   END IF;
END
$do$;

-- Create read-only user
DO
$do$
BEGIN
   IF NOT EXISTS (
      SELECT FROM pg_catalog.pg_roles
      WHERE  rolname = 'ish_chat_readonly') THEN

      CREATE ROLE ish_chat_readonly LOGIN PASSWORD 'readonly_password';
   END IF;
END
$do$;

-- Grant permissions
GRANT CONNECT ON DATABASE ish_chat TO ish_chat_app;
GRANT USAGE ON SCHEMA public TO ish_chat_app;
GRANT CREATE ON SCHEMA public TO ish_chat_app;

GRANT CONNECT ON DATABASE ish_chat TO ish_chat_readonly;
GRANT USAGE ON SCHEMA public TO ish_chat_readonly;

-- Set default privileges
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO ish_chat_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT ON TABLES TO ish_chat_readonly;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO ish_chat_app;

-- Create the main schema using the migration script
\i /docker-entrypoint-initdb.d/../migrations/postgresql_schema.sql

-- Create replication slot for streaming replication
SELECT pg_create_physical_replication_slot('ish_chat_replication_slot');

-- Set up monitoring functions
CREATE OR REPLACE FUNCTION pg_stat_replication_details()
RETURNS TABLE (
    pid INTEGER,
    usesysid OID,
    usename TEXT,
    application_name TEXT,
    client_addr INET,
    client_hostname TEXT,
    client_port INTEGER,
    backend_start TIMESTAMP WITH TIME ZONE,
    backend_xmin XID,
    state TEXT,
    sent_lsn PG_LSN,
    write_lsn PG_LSN,
    flush_lsn PG_LSN,
    replay_lsn PG_LSN,
    write_lag INTERVAL,
    flush_lag INTERVAL,
    replay_lag INTERVAL,
    sync_priority INTEGER,
    sync_state TEXT
) AS $$
BEGIN
    RETURN QUERY
    SELECT * FROM pg_stat_replication;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create function for cluster health check
CREATE OR REPLACE FUNCTION cluster_health_check()
RETURNS JSONB AS $$
DECLARE
    result JSONB;
    primary_count INTEGER;
    replica_count INTEGER;
    total_connections INTEGER;
    db_size BIGINT;
BEGIN
    -- Count primary/replica status
    SELECT COUNT(*) INTO primary_count
    FROM pg_stat_replication WHERE state = 'streaming';

    SELECT COUNT(*) INTO replica_count
    FROM pg_stat_replication;

    -- Get connection info
    SELECT COUNT(*) INTO total_connections
    FROM pg_stat_activity WHERE state = 'active';

    -- Get database size
    SELECT pg_database_size('ish_chat') INTO db_size;

    result := jsonb_build_object(
        'timestamp', CURRENT_TIMESTAMP,
        'primary_active', (SELECT pg_is_in_recovery() = false),
        'replica_count', replica_count,
        'active_connections', total_connections,
        'database_size_bytes', db_size,
        'database_size_human', pg_size_pretty(db_size),
        'max_connections', (SELECT setting::int FROM pg_settings WHERE name = 'max_connections'),
        'connection_utilization_percent', ROUND((total_connections::float / (SELECT setting::int FROM pg_settings WHERE name = 'max_connections')) * 100, 2)
    );

    RETURN result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create function for performance monitoring
CREATE OR REPLACE FUNCTION get_performance_stats()
RETURNS TABLE (
    query TEXT,
    calls BIGINT,
    total_time DOUBLE PRECISION,
    mean_time DOUBLE PRECISION,
    rows BIGINT
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        query,
        calls,
        total_time,
        mean_time,
        rows
    FROM pg_stat_statements
    ORDER BY total_time DESC
    LIMIT 20;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant access to monitoring functions
GRANT EXECUTE ON FUNCTION cluster_health_check() TO ish_chat_app;
GRANT EXECUTE ON FUNCTION get_performance_stats() TO ish_chat_app;

-- Create indexes for performance monitoring
CREATE INDEX IF NOT EXISTS idx_pg_stat_statements_total_time ON pg_stat_statements(total_time DESC);

-- Create table for connection tracking
CREATE TABLE IF NOT EXISTS connection_log (
    id BIGSERIAL PRIMARY KEY,
    pid INTEGER,
    usename TEXT,
    application_name TEXT,
    client_addr INET,
    backend_start TIMESTAMP WITH TIME ZONE,
    state_change TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Create trigger for connection logging
CREATE OR REPLACE FUNCTION log_connection_info()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO connection_log (pid, usename, application_name, client_addr, backend_start, state_change)
    VALUES (
        pg_backend_pid(),
        current_user,
        current_setting('application_name', true),
        inet_client_addr(),
        backend_start(),
        state_change()
    );
    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

-- Create notification channel for real-time monitoring
CREATE OR REPLACE FUNCTION notify_database_stats()
RETURNS TRIGGER AS $$
BEGIN
    PERFORM pg_notify('database_stats', json_build_object(
        'database_size', pg_database_size('ish_chat'),
        'active_connections', (SELECT COUNT(*) FROM pg_stat_activity WHERE state = 'active'),
        'timestamp', CURRENT_TIMESTAMP
    )::text);
    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

-- Schedule periodic stats notification (requires pg_cron extension)
-- Uncomment if pg_cron is available
-- SELECT cron.schedule('database-stats-notification', '*/5 * * * *', 'SELECT notify_database_stats();');

-- Insert initial instance data
INSERT INTO instances (instance_id, instance_name, instance_type, status, config)
VALUES
    ('default', 'Default Instance', 'production', 'active', '{"max_sessions": 1000, "timeout": 300}'),
    ('development', 'Development Instance', 'development', 'active', '{"max_sessions": 100, "timeout": 600}'),
    ('staging', 'Staging Instance', 'staging', 'active', '{"max_sessions": 500, "timeout": 300}')
ON CONFLICT (instance_id) DO NOTHING;

-- Create default admin user in user_sessions table
INSERT INTO user_sessions (instance_id, user_id, session_token, expires_at, ip_address, user_agent, status)
VALUES ('default', 'admin', 'admin_initial_token', CURRENT_TIMESTAMP + INTERVAL '1 year', '127.0.0.1', 'Initial Setup', 'active')
ON CONFLICT (session_token) DO NOTHING;

-- Create system configuration table
CREATE TABLE IF NOT EXISTS system_config (
    id SERIAL PRIMARY KEY,
    config_key VARCHAR(255) UNIQUE NOT NULL,
    config_value JSONB NOT NULL,
    description TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    instance_id VARCHAR(255) DEFAULT 'default'
);

-- Insert default system configuration
INSERT INTO system_config (config_key, config_value, description, instance_id)
VALUES
    ('max_sessions_per_user', '100', 'Maximum number of sessions per user', 'default'),
    ('session_timeout_seconds', '3600', 'Session timeout in seconds', 'default'),
    ('enable_query_logging', 'true', 'Enable detailed query logging', 'default'),
    ('backup_retention_days', '30', 'Number of days to retain backups', 'default'),
    ('enable_notifications', 'true', 'Enable real-time notifications', 'default')
ON CONFLICT (config_key) DO NOTHING;

-- Create trigger for updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_system_config_updated_at
    BEFORE UPDATE ON system_config
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Set up logging configuration
ALTER SYSTEM SET log_destination = 'stderr';
ALTER SYSTEM SET logging_collector = on;
ALTER SYSTEM SET log_directory = 'log';
ALTER SYSTEM SET log_filename = 'postgresql-%Y-%m-%d_%H%M%S.log';
ALTER SYSTEM SET log_min_messages = warning;
ALTER SYSTEM SET log_min_error_statement = error;
ALTER SYSTEM SET log_connections = on;
ALTER SYSTEM SET log_disconnections = on;
ALTER SYSTEM SET log_duration = on;
ALTER SYSTEM SET log_statement = 'mod';
ALTER SYSTEM SET log_checkpoints = on;
ALTER SYSTEM SET log_lock_waits = on;

-- Reload configuration
SELECT pg_reload_conf();

-- Print initialization complete message
DO $$
BEGIN
    RAISE NOTICE 'ISH Chat PostgreSQL database initialization complete!';
    RAISE NOTICE 'Database: ish_chat';
    RAISE NOTICE 'Users created: ish_chat_app, ish_chat_readonly';
    RAISE NOTICE 'Extensions enabled: uuid-ossp, pg_trgm, btree_gin, btree_gist';
    RAISE NOTICE 'Monitoring functions created: cluster_health_check(), get_performance_stats()';
    RAISE NOTICE 'Default instances created: default, development, staging';
END $$;