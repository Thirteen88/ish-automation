-- ISH Chat PostgreSQL Schema
-- Converted from SQLite with multi-instance support and PostgreSQL optimizations

-- Enable necessary extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";
CREATE EXTENSION IF NOT EXISTS "btree_gin";
CREATE EXTENSION IF NOT EXISTS "btree_gist";

-- Create enum types for better performance
CREATE TYPE session_status AS ENUM ('started', 'completed', 'failed', 'cancelled', 'running');
CREATE TYPE device_connection_status AS ENUM ('connected', 'disconnected', 'error', 'unknown');
CREATE TYPE test_result_status AS ENUM ('success', 'failure', 'timeout', 'error');

-- Create the main database
CREATE DATABASE IF NOT EXISTS ish_chat;

-- Use the database
\c ish_chat;

-- Instance management table for multi-instance support
CREATE TABLE IF NOT EXISTS instances (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    instance_id VARCHAR(255) UNIQUE NOT NULL,
    instance_name VARCHAR(255) NOT NULL,
    instance_type VARCHAR(100) DEFAULT 'production',
    status VARCHAR(50) DEFAULT 'active',
    config JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    last_seen TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    metadata JSONB DEFAULT '{}'
);

-- Automation sessions table with multi-instance support
CREATE TABLE IF NOT EXISTS automation_sessions (
    id BIGSERIAL PRIMARY KEY,
    session_id VARCHAR(255) UNIQUE NOT NULL,
    instance_id VARCHAR(255) NOT NULL REFERENCES instances(instance_id),
    action VARCHAR(255) NOT NULL,
    status session_status DEFAULT 'started',
    device_id VARCHAR(255),
    user_id VARCHAR(255),
    priority INTEGER DEFAULT 5,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    completed_at TIMESTAMP WITH TIME ZONE,
    screenshots_taken INTEGER DEFAULT 0,
    error_message TEXT,
    execution_time_ms INTEGER,
    metadata JSONB DEFAULT '{}',
    tags TEXT[] DEFAULT '{}'
);

-- Enhanced indexes for automation_sessions
CREATE INDEX IF NOT EXISTS idx_automation_sessions_session_id ON automation_sessions(session_id);
CREATE INDEX IF NOT EXISTS idx_automation_sessions_instance_id ON automation_sessions(instance_id);
CREATE INDEX IF NOT EXISTS idx_automation_sessions_status ON automation_sessions(status);
CREATE INDEX IF NOT EXISTS idx_automation_sessions_device_id ON automation_sessions(device_id);
CREATE INDEX IF NOT EXISTS idx_automation_sessions_created_at ON automation_sessions(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_automation_sessions_user_id ON automation_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_automation_sessions_priority ON automation_sessions(priority);
CREATE INDEX IF NOT EXISTS idx_automation_sessions_instance_status ON automation_sessions(instance_id, status);
CREATE INDEX IF NOT EXISTS idx_automation_sessions_gin_tags ON automation_sessions USING GIN(tags);
CREATE INDEX IF NOT EXISTS idx_automation_sessions_gin_metadata ON automation_sessions USING GIN(metadata);

-- Perplexity query logs with enhanced fields
CREATE TABLE IF NOT EXISTS perplexity_queries (
    id BIGSERIAL PRIMARY KEY,
    instance_id VARCHAR(255) NOT NULL REFERENCES instances(instance_id),
    query_text TEXT NOT NULL,
    session_id VARCHAR(255) REFERENCES automation_sessions(session_id),
    model_used VARCHAR(255),
    screenshot_path VARCHAR(500),
    response_time FLOAT,
    response_received BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    user_id VARCHAR(255),
    query_hash VARCHAR(64), -- For duplicate detection
    response_tokens INTEGER,
    prompt_tokens INTEGER,
    total_tokens INTEGER,
    estimated_cost DECIMAL(10, 6),
    response_quality_score FLOAT,
    metadata JSONB DEFAULT '{}'
);

-- Enhanced indexes for perplexity_queries
CREATE INDEX IF NOT EXISTS idx_perplexity_queries_instance_id ON perplexity_queries(instance_id);
CREATE INDEX IF NOT EXISTS idx_perplexity_queries_session_id ON perplexity_queries(session_id);
CREATE INDEX IF NOT EXISTS idx_perplexity_queries_model_used ON perplexity_queries(model_used);
CREATE INDEX IF NOT EXISTS idx_perplexity_queries_created_at ON perplexity_queries(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_perplexity_queries_user_id ON perplexity_queries(user_id);
CREATE INDEX IF NOT EXISTS idx_perplexity_queries_query_hash ON perplexity_queries(query_hash);
CREATE INDEX IF NOT EXISTS idx_perplexity_queries_gin_metadata ON perplexity_queries USING GIN(metadata);

-- Device status tracking with enhanced fields
CREATE TABLE IF NOT EXISTS device_status (
    id BIGSERIAL PRIMARY KEY,
    device_id VARCHAR(255) UNIQUE NOT NULL,
    instance_id VARCHAR(255) NOT NULL REFERENCES instances(instance_id),
    connected device_connection_status DEFAULT 'disconnected',
    battery_level INTEGER CHECK (battery_level >= 0 AND battery_level <= 100),
    model VARCHAR(255),
    app_version VARCHAR(50),
    os_version VARCHAR(100),
    last_seen TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    capabilities JSONB DEFAULT '{}',
    location VARCHAR(255),
    user_id VARCHAR(255),
    device_metadata JSONB DEFAULT '{}',
    health_score INTEGER DEFAULT 100 CHECK (health_score >= 0 AND health_score <= 100)
);

-- Enhanced indexes for device_status
CREATE INDEX IF NOT EXISTS idx_device_status_device_id ON device_status(device_id);
CREATE INDEX IF NOT EXISTS idx_device_status_instance_id ON device_status(instance_id);
CREATE INDEX IF NOT EXISTS idx_device_status_connected ON device_status(connected);
CREATE INDEX IF NOT EXISTS idx_device_status_last_seen ON device_status(last_seen DESC);
CREATE INDEX IF NOT EXISTS idx_device_status_user_id ON device_status(user_id);
CREATE INDEX IF NOT EXISTS idx_device_status_gin_capabilities ON device_status USING GIN(capabilities);

-- Model exploration results with enhanced fields
CREATE TABLE IF NOT EXISTS model_exploration (
    id BIGSERIAL PRIMARY KEY,
    instance_id VARCHAR(255) NOT NULL REFERENCES instances(instance_id),
    app_name VARCHAR(255) NOT NULL,
    models_found JSONB NOT NULL,
    exploration_method VARCHAR(255),
    screenshot_paths JSONB DEFAULT '[]',
    success BOOLEAN DEFAULT FALSE,
    session_id VARCHAR(255) REFERENCES automation_sessions(session_id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    device_id VARCHAR(255),
    exploration_time_ms INTEGER,
    confidence_score FLOAT,
    metadata JSONB DEFAULT '{}'
);

-- Enhanced indexes for model_exploration
CREATE INDEX IF NOT EXISTS idx_model_exploration_instance_id ON model_exploration(instance_id);
CREATE INDEX IF NOT EXISTS idx_model_exploration_app_name ON model_exploration(app_name);
CREATE INDEX IF NOT EXISTS idx_model_exploration_session_id ON model_exploration(session_id);
CREATE INDEX IF NOT EXISTS idx_model_exploration_success ON model_exploration(success);
CREATE INDEX IF NOT EXISTS idx_model_exploration_created_at ON model_exploration(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_model_exploration_gin_models ON model_exploration USING GIN(models_found);

-- Analytics events with enhanced fields
CREATE TABLE IF NOT EXISTS analytics_events (
    id BIGSERIAL PRIMARY KEY,
    instance_id VARCHAR(255) NOT NULL REFERENCES instances(instance_id),
    event_type VARCHAR(255) NOT NULL,
    user_id VARCHAR(255),
    device_id VARCHAR(255),
    session_id VARCHAR(255) REFERENCES automation_sessions(session_id),
    timestamp TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    data JSONB DEFAULT '{}',
    duration_ms INTEGER,
    success BOOLEAN DEFAULT TRUE,
    error_message TEXT,
    error_code VARCHAR(100),
    source VARCHAR(255),
    version VARCHAR(50),
    metadata JSONB DEFAULT '{}'
);

-- Enhanced indexes for analytics_events
CREATE INDEX IF NOT EXISTS idx_analytics_events_instance_id ON analytics_events(instance_id);
CREATE INDEX IF NOT EXISTS idx_analytics_events_event_type ON analytics_events(event_type);
CREATE INDEX IF NOT EXISTS idx_analytics_events_user_id ON analytics_events(user_id);
CREATE INDEX IF NOT EXISTS idx_analytics_events_device_id ON analytics_events(device_id);
CREATE INDEX IF NOT EXISTS idx_analytics_events_session_id ON analytics_events(session_id);
CREATE INDEX IF NOT EXISTS idx_analytics_events_timestamp ON analytics_events(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_analytics_events_success ON analytics_events(success);
CREATE INDEX IF NOT EXISTS idx_analytics_events_gin_data ON analytics_events USING GIN(data);

-- AI test results with enhanced fields
CREATE TABLE IF NOT EXISTS ai_test_results (
    id BIGSERIAL PRIMARY KEY,
    instance_id VARCHAR(255) NOT NULL REFERENCES instances(instance_id),
    test_id VARCHAR(255) NOT NULL,
    session_id VARCHAR(255) REFERENCES automation_sessions(session_id),
    test_type VARCHAR(255),
    provider VARCHAR(255),
    model VARCHAR(255),
    success test_result_status DEFAULT 'success',
    response_text TEXT,
    error_message TEXT,
    execution_time FLOAT,
    response_length INTEGER DEFAULT 0,
    estimated_cost DECIMAL(10, 6),
    token_usage JSONB,
    quality_score FLOAT,
    test_prompt TEXT,
    test_metadata JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    user_id VARCHAR(255),
    test_suite VARCHAR(255),
    environment VARCHAR(100),
    version VARCHAR(50)
);

-- Enhanced indexes for ai_test_results
CREATE INDEX IF NOT EXISTS idx_ai_test_results_instance_id ON ai_test_results(instance_id);
CREATE INDEX IF NOT EXISTS idx_ai_test_results_test_id ON ai_test_results(test_id);
CREATE INDEX IF NOT EXISTS idx_ai_test_results_session_id ON ai_test_results(session_id);
CREATE INDEX IF NOT EXISTS idx_ai_test_results_test_type ON ai_test_results(test_type);
CREATE INDEX IF NOT EXISTS idx_ai_test_results_provider ON ai_test_results(provider);
CREATE INDEX IF NOT EXISTS idx_ai_test_results_model ON ai_test_results(model);
CREATE INDEX IF NOT EXISTS idx_ai_test_results_success ON ai_test_results(success);
CREATE INDEX IF NOT EXISTS idx_ai_test_results_created_at ON ai_test_results(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_test_results_user_id ON ai_test_results(user_id);
CREATE INDEX IF NOT EXISTS idx_ai_test_results_gin_token_usage ON ai_test_results USING GIN(token_usage);

-- New tables for enhanced functionality

-- Query performance tracking
CREATE TABLE IF NOT EXISTS query_performance (
    id BIGSERIAL PRIMARY KEY,
    instance_id VARCHAR(255) NOT NULL REFERENCES instances(instance_id),
    query_hash VARCHAR(64) NOT NULL,
    query_type VARCHAR(100),
    execution_time_ms INTEGER,
    rows_affected INTEGER,
    timestamp TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    user_id VARCHAR(255),
    session_id VARCHAR(255),
    metadata JSONB DEFAULT '{}'
);

CREATE INDEX IF NOT EXISTS idx_query_performance_instance_id ON query_performance(instance_id);
CREATE INDEX IF NOT EXISTS idx_query_performance_query_hash ON query_performance(query_hash);
CREATE INDEX IF NOT EXISTS idx_query_performance_timestamp ON query_performance(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_query_performance_execution_time ON query_performance(execution_time_ms DESC);

-- System metrics tracking
CREATE TABLE IF NOT EXISTS system_metrics (
    id BIGSERIAL PRIMARY KEY,
    instance_id VARCHAR(255) NOT NULL REFERENCES instances(instance_id),
    metric_name VARCHAR(255) NOT NULL,
    metric_value FLOAT,
    metric_unit VARCHAR(50),
    timestamp TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    tags JSONB DEFAULT '{}',
    source VARCHAR(255),
    metadata JSONB DEFAULT '{}'
);

CREATE INDEX IF NOT EXISTS idx_system_metrics_instance_id ON system_metrics(instance_id);
CREATE INDEX IF NOT EXISTS idx_system_metrics_metric_name ON system_metrics(metric_name);
CREATE INDEX IF NOT EXISTS idx_system_metrics_timestamp ON system_metrics(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_system_metrics_gin_tags ON system_metrics USING GIN(tags);

-- User sessions tracking
CREATE TABLE IF NOT EXISTS user_sessions (
    id BIGSERIAL PRIMARY KEY,
    instance_id VARCHAR(255) NOT NULL REFERENCES instances(instance_id),
    user_id VARCHAR(255) NOT NULL,
    session_token VARCHAR(255) UNIQUE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    last_activity TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    expires_at TIMESTAMP WITH TIME ZONE,
    ip_address INET,
    user_agent TEXT,
    status VARCHAR(50) DEFAULT 'active',
    metadata JSONB DEFAULT '{}'
);

CREATE INDEX IF NOT EXISTS idx_user_sessions_instance_id ON user_sessions(instance_id);
CREATE INDEX IF NOT EXISTS idx_user_sessions_user_id ON user_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_user_sessions_session_token ON user_sessions(session_token);
CREATE INDEX IF NOT EXISTS idx_user_sessions_last_activity ON user_sessions(last_activity DESC);
CREATE INDEX IF NOT EXISTS idx_user_sessions_status ON user_sessions(status);

-- API rate limiting
CREATE TABLE IF NOT EXISTS rate_limits (
    id BIGSERIAL PRIMARY KEY,
    instance_id VARCHAR(255) NOT NULL REFERENCES instances(instance_id),
    user_id VARCHAR(255),
    ip_address INET,
    endpoint VARCHAR(255),
    request_count INTEGER DEFAULT 1,
    window_start TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    window_end TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    metadata JSONB DEFAULT '{}'
);

CREATE INDEX IF NOT EXISTS idx_rate_limits_instance_id ON rate_limits(instance_id);
CREATE INDEX IF NOT EXISTS idx_rate_limits_user_id ON rate_limits(user_id);
CREATE INDEX IF NOT EXISTS idx_rate_limits_ip_address ON rate_limits(ip_address);
CREATE INDEX IF NOT EXISTS idx_rate_limits_endpoint ON rate_limits(endpoint);
CREATE INDEX IF NOT EXISTS idx_rate_limits_window_end ON rate_limits(window_end);

-- Error logs for debugging
CREATE TABLE IF NOT EXISTS error_logs (
    id BIGSERIAL PRIMARY KEY,
    instance_id VARCHAR(255) NOT NULL REFERENCES instances(instance_id),
    error_code VARCHAR(100),
    error_message TEXT NOT NULL,
    stack_trace TEXT,
    context JSONB DEFAULT '{}',
    user_id VARCHAR(255),
    session_id VARCHAR(255),
    device_id VARCHAR(255),
    endpoint VARCHAR(255),
    method VARCHAR(10),
    status_code INTEGER,
    timestamp TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    severity VARCHAR(20) DEFAULT 'error',
    metadata JSONB DEFAULT '{}'
);

CREATE INDEX IF NOT EXISTS idx_error_logs_instance_id ON error_logs(instance_id);
CREATE INDEX IF NOT EXISTS idx_error_logs_error_code ON error_logs(error_code);
CREATE INDEX IF NOT EXISTS idx_error_logs_timestamp ON error_logs(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_error_logs_severity ON error_logs(severity);
CREATE INDEX IF NOT EXISTS idx_error_logs_user_id ON error_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_error_logs_gin_context ON error_logs USING GIN(context);

-- Create partitioned tables for high-volume data (optional for very large deployments)

-- Partition automation_sessions by created_at (monthly partitions)
-- This would be implemented based on specific needs

-- Create triggers for automatic timestamp updates
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_instances_updated_at
    BEFORE UPDATE ON instances
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Create stored procedures for common operations

-- Function to get recent sessions with pagination
CREATE OR REPLACE FUNCTION get_recent_sessions(
    p_instance_id VARCHAR(255) DEFAULT NULL,
    p_limit INTEGER DEFAULT 10,
    p_offset INTEGER DEFAULT 0,
    p_status session_status DEFAULT NULL
)
RETURNS TABLE (
    id BIGINT,
    session_id VARCHAR(255),
    instance_id VARCHAR(255),
    action VARCHAR(255),
    status session_status,
    device_id VARCHAR(255),
    created_at TIMESTAMP WITH TIME ZONE,
    completed_at TIMESTAMP WITH TIME ZONE,
    execution_time_ms INTEGER
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        s.id,
        s.session_id,
        s.instance_id,
        s.action,
        s.status,
        s.device_id,
        s.created_at,
        s.completed_at,
        s.execution_time_ms
    FROM automation_sessions s
    WHERE
        (p_instance_id IS NULL OR s.instance_id = p_instance_id)
        AND (p_status IS NULL OR s.status = p_status)
    ORDER BY s.created_at DESC
    LIMIT p_limit
    OFFSET p_offset;
END;
$$ LANGUAGE plpgsql;

-- Function to get device statistics
CREATE OR REPLACE FUNCTION get_device_statistics(
    p_instance_id VARCHAR(255) DEFAULT NULL
)
RETURNS TABLE (
    total_devices BIGINT,
    connected_devices BIGINT,
    disconnected_devices BIGINT,
    avg_battery_level NUMERIC
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        COUNT(*)::BIGINT,
        COUNT(CASE WHEN connected = 'connected' THEN 1 END)::BIGINT,
        COUNT(CASE WHEN connected = 'disconnected' THEN 1 END)::BIGINT,
        AVG(battery_level)
    FROM device_status d
    WHERE p_instance_id IS NULL OR d.instance_id = p_instance_id;
END;
$$ LANGUAGE plpgsql;

-- Function to clean up old data (for maintenance)
CREATE OR REPLACE FUNCTION cleanup_old_data(
    p_days_to_keep INTEGER DEFAULT 90
)
RETURNS TABLE (
    table_name TEXT,
    rows_deleted BIGINT
) AS $$
BEGIN
    -- Clean up old analytics events
    DELETE FROM analytics_events
    WHERE timestamp < CURRENT_TIMESTAMP - INTERVAL '1 day' * p_days_to_keep;
    GET DIAGNOSTICS rows_deleted = ROW_COUNT;
    RETURN QUERY SELECT 'analytics_events'::TEXT, rows_deleted::BIGINT;

    -- Clean up old error logs
    DELETE FROM error_logs
    WHERE timestamp < CURRENT_TIMESTAMP - INTERVAL '1 day' * p_days_to_keep;
    GET DIAGNOSTICS rows_deleted = ROW_COUNT;
    RETURN QUERY SELECT 'error_logs'::TEXT, rows_deleted::BIGINT;

    -- Clean up old query performance data
    DELETE FROM query_performance
    WHERE timestamp < CURRENT_TIMESTAMP - INTERVAL '1 day' * p_days_to_keep;
    GET DIAGNOSTICS rows_deleted = ROW_COUNT;
    RETURN QUERY SELECT 'query_performance'::TEXT, rows_deleted::BIGINT;

    -- Clean up expired user sessions
    DELETE FROM user_sessions
    WHERE expires_at < CURRENT_TIMESTAMP;
    GET DIAGNOSTICS rows_deleted = ROW_COUNT;
    RETURN QUERY SELECT 'user_sessions'::TEXT, rows_deleted::BIGINT;
END;
$$ LANGUAGE plpgsql;

-- Create views for common queries

-- View for active sessions
CREATE OR REPLACE VIEW active_sessions AS
SELECT
    s.*,
    i.instance_name,
    d.device_id as device_identifier,
    d.battery_level
FROM automation_sessions s
JOIN instances i ON s.instance_id = i.instance_id
LEFT JOIN device_status d ON s.device_id = d.device_id
WHERE s.status IN ('started', 'running')
ORDER BY s.created_at DESC;

-- View for instance health
CREATE OR REPLACE VIEW instance_health AS
SELECT
    i.instance_id,
    i.instance_name,
    i.status as instance_status,
    COUNT(DISTINCT s.id) as total_sessions,
    COUNT(DISTINCT CASE WHEN s.status = 'completed' THEN s.id END) as completed_sessions,
    COUNT(DISTINCT CASE WHEN s.status = 'failed' THEN s.id END) as failed_sessions,
    COUNT(DISTINCT d.device_id) as total_devices,
    COUNT(DISTINCT CASE WHEN d.connected = 'connected' THEN d.device_id END) as connected_devices,
    MAX(s.created_at) as last_activity,
    i.last_seen as instance_last_seen
FROM instances i
LEFT JOIN automation_sessions s ON i.instance_id = s.instance_id
LEFT JOIN device_status d ON i.instance_id = d.instance_id
GROUP BY i.instance_id, i.instance_name, i.status, i.last_seen;

-- Create Row Level Security policies for multi-tenant isolation

-- Enable RLS on all tables
ALTER TABLE automation_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE perplexity_queries ENABLE ROW LEVEL SECURITY;
ALTER TABLE device_status ENABLE ROW LEVEL SECURITY;
ALTER TABLE model_exploration ENABLE ROW LEVEL SECURITY;
ALTER TABLE analytics_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_test_results ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE error_logs ENABLE ROW LEVEL SECURITY;

-- Create policies for instance isolation
CREATE POLICY instance_isolation_automation_sessions ON automation_sessions
    FOR ALL TO ALL
    USING (instance_id = current_setting('app.current_instance_id', true));

CREATE POLICY instance_isolation_perplexity_queries ON perplexity_queries
    FOR ALL TO ALL
    USING (instance_id = current_setting('app.current_instance_id', true));

CREATE POLICY instance_isolation_device_status ON device_status
    FOR ALL TO ALL
    USING (instance_id = current_setting('app.current_instance_id', true));

CREATE POLICY instance_isolation_model_exploration ON model_exploration
    FOR ALL TO ALL
    USING (instance_id = current_setting('app.current_instance_id', true));

CREATE POLICY instance_isolation_analytics_events ON analytics_events
    FOR ALL TO ALL
    USING (instance_id = current_setting('app.current_instance_id', true));

CREATE POLICY instance_isolation_ai_test_results ON ai_test_results
    FOR ALL TO ALL
    USING (instance_id = current_setting('app.current_instance_id', true));

CREATE POLICY instance_isolation_user_sessions ON user_sessions
    FOR ALL TO ALL
    USING (instance_id = current_setting('app.current_instance_id', true));

CREATE POLICY instance_isolation_error_logs ON error_logs
    FOR ALL TO ALL
    USING (instance_id = current_setting('app.current_instance_id', true));

-- Create default instance entry
INSERT INTO instances (instance_id, instance_name, instance_type, status)
VALUES ('default', 'Default Instance', 'production', 'active')
ON CONFLICT (instance_id) DO NOTHING;

-- Grant permissions (adjust based on your security requirements)
CREATE USER ish_chat_app WITH PASSWORD 'secure_app_password';
GRANT CONNECT ON DATABASE ish_chat TO ish_chat_app;
GRANT USAGE ON SCHEMA public TO ish_chat_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO ish_chat_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO ish_chat_app;

-- Create read-only user for replicas
CREATE USER ish_chat_readonly WITH PASSWORD 'readonly_password';
GRANT CONNECT ON DATABASE ish_chat TO ish_chat_readonly;
GRANT USAGE ON SCHEMA public TO ish_chat_readonly;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO ish_chat_readonly;

-- Set default privileges for future tables
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO ish_chat_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT ON TABLES TO ish_chat_readonly;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO ish_chat_app;

-- Add comments for documentation
COMMENT ON DATABASE ish_chat IS 'ISH Chat Multi-Instance Database';

COMMENT ON TABLE instances IS 'Instance management for multi-instance deployment';
COMMENT ON TABLE automation_sessions IS 'Automation session tracking';
COMMENT ON TABLE perplexity_queries IS 'Perplexity API query logs';
COMMENT ON TABLE device_status IS 'Device connection and status tracking';
COMMENT ON TABLE model_exploration IS 'AI model exploration results';
COMMENT ON TABLE analytics_events IS 'Analytics and event tracking';
COMMENT ON TABLE ai_test_results IS 'AI provider testing results';
COMMENT ON TABLE query_performance IS 'Query performance monitoring';
COMMENT ON TABLE system_metrics IS 'System metrics collection';
COMMENT ON TABLE user_sessions IS 'User session management';
COMMENT ON TABLE rate_limits IS 'API rate limiting';
COMMENT ON TABLE error_logs IS 'Error logging and debugging';

-- Create notification channels for real-time updates
CREATE OR REPLACE FUNCTION notify_session_update()
RETURNS TRIGGER AS $$
BEGIN
    PERFORM pg_notify('session_update',
        json_build_object(
            'table', TG_TABLE_NAME,
            'operation', TG_OP,
            'session_id', NEW.session_id,
            'status', NEW.status,
            'instance_id', NEW.instance_id
        )::text
    );
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER session_update_notification
    AFTER INSERT OR UPDATE ON automation_sessions
    FOR EACH ROW EXECUTE FUNCTION notify_session_update();

CREATE OR REPLACE FUNCTION notify_device_status_change()
RETURNS TRIGGER AS $$
BEGIN
    PERFORM pg_notify('device_status_update',
        json_build_object(
            'table', TG_TABLE_NAME,
            'operation', TG_OP,
            'device_id', NEW.device_id,
            'connected', NEW.connected,
            'instance_id', NEW.instance_id
        )::text
    );
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER device_status_notification
    AFTER UPDATE ON device_status
    FOR EACH ROW EXECUTE FUNCTION notify_device_status_change();

-- Schema version tracking
CREATE TABLE IF NOT EXISTS schema_migrations (
    version VARCHAR(50) PRIMARY KEY,
    applied_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    description TEXT
);

INSERT INTO schema_migrations (version, description)
VALUES ('1.0.0', 'Initial PostgreSQL schema with multi-instance support')
ON CONFLICT (version) DO NOTHING;