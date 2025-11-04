#!/bin/bash
set -e

# PostgreSQL replication setup script
# This script sets up the primary database for replication

echo "Setting up PostgreSQL replication..."

# Create replication user
psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<-EOSQL
    CREATE USER replicator WITH REPLICATION ENCRYPTED PASSWORD 'replicator_password';
    GRANT CONNECT ON DATABASE $POSTGRES_DB TO replicator;
EOSQL

# Create archive directory
mkdir -p /var/lib/postgresql/archive
chown -R postgres:postgres /var/lib/postgresql/archive

# Create pg_hba.conf for replication
cat >> /var/lib/postgresql/data/pg_hba.conf <<EOF

# Replication connections
host    replication     replicator      172.20.0.0/16           md5
EOF

# Grant necessary permissions
psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<-EOSQL
    -- Grant usage on schema public to replicator
    GRANT USAGE ON SCHEMA public TO replicator;
    
    -- Grant select on all tables to replicator
    ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT ON TABLES TO replicator;
EOSQL

echo "Replication setup completed."

# Create ISH Chat database schema
psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<-EOSQL
    -- Create necessary tables for ISH Chat
    
    -- Users table
    CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        username VARCHAR(50) UNIQUE NOT NULL,
        email VARCHAR(100) UNIQUE NOT NULL,
        password_hash VARCHAR(255) NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        is_active BOOLEAN DEFAULT true
    );
    
    -- Chat sessions table
    CREATE TABLE IF NOT EXISTS chat_sessions (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(id),
        session_id VARCHAR(255) UNIQUE NOT NULL,
        title VARCHAR(255),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        is_active BOOLEAN DEFAULT true
    );
    
    -- Chat messages table
    CREATE TABLE IF NOT EXISTS chat_messages (
        id SERIAL PRIMARY KEY,
        session_id INTEGER REFERENCES chat_sessions(id),
        message_type VARCHAR(20) NOT NULL, -- 'user' or 'assistant'
        content TEXT NOT NULL,
        ai_provider VARCHAR(50), -- 'zai', 'openai', 'claude', 'perplexity'
        model_name VARCHAR(100),
        tokens_used INTEGER,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
    
    -- AI provider usage table
    CREATE TABLE IF NOT EXISTS ai_provider_usage (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(id),
        provider VARCHAR(50) NOT NULL,
        model VARCHAR(100) NOT NULL,
        tokens_used INTEGER NOT NULL,
        cost DECIMAL(10,6),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
    
    -- File uploads table
    CREATE TABLE IF NOT EXISTS file_uploads (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(id),
        session_id INTEGER REFERENCES chat_sessions(id),
        filename VARCHAR(255) NOT NULL,
        file_path VARCHAR(500) NOT NULL,
        file_size BIGINT NOT NULL,
        mime_type VARCHAR(100) NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
    
    -- API keys table for users
    CREATE TABLE IF NOT EXISTS user_api_keys (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(id),
        key_name VARCHAR(100) NOT NULL,
        api_key_hash VARCHAR(255) NOT NULL,
        permissions JSONB,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        expires_at TIMESTAMP,
        is_active BOOLEAN DEFAULT true
    );
    
    -- Analytics table
    CREATE TABLE IF NOT EXISTS analytics_events (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(id),
        session_id INTEGER REFERENCES chat_sessions(id),
        event_type VARCHAR(50) NOT NULL,
        event_data JSONB,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
    
    -- Create indexes for performance
    CREATE INDEX IF NOT EXISTS idx_chat_messages_session_id ON chat_messages(session_id);
    CREATE INDEX IF NOT EXISTS idx_chat_messages_created_at ON chat_messages(created_at);
    CREATE INDEX IF NOT EXISTS idx_chat_sessions_user_id ON chat_sessions(user_id);
    CREATE INDEX IF NOT EXISTS idx_ai_provider_usage_user_id ON ai_provider_usage(user_id);
    CREATE INDEX IF NOT EXISTS idx_ai_provider_usage_created_at ON ai_provider_usage(created_at);
    CREATE INDEX IF NOT EXISTS idx_file_uploads_user_id ON file_uploads(user_id);
    CREATE INDEX IF NOT EXISTS idx_analytics_events_user_id ON analytics_events(user_id);
    CREATE INDEX IF NOT EXISTS idx_analytics_events_created_at ON analytics_events(created_at);
    
    -- Create updated_at trigger function
    CREATE OR REPLACE FUNCTION update_updated_at_column()
    RETURNS TRIGGER AS \$\$
    BEGIN
        NEW.updated_at = CURRENT_TIMESTAMP;
        RETURN NEW;
    END;
    \$\$ language 'plpgsql';
    
    -- Create triggers for updated_at
    CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON users
        FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
    
    CREATE TRIGGER update_chat_sessions_updated_at BEFORE UPDATE ON chat_sessions
        FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
    
EOSQL

echo "Database schema creation completed."