"""
Database connection and session management
Supports both SQLite and PostgreSQL with read/write splitting
"""
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, Session
from sqlalchemy.pool import StaticPool
import logging
import random
from typing import Generator, Optional

from database.database import Base
from config.settings import DATABASE_CONFIG, settings, postgresql_settings
from config.postgresql_settings import (
    READ_REPLICA_CONFIG,
    PGBOUNCER_CONFIG,
    READ_CONNECTION_STRING,
    PGBOUNCER_CONNECTION_STRING
)

logger = logging.getLogger(__name__)

# Determine if using PostgreSQL
USE_POSTGRESQL = settings.use_postgresql and settings.postgres_password
USE_PGBOUNCER = USE_POSTGRESQL and postgresql_settings.pgbouncer_password

# Primary database engine (for writes)
if USE_PGBOUNCER:
    # Use PgBouncer for connection pooling
    engine = create_engine(
        PGBOUNCER_CONNECTION_STRING,
        echo=DATABASE_CONFIG["echo"],
        pool_pre_ping=DATABASE_CONFIG["pool_pre_ping"],
        pool_recycle=DATABASE_CONFIG["pool_recycle"],
        pool_size=PGBOUNCER_CONFIG["pool_size"],
        max_overflow=PGBOUNCER_CONFIG["max_overflow"],
        pool_timeout=PGBOUNCER_CONFIG["pool_timeout"],
        connect_args=PGBOUNCER_CONFIG["connect_args"]
    )
    logger.info("Using PgBouncer for PostgreSQL connection pooling")
elif USE_POSTGRESQL:
    # Direct PostgreSQL connection
    engine = create_engine(
        DATABASE_CONFIG["url"],
        echo=DATABASE_CONFIG["echo"],
        pool_pre_ping=DATABASE_CONFIG["pool_pre_ping"],
        pool_recycle=DATABASE_CONFIG["pool_recycle"],
        pool_size=DATABASE_CONFIG["pool_size"],
        max_overflow=DATABASE_CONFIG.get("max_overflow", 10),
        pool_timeout=DATABASE_CONFIG.get("pool_timeout", 30),
        connect_args=DATABASE_CONFIG.get("connect_args", {})
    )
    logger.info("Using direct PostgreSQL connection")
else:
    # SQLite connection (original)
    engine = create_engine(
        DATABASE_CONFIG["url"],
        echo=DATABASE_CONFIG["echo"],
        pool_pre_ping=DATABASE_CONFIG["pool_pre_ping"],
        pool_recycle=DATABASE_CONFIG["pool_recycle"],
        connect_args={"check_same_thread": False}
    )
    logger.info("Using SQLite database")

# Primary session factory
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

# Read replica engines (for PostgreSQL)
read_engines = []
if USE_POSTGRESQL:
    # Create read replica engines
    replica_urls = postgresql_settings.get_replica_urls()
    for replica_url in replica_urls:
        try:
            replica_engine = create_engine(
                replica_url,
                echo=DATABASE_CONFIG["echo"],
                pool_pre_ping=DATABASE_CONFIG["pool_pre_ping"],
                pool_recycle=DATABASE_CONFIG["pool_recycle"],
                pool_size=READ_REPLICA_CONFIG["pool_size"],
                max_overflow=READ_REPLICA_CONFIG["max_overflow"],
                pool_timeout=READ_REPLICA_CONFIG["pool_timeout"],
                connect_args=READ_REPLICA_CONFIG["connect_args"]
            )
            read_engines.append(replica_engine)
            logger.info(f"Added read replica: {replica_url}")
        except Exception as e:
            logger.warning(f"Failed to create read replica engine {replica_url}: {e}")

    # If no replicas available, use HAProxy read endpoint
    if not read_engines and READ_CONNECTION_STRING:
        try:
            haproxy_read_engine = create_engine(
                READ_CONNECTION_STRING,
                echo=DATABASE_CONFIG["echo"],
                pool_pre_ping=DATABASE_CONFIG["pool_pre_ping"],
                pool_recycle=DATABASE_CONFIG["pool_recycle"],
                pool_size=READ_REPLICA_CONFIG["pool_size"],
                max_overflow=READ_REPLICA_CONFIG["max_overflow"],
                pool_timeout=READ_REPLICA_CONFIG["pool_timeout"],
                connect_args=READ_REPLICA_CONFIG["connect_args"]
            )
            read_engines.append(haproxy_read_engine)
            logger.info("Using HAProxy read endpoint for replicas")
        except Exception as e:
            logger.warning(f"Failed to create HAProxy read engine: {e}")

# Read session factories
ReadSessionLocals = []
for read_engine in read_engines:
    ReadSessionLocals.append(
        sessionmaker(autocommit=False, autoflush=False, bind=read_engine)
    )

def set_instance_context(instance_id: str):
    """Set instance context for row-level security"""
    if USE_POSTGRESQL:
        with engine.connect() as conn:
            conn.execute(f"SET app.current_instance_id = '{instance_id}'")
            conn.commit()

def get_instance_id() -> str:
    """Get current instance ID"""
    return postgresql_settings.instance_id

def get_random_read_engine():
    """Get a random read replica engine for load balancing"""
    if read_engines:
        return random.choice(read_engines)
    return engine

def get_read_session():
    """Get a read-only session (uses replicas if available)"""
    if ReadSessionLocals:
        # Use random replica for load balancing
        session_local = random.choice(ReadSessionLocals)
        return session_local()
    else:
        # Fallback to primary engine
        return SessionLocal()

def create_tables():
    """Create all database tables"""
    Base.metadata.create_all(bind=engine)
    logger.info("Database tables created successfully")

def get_db() -> Generator[Session, None, None]:
    """Get database session"""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

class DatabaseManager:
    """Database manager for common operations"""

    def __init__(self):
        self.engine = engine

    async def create_session(self, session_id: str, action: str, device_id: str = None) -> str:
        """Create new automation session"""
        with SessionLocal() as db:
            from .database import AutomationSession

            session = AutomationSession(
                session_id=session_id,
                action=action,
                status="started",
                device_id=device_id
            )
            db.add(session)
            db.commit()
            db.refresh(session)
            return session.id

    async def update_session(self, session_id: str, status: str, error_message: str = None, screenshots_taken: int = None):
        """Update session status"""
        with SessionLocal() as db:
            from .database import AutomationSession

            session = db.query(AutomationSession).filter(AutomationSession.session_id == session_id).first()
            if session:
                session.status = status
                if error_message:
                    session.error_message = error_message
                if screenshots_taken is not None:
                    session.screenshots_taken = screenshots_taken
                if status == "completed":
                    from datetime import datetime
                    session.completed_at = datetime.utcnow()

                db.commit()

    async def log_perplexity_query(self, query_text: str, session_id: str, model_used: str = None, screenshot_path: str = None, response_time: float = None):
        """Log Perplexity query"""
        with SessionLocal() as db:
            from .database import PerplexityQuery

            query = PerplexityQuery(
                query_text=query_text,
                session_id=session_id,
                model_used=model_used,
                screenshot_path=screenshot_path,
                response_time=response_time,
                response_received=True
            )
            db.add(query)
            db.commit()

    async def update_device_status(self, device_id: str, connected: bool, battery_level: int = None, model: str = None, app_version: str = None):
        """Update device status"""
        with SessionLocal() as db:
            from .database import DeviceStatus
            from datetime import datetime

            device = db.query(DeviceStatus).filter(DeviceStatus.device_id == device_id).first()
            if device:
                device.connected = connected
                device.battery_level = battery_level or device.battery_level
                device.model = model or device.model
                device.app_version = app_version or device.app_version
                device.last_seen = datetime.utcnow()
            else:
                device = DeviceStatus(
                    device_id=device_id,
                    connected=connected,
                    battery_level=battery_level,
                    model=model,
                    app_version=app_version
                )
                db.add(device)

            db.commit()

    async def log_model_exploration(self, app_name: str, models_found: list, exploration_method: str, screenshot_paths: list, success: bool, session_id: str):
        """Log model exploration results"""
        with SessionLocal() as db:
            from .database import ModelExploration
            import json

            exploration = ModelExploration(
                app_name=app_name,
                models_found=json.dumps(models_found),
                exploration_method=exploration_method,
                screenshot_paths=json.dumps(screenshot_paths),
                success=success,
                session_id=session_id
            )
            db.add(exploration)
            db.commit()

    async def get_recent_sessions(self, limit: int = 10):
        """Get recent automation sessions"""
        with SessionLocal() as db:
            from .database import AutomationSession

            return db.query(AutomationSession).order_by(AutomationSession.created_at.desc()).limit(limit).all()

    async def get_device_history(self, device_id: str, limit: int = 50):
        """Get device automation history"""
        with SessionLocal() as db:
            from .database import AutomationSession

            return db.query(AutomationSession).filter(
                AutomationSession.device_id == device_id
            ).order_by(AutomationSession.created_at.desc()).limit(limit).all()

    async def get_perplexity_stats(self):
        """Get Perplexity usage statistics"""
        with SessionLocal() as db:
            from .database import PerplexityQuery
            from sqlalchemy import func

            total_queries = db.query(PerplexityQuery).count()
            avg_response_time = db.query(func.avg(PerplexityQuery.response_time)).scalar() or 0
            models_used = db.query(PerplexityQuery.model_used).distinct().all()

            return {
                "total_queries": total_queries,
                "average_response_time": round(avg_response_time, 2),
                "models_used": [model[0] for model in models_used if model[0]]
            }

    async def get_session(self, session_id: str):
        """Get a specific session by ID"""
        with SessionLocal() as db:
            from .database import AutomationSession

            return db.query(AutomationSession).filter(AutomationSession.session_id == session_id).first()

    async def save_ai_test_result(self, test_result: dict, session_id: str):
        """Save AI test result to database"""
        with SessionLocal() as db:
            from .database import AITestResult
            import json

            db_result = AITestResult(
                test_id=test_result.get("test_id"),
                session_id=session_id,
                test_type=test_result.get("test_type"),
                provider=test_result.get("provider"),
                model=test_result.get("model"),
                success=test_result.get("success", False),
                response_text=test_result.get("response"),
                error_message=test_result.get("error"),
                execution_time=test_result.get("execution_time", 0.0),
                response_length=test_result.get("response_length", 0),
                estimated_cost=test_result.get("estimated_cost"),
                token_usage=json.dumps(test_result.get("token_usage")) if test_result.get("token_usage") else None,
                quality_score=test_result.get("quality_score"),
                test_prompt=test_result.get("test_prompt"),
                test_metadata=json.dumps(test_result.get("metadata", {}))
            )
            db.add(db_result)
            db.commit()

    async def get_ai_test_history(self, limit: int = 50, provider: str = None, test_type: str = None):
        """Get AI test history from database"""
        with SessionLocal() as db:
            from .database import AITestResult

            query = db.query(AITestResult)

            if provider:
                query = query.filter(AITestResult.provider == provider)
            if test_type:
                query = query.filter(AITestResult.test_type == test_type)

            return query.order_by(AITestResult.created_at.desc()).limit(limit).all()

    async def get_ai_test_stats(self):
        """Get AI testing statistics"""
        with SessionLocal() as db:
            from .database import AITestResult
            from sqlalchemy import func

            total_tests = db.query(AITestResult).count()
            successful_tests = db.query(AITestResult).filter(AITestResult.success == True).count()
            provider_stats = db.query(
                AITestResult.provider,
                func.count(AITestResult.id).label('total'),
                func.sum(func.case([(AITestResult.success == True, 1)], else_=0)).label('successful'),
                func.avg(AITestResult.execution_time).label('avg_time')
            ).group_by(AITestResult.provider).all()

            return {
                "total_tests": total_tests,
                "success_rate": (successful_tests / total_tests * 100) if total_tests > 0 else 0,
                "provider_stats": [
                    {
                        "provider": stat.provider,
                        "total_tests": stat.total,
                        "successful_tests": stat.successful,
                        "success_rate": (stat.successful / stat.total * 100) if stat.total > 0 else 0,
                        "average_execution_time": round(stat.avg_time, 2)
                    }
                    for stat in provider_stats
                ]
            }

# Global database manager instance
db_manager = DatabaseManager()