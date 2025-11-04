"""
Database models for Instance Manager service
"""
from sqlalchemy import Column, Integer, String, DateTime, Boolean, Text, Float, JSON, ForeignKey
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from datetime import datetime
from enum import Enum

Base = declarative_base()

class InstanceStatus(str, Enum):
    """Instance status enumeration"""
    STARTING = "starting"
    HEALTHY = "healthy"
    UNHEALTHY = "unhealthy"
    MAINTENANCE = "maintenance"
    STOPPED = "stopped"
    ERROR = "error"
    SCALING = "scaling"

class ProviderType(str, Enum):
    """AI provider type enumeration"""
    ZAI = "zai"
    OPENAI = "openai"
    ANTHROPIC = "anthropic"
    PERPLEXITY = "perplexity"

class AIInstance(Base):
    """AI instance model for tracking individual model instances"""
    __tablename__ = "ai_instances"

    id = Column(Integer, primary_key=True, index=True)
    instance_id = Column(String, unique=True, index=True, nullable=False)
    provider_type = Column(String, nullable=False, index=True)  # ProviderType enum
    model_name = Column(String, nullable=False, index=True)
    instance_name = Column(String, nullable=False)  # Human-readable name
    endpoint_url = Column(String, nullable=False)
    api_key = Column(String, nullable=True)  # Encrypted in production
    region = Column(String, nullable=True)
    version = Column(String, nullable=True)
    
    # Status and health
    status = Column(String, default=InstanceStatus.STARTING, index=True)
    is_active = Column(Boolean, default=True, index=True)
    is_healthy = Column(Boolean, default=False, index=True)
    last_health_check = Column(DateTime(timezone=True), nullable=True)
    last_success_response = Column(DateTime(timezone=True), nullable=True)
    
    # Performance metrics
    total_requests = Column(Integer, default=0)
    successful_requests = Column(Integer, default=0)
    failed_requests = Column(Integer, default=0)
    average_response_time = Column(Float, default=0.0)
    success_rate = Column(Float, default=0.0)
    
    # Resource limits
    max_concurrent_requests = Column(Integer, default=10)
    current_load = Column(Integer, default=0)
    max_tokens_per_minute = Column(Integer, default=10000)
    current_tokens_per_minute = Column(Integer, default=0)
    
    # Configuration
    temperature = Column(Float, default=0.7)
    max_tokens = Column(Integer, default=1000)
    timeout = Column(Integer, default=30)
    
    # Metadata
    tags = Column(JSON, nullable=True)  # Flexible tagging system
    metadata = Column(JSON, nullable=True)  # Additional configuration
    priority = Column(Integer, default=1)  # Higher number = higher priority
    
    # Timestamps
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
    last_scaled_at = Column(DateTime(timezone=True), nullable=True)
    
    # Relationships
    health_checks = relationship("HealthCheck", back_populates="instance", cascade="all, delete-orphan")
    metrics = relationship("InstanceMetrics", back_populates="instance", cascade="all, delete-orphan")
    scaling_events = relationship("ScalingEvent", back_populates="instance", cascade="all, delete-orphan")

class HealthCheck(Base):
    """Health check results for AI instances"""
    __tablename__ = "health_checks"

    id = Column(Integer, primary_key=True, index=True)
    instance_id = Column(String, ForeignKey("ai_instances.instance_id"), nullable=False)
    
    # Check results
    status = Column(String, nullable=False)  # healthy, unhealthy, error
    response_time = Column(Float, nullable=True)  # in milliseconds
    error_message = Column(Text, nullable=True)
    
    # Test results
    test_prompt = Column(Text, nullable=True)
    test_response = Column(Text, nullable=True)
    tokens_used = Column(Integer, nullable=True)
    
    # Check metadata
    check_type = Column(String, default="basic")  # basic, load, latency
    check_score = Column(Float, nullable=True)  # 0-100 health score
    
    # Timestamps
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    
    # Relationships
    instance = relationship("AIInstance", back_populates="health_checks")

class InstanceMetrics(Base):
    """Performance metrics for AI instances"""
    __tablename__ = "instance_metrics"

    id = Column(Integer, primary_key=True, index=True)
    instance_id = Column(String, ForeignKey("ai_instances.instance_id"), nullable=False)
    
    # Request metrics
    total_requests = Column(Integer, default=0)
    successful_requests = Column(Integer, default=0)
    failed_requests = Column(Integer, default=0)
    timeout_requests = Column(Integer, default=0)
    
    # Performance metrics
    average_response_time = Column(Float, default=0.0)  # milliseconds
    min_response_time = Column(Float, nullable=True)
    max_response_time = Column(Float, nullable=True)
    p95_response_time = Column(Float, nullable=True)
    
    # Resource usage
    tokens_used = Column(Integer, default=0)
    cpu_usage = Column(Float, nullable=True)  # percentage
    memory_usage = Column(Float, nullable=True)  # percentage
    
    # Error tracking
    error_rate = Column(Float, default=0.0)  # percentage
    last_error = Column(Text, nullable=True)
    consecutive_failures = Column(Integer, default=0)
    
    # Time window
    time_window = Column(Integer, default=300)  # seconds (5 minutes)
    timestamp = Column(DateTime(timezone=True), server_default=func.now())
    
    # Relationships
    instance = relationship("AIInstance", back_populates="metrics")

class ScalingEvent(Base):
    """Auto-scaling events for AI instances"""
    __tablename__ = "scaling_events"

    id = Column(Integer, primary_key=True, index=True)
    instance_id = Column(String, ForeignKey("ai_instances.instance_id"), nullable=False)
    
    # Event details
    event_type = Column(String, nullable=False)  # scale_up, scale_down, manual_scale
    old_replicas = Column(Integer, nullable=True)
    new_replicas = Column(Integer, nullable=True)
    
    # Trigger information
    trigger_reason = Column(String, nullable=False)  # load_threshold, health_check, manual
    trigger_metric = Column(String, nullable=True)  # response_time, error_rate, queue_length
    trigger_value = Column(Float, nullable=True)
    threshold_value = Column(Float, nullable=True)
    
    # Event status
    status = Column(String, default="pending")  # pending, in_progress, completed, failed
    error_message = Column(Text, nullable=True)
    
    # Timestamps
    started_at = Column(DateTime(timezone=True), server_default=func.now())
    completed_at = Column(DateTime(timezone=True), nullable=True)
    
    # Relationships
    instance = relationship("AIInstance", back_populates="scaling_events")

class LoadBalancerConfig(Base):
    """Load balancer configuration for provider groups"""
    __tablename__ = "load_balancer_configs"

    id = Column(Integer, primary_key=True, index=True)
    provider_type = Column(String, nullable=False, index=True)
    model_name = Column(String, nullable=False, index=True)
    
    # Load balancing strategy
    strategy = Column(String, default="round_robin")  # round_robin, weighted, least_connections
    session_affinity = Column(Boolean, default=False)
    
    # Health check configuration
    health_check_interval = Column(Integer, default=30)  # seconds
    health_check_timeout = Column(Integer, default=10)  # seconds
    unhealthy_threshold = Column(Integer, default=3)  # consecutive failures
    healthy_threshold = Column(Integer, default=2)  # consecutive successes
    
    # Failover configuration
    failover_enabled = Column(Boolean, default=True)
    max_failover_attempts = Column(Integer, default=3)
    failover_timeout = Column(Integer, default=30)  # seconds
    
    # Circuit breaker configuration
    circuit_breaker_enabled = Column(Boolean, default=True)
    circuit_breaker_threshold = Column(Integer, default=5)  # consecutive failures
    circuit_breaker_timeout = Column(Integer, default=60)  # seconds
    
    # Configuration
    config = Column(JSON, nullable=True)  # Additional provider-specific config
    is_active = Column(Boolean, default=True)
    
    # Timestamps
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

class ProviderGroup(Base):
    """Logical grouping of AI instances for load balancing"""
    __tablename__ = "provider_groups"

    id = Column(Integer, primary_key=True, index=True)
    group_name = Column(String, unique=True, nullable=False, index=True)
    provider_type = Column(String, nullable=False, index=True)
    
    # Group configuration
    description = Column(Text, nullable=True)
    min_instances = Column(Integer, default=1)
    max_instances = Column(Integer, default=10)
    desired_instances = Column(Integer, default=2)
    
    # Auto-scaling configuration
    auto_scaling_enabled = Column(Boolean, default=True)
    scale_up_threshold = Column(Float, default=0.8)  # CPU/load threshold
    scale_down_threshold = Column(Float, default=0.2)
    scale_up_cooldown = Column(Integer, default=300)  # seconds
    scale_down_cooldown = Column(Integer, default=600)
    
    # Load balancing
    load_balancer_config_id = Column(Integer, ForeignKey("load_balancer_configs.id"))
    
    # Status
    is_active = Column(Boolean, default=True)
    status = Column(String, default="active")
    
    # Timestamps
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
    
    # Relationships
    load_balancer_config = relationship("LoadBalancerConfig")

class InstanceGroup(Base):
    """Many-to-many relationship between instances and groups"""
    __tablename__ = "instance_groups"

    id = Column(Integer, primary_key=True, index=True)
    instance_id = Column(String, ForeignKey("ai_instances.instance_id"), nullable=False)
    group_id = Column(Integer, ForeignKey("provider_groups.id"), nullable=False)
    
    # Group-specific configuration
    weight = Column(Integer, default=1)  # For weighted load balancing
    is_active = Column(Boolean, default=True)
    
    # Timestamps
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

class RequestLog(Base):
    """Request logging for AI instances"""
    __tablename__ = "request_logs"

    id = Column(Integer, primary_key=True, index=True)
    request_id = Column(String, unique=True, nullable=False, index=True)
    instance_id = Column(String, ForeignKey("ai_instances.instance_id"), nullable=False)
    group_id = Column(Integer, ForeignKey("provider_groups.id"), nullable=True)
    
    # Request details
    provider_type = Column(String, nullable=False, index=True)
    model_name = Column(String, nullable=False)
    prompt_length = Column(Integer, nullable=True)
    response_length = Column(Integer, nullable=True)
    tokens_used = Column(Integer, nullable=True)
    
    # Performance metrics
    response_time = Column(Float, nullable=True)  # milliseconds
    queue_time = Column(Float, nullable=True)  # milliseconds spent in queue
    
    # Status
    status = Column(String, nullable=False)  # success, error, timeout
    error_message = Column(Text, nullable=True)
    
    # Routing information
    was_failover = Column(Boolean, default=False)
    original_instance_id = Column(String, nullable=True)
    
    # Metadata
    user_id = Column(String, nullable=True, index=True)
    session_id = Column(String, nullable=True, index=True)
    metadata = Column(JSON, nullable=True)
    
    # Timestamps
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    completed_at = Column(DateTime(timezone=True), nullable=True)