"""
Consul Service Registry for ISH Chat System
Handles automatic service registration, deregistration, and discovery
"""
import asyncio
import json
import logging
import time
import uuid
from datetime import datetime, timedelta
from typing import Dict, List, Optional, Any, Union
from dataclasses import dataclass, field, asdict
from enum import Enum
import aiohttp
import consul.aio
import consul
from urllib.parse import urljoin

from ..models.instance_manager import AIInstance, ProviderType, InstanceStatus
from ..database.database import get_db

logger = logging.getLogger(__name__)

class ServiceType(Enum):
    """Service types in the ISH Chat system"""
    AI_PROVIDER = "ai_provider"
    INSTANCE_MANAGER = "instance_manager"
    INTELLIGENT_ROUTER = "intelligent_router"
    LOAD_BALANCER = "load_balancer"
    DATABASE = "database"
    CACHE = "cache"
    MONITORING = "monitoring"
    API_GATEWAY = "api_gateway"
    WEB_UI = "web_ui"
    MOBILE_APP = "mobile_app"

class ServiceStatus(Enum):
    """Service registration status"""
    REGISTERING = "registering"
    REGISTERED = "registered"
    DEREGISTERING = "deregistering"
    DEREGISTERED = "deregistered"
    FAILED = "failed"

@dataclass
class ServiceDefinition:
    """Service definition for Consul registration"""
    service_id: str
    service_name: str
    service_type: ServiceType
    address: str
    port: int
    tags: List[str] = field(default_factory=list)
    meta: Dict[str, str] = field(default_factory=dict)
    check: Optional[Dict[str, Any]] = None
    
    def to_consul_service(self) -> Dict[str, Any]:
        """Convert to Consul service format"""
        service_data = {
            "ID": self.service_id,
            "Name": self.service_name,
            "Address": self.address,
            "Port": self.port,
            "Tags": self.tags,
            "Meta": self.meta,
        }
        
        if self.check:
            service_data["Check"] = self.check
            
        return service_data

@dataclass
class HealthCheck:
    """Health check configuration"""
    http: Optional[str] = None
    tcp: Optional[str] = None
    grpc: Optional[str] = None
    interval: str = "10s"
    timeout: str = "5s"
    deregister_critical_service_after: str = "30s"
    success_before_passing: int = 1
    failures_before_critical: int = 3
    
    def to_dict(self) -> Dict[str, Any]:
        """Convert to Consul health check format"""
        check = {
            "Interval": self.interval,
            "Timeout": self.timeout,
            "DeregisterCriticalServiceAfter": self.deregister_critical_service_after,
        }
        
        if self.http:
            check["HTTP"] = self.http
        elif self.tcp:
            check["TCP"] = self.tcp
        elif self.grpc:
            check["GRPC"] = self.grpc
            
        return check

@dataclass
class ServiceRegistration:
    """Service registration record"""
    service_id: str
    service_definition: ServiceDefinition
    status: ServiceStatus
    registered_at: Optional[datetime] = None
    deregistered_at: Optional[datetime] = None
    last_health_check: Optional[datetime] = None
    error_message: Optional[str] = None
    registration_attempts: int = 0

class ConsulServiceRegistry:
    """Main Consul service registry"""
    
    def __init__(
        self,
        consul_host: str = "localhost",
        consul_port: int = 8500,
        consul_token: Optional[str] = None,
        datacenter: str = "ish-chat-dc1"
    ):
        self.consul_host = consul_host
        self.consul_port = consul_port
        self.consul_token = consul_token
        self.datacenter = datacenter
        
        # Consul clients
        self.consul_async = consul.aio.Consul(
            host=consul_host,
            port=consul_port,
            token=consul_token,
            datacenter=datacenter
        )
        
        self.consul_sync = consul.Consul(
            host=consul_host,
            port=consul_port,
            token=consul_token,
            datacenter=datacenter
        )
        
        # Service registration tracking
        self.registrations: Dict[str, ServiceRegistration] = {}
        self.registration_lock = asyncio.Lock()
        
        # Background tasks
        self.health_check_task = None
        self.service_sync_task = None
        self._shutdown_event = asyncio.Event()
        
        # Configuration
        self.health_check_interval = 30  # seconds
        self.service_sync_interval = 60   # seconds
        self.max_registration_attempts = 5
        
    async def start(self):
        """Start the service registry"""
        logger.info("Starting Consul Service Registry")
        
        # Start background tasks
        self.health_check_task = asyncio.create_task(self._health_check_loop())
        self.service_sync_task = asyncio.create_task(self._service_sync_loop())
        
        # Test connection to Consul
        await self._test_consul_connection()
        
        logger.info("Consul Service Registry started successfully")
    
    async def stop(self):
        """Stop the service registry"""
        logger.info("Stopping Consul Service Registry")
        
        # Signal shutdown
        self._shutdown_event.set()
        
        # Cancel background tasks
        if self.health_check_task:
            self.health_check_task.cancel()
        if self.service_sync_task:
            self.service_sync_task.cancel()
        
        # Deregister all services
        await self.deregister_all_services()
        
        # Close Consul connections
        await self.consul_async.close()
        
        logger.info("Consul Service Registry stopped")
    
    async def register_service(
        self,
        service_definition: ServiceDefinition,
        auto_deregister: bool = True
    ) -> bool:
        """Register a service with Consul"""
        
        async with self.registration_lock:
            service_id = service_definition.service_id
            
            if service_id in self.registrations:
                logger.warning(f"Service {service_id} already registered")
                return False
            
            # Create registration record
            registration = ServiceRegistration(
                service_id=service_id,
                service_definition=service_definition,
                status=ServiceStatus.REGISTERING,
                registration_attempts=1
            )
            
            self.registrations[service_id] = registration
            
            try:
                # Convert to Consul format
                consul_service = service_definition.to_consul_service()
                
                # Register with Consul
                success = await self.consul_async.agent.service.register(
                    name=consul_service["Name"],
                    service_id=consul_service["ID"],
                    address=consul_service["Address"],
                    port=consul_service["Port"],
                    tags=consul_service["Tags"],
                    meta=consul_service["Meta"],
                    check=consul_service.get("Check")
                )
                
                if success:
                    registration.status = ServiceStatus.REGISTERED
                    registration.registered_at = datetime.utcnow()
                    logger.info(f"Successfully registered service: {service_id}")
                    return True
                else:
                    registration.status = ServiceStatus.FAILED
                    registration.error_message = "Consul registration returned False"
                    logger.error(f"Failed to register service {service_id}: Consul returned False")
                    return False
                    
            except Exception as e:
                registration.status = ServiceStatus.FAILED
                registration.error_message = str(e)
                logger.error(f"Failed to register service {service_id}: {str(e)}")
                
                # Retry registration
                if registration.registration_attempts < self.max_registration_attempts:
                    await asyncio.sleep(5)
                    return await self.register_service(service_definition, auto_deregister)
                
                return False
    
    async def deregister_service(self, service_id: str) -> bool:
        """Deregister a service from Consul"""
        
        async with self.registration_lock:
            if service_id not in self.registrations:
                logger.warning(f"Service {service_id} not found in registry")
                return False
            
            registration = self.registrations[service_id]
            registration.status = ServiceStatus.DEREGISTERING
            
            try:
                success = await self.consul_async.agent.service.deregister(service_id)
                
                if success:
                    registration.status = ServiceStatus.DEREGISTERED
                    registration.deregistered_at = datetime.utcnow()
                    logger.info(f"Successfully deregistered service: {service_id}")
                    return True
                else:
                    registration.status = ServiceStatus.FAILED
                    registration.error_message = "Consul deregistration returned False"
                    logger.error(f"Failed to deregister service {service_id}: Consul returned False")
                    return False
                    
            except Exception as e:
                registration.status = ServiceStatus.FAILED
                registration.error_message = str(e)
                logger.error(f"Failed to deregister service {service_id}: {str(e)}")
                return False
            finally:
                # Remove from registry
                self.registrations.pop(service_id, None)
    
    async def deregister_all_services(self):
        """Deregister all services"""
        logger.info("Deregistering all services")
        
        service_ids = list(self.registrations.keys())
        for service_id in service_ids:
            await self.deregister_service(service_id)
    
    async def discover_services(
        self,
        service_name: Optional[str] = None,
        service_type: Optional[str] = None,
        tags: Optional[List[str]] = None,
        only_passing: bool = True
    ) -> List[Dict[str, Any]]:
        """Discover services from Consul"""
        
        try:
            # Build service filter
            filter_expr = None
            if service_type:
                filter_expr = f'Service.Meta.service_type == "{service_type}"'
            
            # Get services from Consul
            if service_name:
                services, index = await self.consul_async.health.service(
                    service_name,
                    passing=only_passing,
                    filter=filter_expr
                )
            else:
                # Get all services
                services, index = await self.consul_async.health.service(
                    "",
                    passing=only_passing,
                    filter=filter_expr
                )
            
            # Convert to service information
            discovered_services = []
            for service in services:
                service_info = {
                    "service_id": service["Service"]["ID"],
                    "service_name": service["Service"]["Service"],
                    "service_type": service["Service"]["Meta"].get("service_type"),
                    "address": service["Service"]["Address"],
                    "port": service["Service"]["Port"],
                    "tags": service["Service"]["Tags"],
                    "meta": service["Service"]["Meta"],
                    "status": "passing" if service["Checks"] else "unknown",
                    "health_checks": []
                }
                
                # Add health check information
                for check in service["Checks"]:
                    service_info["health_checks"].append({
                        "check_id": check["CheckID"],
                        "status": check["Status"],
                        "output": check.get("Output", ""),
                        "service_id": check.get("ServiceID", ""),
                    })
                
                discovered_services.append(service_info)
            
            # Filter by tags if specified
            if tags:
                discovered_services = [
                    s for s in discovered_services
                    if any(tag in s["tags"] for tag in tags)
                ]
            
            logger.debug(f"Discovered {len(discovered_services)} services")
            return discovered_services
            
        except Exception as e:
            logger.error(f"Failed to discover services: {str(e)}")
            return []
    
    async def get_service_health(self, service_id: str) -> Dict[str, Any]:
        """Get health status for a specific service"""
        
        try:
            checks, index = await self.consul_async.health.checks(service_id)
            
            health_info = {
                "service_id": service_id,
                "status": "passing",
                "checks": []
            }
            
            for check in checks:
                check_info = {
                    "check_id": check["CheckID"],
                    "name": check["Name"],
                    "status": check["Status"],
                    "output": check.get("Output", ""),
                    "service_id": check.get("ServiceID", ""),
                    "timestamp": check.get("Timestamp", ""),
                }
                health_info["checks"].append(check_info)
                
                # Determine overall status
                if check["Status"] == "critical":
                    health_info["status"] = "critical"
                elif check["Status"] == "warning" and health_info["status"] != "critical":
                    health_info["status"] = "warning"
            
            return health_info
            
        except Exception as e:
            logger.error(f"Failed to get service health for {service_id}: {str(e)}")
            return {"service_id": service_id, "status": "unknown", "error": str(e)}
    
    async def register_ai_instance(self, instance: AIInstance) -> bool:
        """Register an AI instance as a service"""
        
        # Create service definition
        service_id = f"ai-{instance.provider_type.value}-{instance.instance_id}"
        service_name = f"ai-provider-{instance.provider_type.value}"
        
        # Health check endpoint
        health_check_url = f"http://{instance.endpoint_url.replace('https://', 'http://')}/health"
        
        # Create health check
        health_check = HealthCheck(
            http=health_check_url,
            interval="30s",
            timeout="10s",
            deregister_critical_service_after="60s"
        )
        
        # Service tags
        tags = [
            "ai-provider",
            instance.provider_type.value,
            instance.model_name,
            instance.region or "default"
        ]
        
        # Service metadata
        meta = {
            "service_type": ServiceType.AI_PROVIDER.value,
            "provider_type": instance.provider_type.value,
            "model_name": instance.model_name,
            "instance_id": instance.instance_id,
            "instance_name": instance.instance_name,
            "region": instance.region or "default",
            "version": instance.version or "latest",
            "max_concurrent_requests": str(instance.max_concurrent_requests),
            "max_tokens_per_minute": str(instance.max_tokens_per_minute),
            "priority": str(instance.priority),
            "registered_at": datetime.utcnow().isoformat()
        }
        
        # Add performance metadata
        if instance.success_rate:
            meta["success_rate"] = str(instance.success_rate)
        if instance.average_response_time:
            meta["average_response_time"] = str(instance.average_response_time)
        
        service_definition = ServiceDefinition(
            service_id=service_id,
            service_name=service_name,
            service_type=ServiceType.AI_PROVIDER,
            address=instance.endpoint_url.split("://")[1].split("/")[0],
            port=443 if instance.endpoint_url.startswith("https://") else 80,
            tags=tags,
            meta=meta,
            check=health_check.to_dict()
        )
        
        return await self.register_service(service_definition)
    
    async def register_instance_manager(self, host: str, port: int) -> bool:
        """Register the Instance Manager service"""
        
        service_id = "instance-manager-1"
        service_name = "instance-manager"
        
        health_check = HealthCheck(
            http=f"http://{host}:{port}/health/instance-manager",
            interval="30s",
            timeout="10s"
        )
        
        tags = ["core-service", "instance-manager"]
        
        meta = {
            "service_type": ServiceType.INSTANCE_MANAGER.value,
            "version": "1.0.0",
            "registered_at": datetime.utcnow().isoformat()
        }
        
        service_definition = ServiceDefinition(
            service_id=service_id,
            service_name=service_name,
            service_type=ServiceType.INSTANCE_MANAGER,
            address=host,
            port=port,
            tags=tags,
            meta=meta,
            check=health_check.to_dict()
        )
        
        return await self.register_service(service_definition)
    
    async def register_intelligent_router(self, host: str, port: int) -> bool:
        """Register the Intelligent Router service"""
        
        service_id = "intelligent-router-1"
        service_name = "intelligent-router"
        
        health_check = HealthCheck(
            http=f"http://{host}:{port}/health/router",
            interval="30s",
            timeout="10s"
        )
        
        tags = ["core-service", "intelligent-router"]
        
        meta = {
            "service_type": ServiceType.INTELLIGENT_ROUTER.value,
            "version": "1.0.0",
            "registered_at": datetime.utcnow().isoformat()
        }
        
        service_definition = ServiceDefinition(
            service_id=service_id,
            service_name=service_name,
            service_type=ServiceType.INTELLIGENT_ROUTER,
            address=host,
            port=port,
            tags=tags,
            meta=meta,
            check=health_check.to_dict()
        )
        
        return await self.register_service(service_definition)
    
    async def register_load_balancer(self, host: str, port: int) -> bool:
        """Register the Load Balancer service"""
        
        service_id = "load-balancer-1"
        service_name = "load-balancer"
        
        health_check = HealthCheck(
            http=f"http://{host}:{port}/health/load-balancer",
            interval="30s",
            timeout="10s"
        )
        
        tags = ["core-service", "load-balancer"]
        
        meta = {
            "service_type": ServiceType.LOAD_BALANCER.value,
            "version": "1.0.0",
            "registered_at": datetime.utcnow().isoformat()
        }
        
        service_definition = ServiceDefinition(
            service_id=service_id,
            service_name=service_name,
            service_type=ServiceType.LOAD_BALANCER,
            address=host,
            port=port,
            tags=tags,
            meta=meta,
            check=health_check.to_dict()
        )
        
        return await self.register_service(service_definition)
    
    async def _test_consul_connection(self):
        """Test connection to Consul"""
        try:
            await self.consul_async.agent.self()
            logger.info("Successfully connected to Consul")
        except Exception as e:
            logger.error(f"Failed to connect to Consul: {str(e)}")
            raise
    
    async def _health_check_loop(self):
        """Background health check loop"""
        logger.info("Starting health check loop")
        
        while not self._shutdown_event.is_set():
            try:
                await self._perform_health_checks()
                await asyncio.sleep(self.health_check_interval)
            except asyncio.CancelledError:
                break
            except Exception as e:
                logger.error(f"Error in health check loop: {str(e)}")
                await asyncio.sleep(5)
    
    async def _service_sync_loop(self):
        """Background service synchronization loop"""
        logger.info("Starting service sync loop")
        
        while not self._shutdown_event.is_set():
            try:
                await self._sync_services()
                await asyncio.sleep(self.service_sync_interval)
            except asyncio.CancelledError:
                break
            except Exception as e:
                logger.error(f"Error in service sync loop: {str(e)}")
                await asyncio.sleep(5)
    
    async def _perform_health_checks(self):
        """Perform health checks for registered services"""
        
        for service_id, registration in list(self.registrations.items()):
            try:
                health_info = await self.get_service_health(service_id)
                registration.last_health_check = datetime.utcnow()
                
                # Update service metadata based on health
                if health_info["status"] == "critical":
                    logger.warning(f"Service {service_id} is critical: {health_info}")
                elif health_info["status"] == "warning":
                    logger.info(f"Service {service_id} has warnings: {health_info}")
                
            except Exception as e:
                logger.error(f"Failed to check health for {service_id}: {str(e)}")
    
    async def _sync_services(self):
        """Synchronize services with database"""
        
        try:
            # Sync AI instances from database
            db = next(get_db())
            try:
                # Get all active AI instances
                from ..models.instance_manager import AIInstance, InstanceStatus
                
                active_instances = db.query(AIInstance).filter(
                    AIInstance.is_active == True,
                    AIInstance.status.in_([InstanceStatus.HEALTHY, InstanceStatus.STARTING])
                ).all()
                
                # Register any missing instances
                for instance in active_instances:
                    service_id = f"ai-{instance.provider_type.value}-{instance.instance_id}"
                    if service_id not in self.registrations:
                        logger.info(f"Registering missing AI instance: {service_id}")
                        await self.register_ai_instance(instance)
                
                # Deregister services for inactive instances
                for service_id, registration in list(self.registrations.items()):
                    if (registration.service_definition.service_type == ServiceType.AI_PROVIDER and
                        service_id.startswith("ai-")):
                        
                        # Extract instance ID from service ID
                        parts = service_id.split("-", 2)
                        if len(parts) == 3:
                            provider_type_str, instance_id = parts[1], parts[2]
                            
                            # Check if instance still exists and is active
                            instance = db.query(AIInstance).filter(
                                AIInstance.instance_id == instance_id
                            ).first()
                            
                            if not instance or not instance.is_active:
                                logger.info(f"Deregistering inactive AI instance: {service_id}")
                                await self.deregister_service(service_id)
                
            finally:
                db.close()
                
        except Exception as e:
            logger.error(f"Failed to sync services: {str(e)}")
    
    async def get_registry_status(self) -> Dict[str, Any]:
        """Get registry status and statistics"""
        
        status = {
            "consul_connected": False,
            "total_services": len(self.registrations),
            "registered_services": 0,
            "failed_services": 0,
            "service_types": {},
            "services": []
        }
        
        try:
            # Test Consul connection
            await self.consul_async.agent.self()
            status["consul_connected"] = True
        except:
            pass
        
        # Count services by status
        for registration in self.registrations.values():
            if registration.status == ServiceStatus.REGISTERED:
                status["registered_services"] += 1
            elif registration.status == ServiceStatus.FAILED:
                status["failed_services"] += 1
            
            service_type = registration.service_definition.service_type.value
            status["service_types"][service_type] = status["service_types"].get(service_type, 0) + 1
            
            # Add service details
            status["services"].append({
                "service_id": registration.service_id,
                "service_name": registration.service_definition.service_name,
                "service_type": registration.service_definition.service_type.value,
                "status": registration.status.value,
                "registered_at": registration.registered_at.isoformat() if registration.registered_at else None,
                "last_health_check": registration.last_health_check.isoformat() if registration.last_health_check else None,
                "error_message": registration.error_message
            })
        
        return status

# Global registry instance
consul_service_registry = None

def get_consul_service_registry(
    consul_host: str = "localhost",
    consul_port: int = 8500,
    consul_token: Optional[str] = None
) -> ConsulServiceRegistry:
    """Get or create global Consul service registry instance"""
    global consul_service_registry
    if consul_service_registry is None:
        consul_service_registry = ConsulServiceRegistry(
            consul_host=consul_host,
            consul_port=consul_port,
            consul_token=consul_token
        )
    return consul_service_registry