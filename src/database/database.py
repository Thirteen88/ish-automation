"""
Database models for SQLAlchemy ORM
"""
from sqlalchemy import Column, Integer, String, DateTime, Boolean, Text, Float
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.sql import func

Base = declarative_base()

class AutomationSession(Base):
    """Automation session table"""
    __tablename__ = "automation_sessions"

    id = Column(Integer, primary_key=True, index=True)
    session_id = Column(String, unique=True, index=True)
    action = Column(String)
    status = Column(String)  # started, completed, failed
    device_id = Column(String)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    completed_at = Column(DateTime(timezone=True), nullable=True)
    screenshots_taken = Column(Integer, default=0)
    error_message = Column(Text, nullable=True)

class PerplexityQuery(Base):
    """Perplexity query logs table"""
    __tablename__ = "perplexity_queries"

    id = Column(Integer, primary_key=True, index=True)
    query_text = Column(Text)
    session_id = Column(String)
    model_used = Column(String, nullable=True)
    screenshot_path = Column(String, nullable=True)
    response_time = Column(Float, nullable=True)
    response_received = Column(Boolean, default=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

class DeviceStatus(Base):
    """Device status tracking table"""
    __tablename__ = "device_status"

    id = Column(Integer, primary_key=True, index=True)
    device_id = Column(String, unique=True, index=True)
    connected = Column(Boolean, default=False)
    battery_level = Column(Integer, nullable=True)
    model = Column(String, nullable=True)
    app_version = Column(String, nullable=True)
    last_seen = Column(DateTime(timezone=True), server_default=func.now())
    created_at = Column(DateTime(timezone=True), server_default=func.now())

class ModelExploration(Base):
    """AI model exploration results table"""
    __tablename__ = "model_exploration"

    id = Column(Integer, primary_key=True, index=True)
    app_name = Column(String)
    models_found = Column(Text)  # JSON string
    exploration_method = Column(String)
    screenshot_paths = Column(Text)  # JSON string
    success = Column(Boolean, default=False)
    session_id = Column(String)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

class AnalyticsEvent(Base):
    """Analytics events table"""
    __tablename__ = "analytics_events"

    id = Column(Integer, primary_key=True, index=True)
    event_type = Column(String, index=True)
    user_id = Column(String, index=True)
    device_id = Column(String, index=True)
    session_id = Column(String, index=True)
    timestamp = Column(DateTime(timezone=True), server_default=func.now())
    data = Column(Text)  # JSON string
    duration_ms = Column(Integer, nullable=True)
    success = Column(Boolean, default=True)
    error_message = Column(Text, nullable=True)

class AITestResult(Base):
    """AI provider test results table"""
    __tablename__ = "ai_test_results"

    id = Column(Integer, primary_key=True, index=True)
    test_id = Column(String, index=True)
    session_id = Column(String, index=True)
    test_type = Column(String, index=True)
    provider = Column(String, index=True)
    model = Column(String)
    success = Column(Boolean, index=True)
    response_text = Column(Text, nullable=True)
    error_message = Column(Text, nullable=True)
    execution_time = Column(Float)
    response_length = Column(Integer, default=0)
    estimated_cost = Column(Float, nullable=True)
    token_usage = Column(Text, nullable=True)  # JSON string
    quality_score = Column(Float, nullable=True)
    test_prompt = Column(Text)
    test_metadata = Column(Text, nullable=True)  # JSON string
    created_at = Column(DateTime(timezone=True), server_default=func.now())