"""
Main Instance Manager Application - Integrated AI Instance Management System
"""
import asyncio
import logging
import signal
import sys
from contextlib import asynccontextmanager
from typing import Optional

import redis
from fastapi import FastAPI, HTTPException, Depends
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session

from .config.settings import settings
from .database.database import engine, SessionLocal, get_db
from .models.instance_manager import Base
from .services.instance_manager_service import InstanceManagerService
from .services.health_monitoring_service import HealthMonitoringService, HealthCheckConfig
from .services.load_balancer_service import LoadBalancerService, FailoverConfig
from .services.auto_scaling_service import AutoScalingService
from .services.performance_monitoring_service import PerformanceMonitoringService
from .services.configuration_service import ConfigurationService
from .api.instance_manager_api import router as instance_manager_router

# Configure logging
logging.basicConfig(
    level=getattr(logging, settings.log_level.upper()),
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# Global service instances
instance_manager: Optional[InstanceManagerService] = None
health_monitor: Optional[HealthMonitoringService] = None
load_balancer: Optional[LoadBalancerService] = None
auto_scaler: Optional[AutoScalingService] = None
performance_monitor: Optional[PerformanceMonitoringService] = None
config_service: Optional[ConfigurationService] = None
redis_client: Optional[redis.Redis] = None

class InstanceManagerApp:
    """Main Instance Manager Application"""
    
    def __init__(self):
        self.instance_manager = None
        self.health_monitor = None
        self.load_balancer = None
        self.auto_scaler = None
        self.performance_monitor = None
        self.config_service = None
        self.redis_client = None
        self.db_session = None
        self._shutdown_event = asyncio.Event()
    
    async def initialize(self):
        """Initialize all services and connections"""
        
        try:
            logger.info("Initializing Instance Manager Application...")
            
            # Initialize database
            await self._initialize_database()
            
            # Initialize Redis
            await self._initialize_redis()
            
            # Initialize configuration service
            await self._initialize_configuration_service()
            
            # Initialize core services
            await self._initialize_services()
            
            # Register signal handlers
            self._register_signal_handlers()
            
            logger.info("Instance Manager Application initialized successfully")
            
        except Exception as e:
            logger.error(f"Failed to initialize application: {e}")
            raise
    
    async def _initialize_database(self):
        """Initialize database connection and tables"""
        
        try:
            logger.info("Initializing database...")
            
            # Create tables
            Base.metadata.create_all(bind=engine)
            
            # Create database session
            self.db_session = SessionLocal()
            
            logger.info("Database initialized successfully")
            
        except Exception as e:
            logger.error(f"Failed to initialize database: {e}")
            raise
    
    async def _initialize_redis(self):
        """Initialize Redis connection"""
        
        try:
            logger.info("Initializing Redis connection...")
            
            # Create Redis client
            self.redis_client = redis.Redis(
                host=getattr(settings, 'redis_host', 'localhost'),
                port=getattr(settings, 'redis_port', 6379),
                db=getattr(settings, 'redis_db', 0),
                password=getattr(settings, 'redis_password', None),
                decode_responses=True
            )
            
            # Test connection
            self.redis_client.ping()
            
            logger.info("Redis connection established successfully")
            
        except Exception as e:
            logger.warning(f"Failed to connect to Redis: {e}")
            logger.info("Continuing without Redis caching")
            self.redis_client = None
    
    async def _initialize_configuration_service(self):
        """Initialize configuration service"""
        
        try:
            logger.info("Initializing configuration service...")
            
            # Initialize configuration service
            config_dir = getattr(settings, 'config_dir', 'config')
            self.config_service = ConfigurationService(config_dir)
            
            # Load configuration from environment if available
            self.config_service.load_from_environment()
            
            logger.info("Configuration service initialized successfully")
            
        except Exception as e:
            logger.error(f"Failed to initialize configuration service: {e}")
            raise
    
    async def _initialize_services(self):
        """Initialize all core services"""
        
        try:
            logger.info("Initializing core services...")
            
            # Get database session
            db = self.db_session
            
            # Initialize instance manager
            self.instance_manager = InstanceManagerService(self.redis_client)
            
            # Initialize health monitoring service
            health_check_config = HealthCheckConfig(
                interval_seconds=self.config_service.get_config("monitoring.health_check_interval", 30),
                timeout_seconds=self.config_service.get_config("load_balancer.health_check_timeout", 10),
                max_failures=self.config_service.get_config("load_balancer.unhealthy_threshold", 3),
                enabled=self.config_service.get_config("monitoring.enabled", True)
            )
            self.health_monitor = HealthMonitoringService(
                self.instance_manager, 
                health_check_config
            )
            
            # Initialize load balancer service
            failover_config = FailoverConfig(
                max_attempts=self.config_service.get_config("load_balancer.max_failover_attempts", 3),
                timeout_per_attempt=self.config_service.get_config("global.instance_manager.default_timeout", 30),
                enable_circuit_breaker=self.config_service.get_config("load_balancer.circuit_breaker_enabled", True),
                circuit_breaker_threshold=self.config_service.get_config("load_balancer.circuit_breaker_threshold", 5),
                circuit_breaker_timeout=self.config_service.get_config("load_balancer.circuit_breaker_timeout", 60)
            )
            self.load_balancer = LoadBalancerService(
                self.instance_manager,
                failover_config
            )
            
            # Initialize auto-scaling service
            self.auto_scaler = AutoScalingService(
                self.instance_manager,
                self.health_monitor
            )
            
            # Initialize performance monitoring service
            self.performance_monitor = PerformanceMonitoringService()
            
            # Update global instances for API router
            global instance_manager, health_monitor, load_balancer, auto_scaler, performance_monitor, config_service, redis_client
            instance_manager = self.instance_manager
            health_monitor = self.health_monitor
            load_balancer = self.load_balancer
            auto_scaler = self.auto_scaler
            performance_monitor = self.performance_monitor
            config_service = self.config_service
            redis_client = self.redis_client
            
            logger.info("Core services initialized successfully")
            
        except Exception as e:
            logger.error(f"Failed to initialize services: {e}")
            raise
    
    async def start_services(self):
        """Start all background services"""
        
        try:
            logger.info("Starting background services...")
            
            db = self.db_session
            
            # Start health monitoring
            if self.config_service.get_config("monitoring.enabled", True):
                await self.health_monitor.start_monitoring(db)
                logger.info("Health monitoring started")
            
            # Start auto-scaling
            if self.config_service.get_config("auto_scaling.enabled", True):
                await self.auto_scaler.start_auto_scaling(db)
                logger.info("Auto-scaling started")
            
            # Start performance monitoring
            if self.config_service.get_config("monitoring.enabled", True):
                monitoring_interval = self.config_service.get_config("monitoring.metrics_collection_interval", 60)
                await self.performance_monitor.start_monitoring(db, monitoring_interval)
                logger.info("Performance monitoring started")
            
            logger.info("All background services started successfully")
            
        except Exception as e:
            logger.error(f"Failed to start services: {e}")
            raise
    
    async def stop_services(self):
        """Stop all background services"""
        
        try:
            logger.info("Stopping background services...")
            
            # Stop performance monitoring
            if self.performance_monitor:
                await self.performance_monitor.stop_monitoring()
                logger.info("Performance monitoring stopped")
            
            # Stop auto-scaling
            if self.auto_scaler:
                await self.auto_scaler.stop_auto_scaling()
                logger.info("Auto-scaling stopped")
            
            # Stop health monitoring
            if self.health_monitor:
                await self.health_monitor.stop_monitoring()
                logger.info("Health monitoring stopped")
            
            # Close HTTP client
            if self.instance_manager and hasattr(self.instance_manager, 'http_client'):
                await self.instance_manager.http_client.aclose()
            
            # Close database session
            if self.db_session:
                self.db_session.close()
                logger.info("Database session closed")
            
            # Close Redis connection
            if self.redis_client:
                self.redis_client.close()
                logger.info("Redis connection closed")
            
            logger.info("All background services stopped successfully")
            
        except Exception as e:
            logger.error(f"Error stopping services: {e}")
    
    def _register_signal_handlers(self):
        """Register signal handlers for graceful shutdown"""
        
        def signal_handler(signum, frame):
            logger.info(f"Received signal {signum}, initiating shutdown...")
            asyncio.create_task(self.shutdown())
        
        signal.signal(signal.SIGINT, signal_handler)
        signal.signal(signal.SIGTERM, signal_handler)
    
    async def shutdown(self):
        """Graceful shutdown"""
        
        logger.info("Initiating graceful shutdown...")
        
        # Set shutdown event
        self._shutdown_event.set()
        
        # Stop services
        await self.stop_services()
        
        logger.info("Instance Manager Application shutdown complete")

# Create global app instance
app_instance = InstanceManagerApp()

@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifespan manager"""
    
    # Startup
    try:
        await app_instance.initialize()
        await app_instance.start_services()
        logger.info("Instance Manager Application started successfully")
        yield
    except Exception as e:
        logger.error(f"Failed to start application: {e}")
        raise
    
    # Shutdown
    try:
        await app_instance.shutdown()
        logger.info("Instance Manager Application shutdown complete")
    except Exception as e:
        logger.error(f"Error during shutdown: {e}")

# Create FastAPI app
app = FastAPI(
    title="ISH Chat Instance Manager",
    description="Multi-instance AI model management with auto-scaling, health monitoring, and load balancing",
    version="1.0.0",
    lifespan=lifespan
)

# Add CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.allowed_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include API router
app.include_router(instance_manager_router)

# Health check endpoint
@app.get("/health")
async def health_check():
    """Overall health check for the Instance Manager"""
    
    try:
        # Check services status
        services_status = {
            "instance_manager": instance_manager is not None,
            "health_monitor": health_monitor is not None and health_monitor._running,
            "auto_scaler": auto_scaler is not None and auto_scaler._running,
            "load_balancer": load_balancer is not None,
            "performance_monitor": performance_monitor is not None and performance_monitor.monitoring_active,
            "redis": redis_client is not None,
            "database": True  # If we're here, DB is working
        }
        
        # Get configuration summary
        config_summary = config_service.get_config_summary() if config_service else {}
        
        # Overall status
        all_healthy = all(services_status.values())
        
        return {
            "status": "healthy" if all_healthy else "degraded",
            "timestamp": "2024-01-01T00:00:00Z",  # Would use actual timestamp
            "version": "1.0.0",
            "services": services_status,
            "configuration": config_summary
        }
        
    except Exception as e:
        logger.error(f"Health check failed: {e}")
        raise HTTPException(status_code=503, detail="Health check failed")

# Configuration endpoints
@app.get("/config")
async def get_configuration():
    """Get current configuration (non-sensitive)"""
    
    try:
        if not config_service:
            raise HTTPException(status_code=503, detail="Configuration service not available")
        
        summary = config_service.get_config_summary()
        return summary
        
    except Exception as e:
        logger.error(f"Failed to get configuration: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/config/export")
async def export_configuration(include_secrets: bool = False):
    """Export configuration to JSON"""
    
    try:
        if not config_service:
            raise HTTPException(status_code=503, detail="Configuration service not available")
        
        config_data = config_service.export_configuration(
            include_secrets=include_secrets
        )
        
        return {
            "configuration": config_data,
            "exported_at": "2024-01-01T00:00:00Z",
            "includes_secrets": include_secrets
        }
        
    except Exception as e:
        logger.error(f"Failed to export configuration: {e}")
        raise HTTPException(status_code=500, detail=str(e))

# System status endpoint
@app.get("/system/status")
async def get_system_status(db: Session = Depends(get_db)):
    """Get comprehensive system status"""
    
    try:
        # Get instance counts
        from .models.instance_manager import AIInstance, ProviderGroup
        
        total_instances = db.query(AIInstance).filter(
            AIInstance.is_active == True
        ).count()
        
        healthy_instances = db.query(AIInstance).filter(
            AIInstance.is_active == True,
            AIInstance.is_healthy == True
        ).count()
        
        # Get provider group counts
        total_groups = db.query(ProviderGroup).filter(
            ProviderGroup.is_active == True
        ).count()
        
        auto_scaling_groups = db.query(ProviderGroup).filter(
            ProviderGroup.is_active == True,
            ProviderGroup.auto_scaling_enabled == True
        ).count()
        
        # Service status
        services = {
            "instance_manager": instance_manager is not None,
            "health_monitor": {
                "active": health_monitor is not None and health_monitor._running,
                "monitored_instances": len(health_monitor._monitoring_tasks) if health_monitor else 0
            },
            "auto_scaler": {
                "active": auto_scaler is not None and auto_scaler._running,
                "managed_groups": len(auto_scaler._scaling_tasks) if auto_scaler else 0
            },
            "load_balancer": load_balancer is not None,
            "performance_monitor": {
                "active": performance_monitor is not None and performance_monitor.monitoring_active
            },
            "redis": redis_client is not None,
            "configuration": config_service is not None
        }
        
        return {
            "instances": {
                "total": total_instances,
                "healthy": healthy_instances,
                "unhealthy": total_instances - healthy_instances,
                "health_percentage": (healthy_instances / total_instances * 100) if total_instances > 0 else 0
            },
            "provider_groups": {
                "total": total_groups,
                "auto_scaling_enabled": auto_scaling_groups
            },
            "services": services,
            "uptime": "0h 0m 0s",  # Would calculate actual uptime
            "version": "1.0.0",
            "timestamp": "2024-01-01T00:00:00Z"
        }
        
    except Exception as e:
        logger.error(f"Failed to get system status: {e}")
        raise HTTPException(status_code=500, detail=str(e))

# Admin endpoints
@app.post("/admin/restart-services")
async def restart_services():
    """Restart background services (admin only)"""
    
    try:
        logger.info("Restarting background services...")
        
        # Stop services
        await app_instance.stop_services()
        
        # Brief pause
        await asyncio.sleep(2)
        
        # Start services
        await app_instance.start_services()
        
        logger.info("Background services restarted successfully")
        
        return {"message": "Background services restarted successfully"}
        
    except Exception as e:
        logger.error(f"Failed to restart services: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/admin/reload-configuration")
async def reload_configuration():
    """Reload configuration from files"""
    
    try:
        if not config_service:
            raise HTTPException(status_code=503, detail="Configuration service not available")
        
        config_service.load_configuration()
        logger.info("Configuration reloaded successfully")
        
        return {"message": "Configuration reloaded successfully"}
        
    except Exception as e:
        logger.error(f"Failed to reload configuration: {e}")
        raise HTTPException(status_code=500, detail=str(e))

if __name__ == "__main__":
    import uvicorn
    
    # Run the application
    uvicorn.run(
        "main_instance_manager:app",
        host=settings.host,
        port=settings.port,
        reload=settings.debug,
        log_level=settings.log_level.lower()
    )