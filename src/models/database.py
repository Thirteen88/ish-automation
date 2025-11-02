"""
Database models for ISH chat integration
"""
from sqlalchemy import Column, Integer, String, DateTime, Text, Boolean, Float
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.sql import func
from datetime import datetime

Base = declarative_base()

class AutomationSession(Base):
    """Track automation sessions"""
    __tablename__ = "automation_sessions"

    id = Column(Integer, primary_key=True, index=True)
    session_id = Column(String, unique=True, index=True)
    action = Column(String)
    status = Column(String)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    completed_at = Column(DateTime(timezone=True))
    device_id = Column(String)
    screenshots_taken = Column(Integer, default=0)
    error_message = Column(Text)

class PerplexityQuery(Base):
    """Track Perplexity queries and responses"""
    __tablename__ = "perplexity_queries"

    id = Column(Integer, primary_key=True, index=True)
    query_text = Column(Text)
    response_received = Column(Boolean, default=False)
    model_used = Column(String)
    screenshot_path = Column(String)
    response_time = Column(Float)  # in seconds
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    session_id = Column(String, index=True)

class DeviceStatus(Base):
    """Track Android device status"""
    __tablename__ = "device_status"

    id = Column(Integer, primary_key=True, index=True)
    device_id = Column(String, unique=True, index=True)
    connected = Column(Boolean)
    battery_level = Column(Integer)
    model = Column(String)
    last_seen = Column(DateTime(timezone=True), server_default=func.now())
    app_version = Column(String)

class ModelExploration(Base):
    """Track model exploration results"""
    __tablename__ = "model_exploration"

    id = Column(Integer, primary_key=True, index=True)
    app_name = Column(String)  # perplexity, etc.
    models_found = Column(Text)  # JSON array of models
    exploration_method = Column(String)
    screenshot_paths = Column(Text)  # JSON array of screenshot paths
    success = Column(Boolean)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    session_id = Column(String, index=True)