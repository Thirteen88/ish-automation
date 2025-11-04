"""
Health Monitoring Service for AI instance health checks and monitoring
"""
import asyncio
import logging
from datetime import datetime, timedelta
from typing import Dict, List, Optional, Any
from dataclasses import dataclass
from enum import Enum
import json

from sqlalchemy.orm import Session
from sqlalchemy import and_, desc, func

from .instance_manager_service import InstanceManagerService
from ..models.instance_manager import (
    AIInstance, HealthCheck, InstanceMetrics, InstanceStatus
)
from ..database.database import get_db

logger = logging.getLogger(__name__)

class HealthCheckType(Enum):
    """Types of health checks"""
    BASIC = "basic"
    LOAD = "load"
    LATENCY = "latency"
    COMPREHENSIVE = "comprehensive"
    STRESS = "stress"

class HealthStatus(Enum):
    """Health status levels"""
    HEALTHY = "healthy"
    DEGRADED = "degraded"
    UNHEALTHY = "unhealthy"
    CRITICAL = "critical"

@dataclass
class HealthCheckConfig:
    """Configuration for health checks"""
    interval_seconds: int = 30
    timeout_seconds: int = 10
    max_failures: int = 3
    check_types: List[HealthCheckType] = None
    enabled: bool = True
    
    def __post_init__(self):
        if self.check_types is None:
            self.check_types = [HealthCheckType.BASIC]

@dataclass
class HealthReport:
    """Health check report for an instance"""
    instance_id: str
    status: HealthStatus
    score: float
    checks_performed: List[str]
    issues: List[str]
    metrics: Dict[str, Any]
    last_check: datetime
    next_check: datetime

class HealthMonitoringService:
    """Service for monitoring health of AI instances"""
    
    def __init__(
        self,
        instance_manager: InstanceManagerService,
        config: HealthCheckConfig = None
    ):
        self.instance_manager = instance_manager
        self.config = config or HealthCheckConfig()
        self._monitoring_tasks = {}
        self._health_cache = {}
        self._running = False
        
    async def start_monitoring(self, db: Session):
        """Start health monitoring for all active instances"""
        
        if self._running:
            logger.warning("Health monitoring is already running")
            return
        
        self._running = True
        
        # Get all active instances
        instances = db.query(AIInstance).filter(
            AIInstance.is_active == True
        ).all()
        
        # Start monitoring task for each instance
        for instance in instances:
            await self.start_instance_monitoring(db, instance.instance_id)
        
        logger.info(f"Started health monitoring for {len(instances)} instances")
    
    async def stop_monitoring(self):
        """Stop health monitoring"""
        
        self._running = False
        
        # Cancel all monitoring tasks
        for instance_id, task in self._monitoring_tasks.items():
            if not task.done():
                task.cancel()
                try:
                    await task
                except asyncio.CancelledError:
                    pass
        
        self._monitoring_tasks.clear()
        logger.info("Stopped health monitoring")
    
    async def start_instance_monitoring(self, db: Session, instance_id: str):
        """Start monitoring a specific instance"""
        
        if instance_id in self._monitoring_tasks:
            logger.warning(f"Instance {instance_id} is already being monitored")
            return
        
        # Create monitoring task
        task = asyncio.create_task(self._monitor_instance_loop(db, instance_id))
        self._monitoring_tasks[instance_id] = task
        
        logger.info(f"Started monitoring for instance: {instance_id}")
    
    async def stop_instance_monitoring(self, instance_id: str):
        """Stop monitoring a specific instance"""
        
        if instance_id not in self._monitoring_tasks:
            logger.warning(f"Instance {instance_id} is not being monitored")
            return
        
        # Cancel monitoring task
        task = self._monitoring_tasks[instance_id]
        if not task.done():
            task.cancel()
            try:
                await task
            except asyncio.CancelledError:
                pass
        
        del self._monitoring_tasks[instance_id]
        logger.info(f"Stopped monitoring for instance: {instance_id}")
    
    async def _monitor_instance_loop(self, db: Session, instance_id: str):
        """Main monitoring loop for an instance"""
        
        while self._running:
            try:
                # Get current instance state
                instance = await self.instance_manager.get_instance(db, instance_id)
                
                if not instance or not instance.is_active:
                    logger.info(f"Instance {instance_id} is no longer active, stopping monitoring")
                    break
                
                # Skip if instance is in maintenance
                if instance.status == InstanceStatus.MAINTENANCE:
                    await asyncio.sleep(self.config.interval_seconds * 2)  # Check less frequently
                    continue
                
                # Perform health checks
                await self._perform_scheduled_health_checks(db, instance)
                
                # Wait for next check
                await asyncio.sleep(self.config.interval_seconds)
                
            except asyncio.CancelledError:
                break
            except Exception as e:
                logger.error(f"Error in monitoring loop for {instance_id}: {e}")
                await asyncio.sleep(5)  # Brief pause before retrying
        
        # Clean up when loop ends
        if instance_id in self._monitoring_tasks:
            del self._monitoring_tasks[instance_id]
    
    async def _perform_scheduled_health_checks(self, db: Session, instance: AIInstance):
        """Perform scheduled health checks based on configuration"""
        
        # Determine which checks to perform
        checks_to_perform = self._get_scheduled_checks(instance)
        
        for check_type in checks_to_perform:
            try:
                await self._perform_health_check(db, instance, check_type)
            except Exception as e:
                logger.error(f"Health check {check_type.value} failed for {instance.instance_id}: {e}")
    
    def _get_scheduled_checks(self, instance: AIInstance) -> List[HealthCheckType]:
        """Determine which health checks to perform based on schedule"""
        
        # Always perform basic checks
        checks = [HealthCheckType.BASIC]
        
        # Add comprehensive checks every 5 minutes
        if not instance.last_health_check or \
           datetime.utcnow() - instance.last_health_check >= timedelta(minutes=5):
            checks.append(HealthCheckType.COMPREHENSIVE)
        
        # Add latency checks every 2 minutes
        if not instance.last_health_check or \
           datetime.utcnow() - instance.last_health_check >= timedelta(minutes=2):
            checks.append(HealthCheckType.LATENCY)
        
        # Add load checks if instance is under load
        if instance.current_load > instance.max_concurrent_requests * 0.7:
            checks.append(HealthCheckType.LOAD)
        
        return checks
    
    async def _perform_health_check(
        self,
        db: Session,
        instance: AIInstance,
        check_type: HealthCheckType
    ):
        """Perform a specific type of health check"""
        
        start_time = datetime.utcnow()
        
        try:
            if check_type == HealthCheckType.BASIC:
                result = await self._basic_health_check(instance)
            elif check_type == HealthCheckType.LATENCY:
                result = await self._latency_health_check(instance)
            elif check_type == HealthCheckType.LOAD:
                result = await self._load_health_check(instance)
            elif check_type == HealthCheckType.COMPREHENSIVE:
                result = await self._comprehensive_health_check(instance)
            else:
                raise ValueError(f"Unknown health check type: {check_type}")
            
            response_time = (datetime.utcnow() - start_time).total_seconds() * 1000
            
            # Update instance status
            await self._update_instance_health_status(db, instance, True, result)
            
            # Create health check record
            health_check = HealthCheck(
                instance_id=instance.instance_id,
                status="healthy",
                response_time=response_time,
                test_prompt=result.get("test_prompt", ""),
                test_response=result.get("test_response", ""),
                tokens_used=result.get("tokens_used", 0),
                check_type=check_type.value,
                check_score=result.get("score", 100.0)
            )
            
            db.add(health_check)
            db.commit()
            
            # Cache health status
            self._cache_health_status(instance.instance_id, True, result)
            
            logger.debug(f"Health check {check_type.value} passed for {instance.instance_id}")
            
        except Exception as e:
            response_time = (datetime.utcnow() - start_time).total_seconds() * 1000
            
            # Update instance status
            await self._update_instance_health_status(db, instance, False, {"error": str(e)})
            
            # Create health check record
            health_check = HealthCheck(
                instance_id=instance.instance_id,
                status="unhealthy",
                response_time=response_time,
                error_message=str(e),
                test_prompt="",
                check_type=check_type.value,
                check_score=0.0
            )
            
            db.add(health_check)
            db.commit()
            
            # Cache health status
            self._cache_health_status(instance.instance_id, False, {"error": str(e)})
            
            logger.warning(f"Health check {check_type.value} failed for {instance.instance_id}: {e}")
    
    async def _basic_health_check(self, instance: AIInstance) -> Dict[str, Any]:
        """Basic connectivity and response check"""
        
        test_prompt = "Health check: respond with 'OK'"
        response_data = await self.instance_manager._make_test_request(instance, test_prompt)
        
        # Check if response is appropriate
        response_text = response_data.get("response", "").strip().upper()
        is_ok = "OK" in response_text
        
        if not is_ok:
            raise ValueError(f"Unexpected response: {response_text}")
        
        return {
            "test_prompt": test_prompt,
            "test_response": response_text,
            "tokens_used": response_data.get("tokens_used", 0),
            "score": 100.0
        }
    
    async def _latency_health_check(self, instance: AIInstance) -> Dict[str, Any]:
        """Check response latency with multiple requests"""
        
        test_prompt = "Quick health check: respond with 'FAST'"
        latencies = []
        
        # Make 3 quick requests to measure latency
        for i in range(3):
            start_time = datetime.utcnow()
            response_data = await self.instance_manager._make_test_request(instance, test_prompt)
            latency = (datetime.utcnow() - start_time).total_seconds() * 1000
            latencies.append(latency)
            
            # Small delay between requests
            if i < 2:
                await asyncio.sleep(0.1)
        
        avg_latency = sum(latencies) / len(latencies)
        max_latency = max(latencies)
        
        # Score based on latency (lower is better)
        if avg_latency < 500:  # < 500ms
            score = 100.0
        elif avg_latency < 1000:  # < 1s
            score = 80.0
        elif avg_latency < 2000:  # < 2s
            score = 60.0
        elif avg_latency < 5000:  # < 5s
            score = 40.0
        else:
            score = 20.0
        
        # Fail if latency is too high
        if max_latency > 10000:  # > 10s
            raise ValueError(f"Latency too high: {max_latency:.0f}ms")
        
        return {
            "test_prompt": test_prompt,
            "test_response": f"Latency check completed",
            "tokens_used": 0,
            "score": score,
            "avg_latency_ms": avg_latency,
            "max_latency_ms": max_latency,
            "latencies": latencies
        }
    
    async def _load_health_check(self, instance: AIInstance) -> Dict[str, Any]:
        """Check instance performance under load"""
        
        test_prompt = "Load test: respond with a brief confirmation"
        concurrent_requests = min(5, instance.max_concurrent_requests - instance.current_load)
        
        if concurrent_requests <= 0:
            raise ValueError("Instance at maximum capacity, cannot perform load test")
        
        # Make concurrent requests
        tasks = []
        for i in range(concurrent_requests):
            task = asyncio.create_task(
                self.instance_manager._make_test_request(instance, f"{test_prompt} {i+1}")
            )
            tasks.append(task)
        
        # Wait for all requests to complete
        start_time = datetime.utcnow()
        results = await asyncio.gather(*tasks, return_exceptions=True)
        total_time = (datetime.utcnow() - start_time).total_seconds() * 1000
        
        # Analyze results
        successful_requests = []
        failed_requests = []
        
        for result in results:
            if isinstance(result, Exception):
                failed_requests.append(str(result))
            else:
                successful_requests.append(result)
        
        success_rate = len(successful_requests) / len(results) * 100
        
        # Score based on success rate
        if success_rate >= 95:
            score = 100.0
        elif success_rate >= 80:
            score = 80.0
        elif success_rate >= 60:
            score = 60.0
        else:
            score = 40.0
        
        # Fail if success rate is too low
        if success_rate < 50:
            raise ValueError(f"Load test failed: {success_rate:.1f}% success rate")
        
        return {
            "test_prompt": test_prompt,
            "test_response": f"Load test completed",
            "concurrent_requests": concurrent_requests,
            "successful_requests": len(successful_requests),
            "failed_requests": len(failed_requests),
            "success_rate": success_rate,
            "total_time_ms": total_time,
            "score": score
        }
    
    async def _comprehensive_health_check(self, instance: AIInstance) -> Dict[str, Any]:
        """Comprehensive health check with multiple test scenarios"""
        
        results = {}
        total_score = 0.0
        test_count = 0
        
        # Test 1: Basic functionality
        try:
            basic_result = await self._basic_health_check(instance)
            results["basic"] = basic_result
            total_score += basic_result["score"]
            test_count += 1
        except Exception as e:
            results["basic"] = {"error": str(e), "score": 0}
            test_count += 1
        
        # Test 2: Complex reasoning
        try:
            complex_prompt = "Solve this simple math: What is 15 + 27?"
            complex_response = await self.instance_manager._make_test_request(instance, complex_prompt)
            
            # Check if response contains correct answer (42)
            response_text = complex_response.get("response", "")
            has_correct_answer = "42" in response_text
            
            complex_score = 100.0 if has_correct_answer else 50.0
            
            results["complex"] = {
                "test_prompt": complex_prompt,
                "test_response": response_text,
                "tokens_used": complex_response.get("tokens_used", 0),
                "score": complex_score,
                "correct_answer": has_correct_answer
            }
            
            total_score += complex_score
            test_count += 1
            
        except Exception as e:
            results["complex"] = {"error": str(e), "score": 0}
            test_count += 1
        
        # Test 3: Token limit handling
        try:
            token_prompt = "Generate a short response (under 50 words)"
            token_response = await self.instance_manager._make_test_request(instance, token_prompt)
            
            token_count = token_response.get("tokens_used", 0)
            within_limits = token_count <= 200  # Allow generous limit
            
            token_score = 100.0 if within_limits else 70.0
            
            results["token_test"] = {
                "test_prompt": token_prompt,
                "test_response": token_response.get("response", ""),
                "tokens_used": token_count,
                "score": token_score,
                "within_limits": within_limits
            }
            
            total_score += token_score
            test_count += 1
            
        except Exception as e:
            results["token_test"] = {"error": str(e), "score": 0}
            test_count += 1
        
        # Calculate overall score
        overall_score = total_score / test_count if test_count > 0 else 0
        
        # Determine overall health
        if overall_score >= 80:
            health_status = "healthy"
        elif overall_score >= 60:
            health_status = "degraded"
        else:
            health_status = "unhealthy"
        
        return {
            "test_prompt": "Comprehensive health check",
            "test_response": f"Comprehensive check completed: {health_status}",
            "tokens_used": sum(r.get("tokens_used", 0) for r in results.values()),
            "score": overall_score,
            "test_results": results,
            "overall_status": health_status,
            "test_count": test_count
        }
    
    async def _update_instance_health_status(
        self,
        db: Session,
        instance: AIInstance,
        is_healthy: bool,
        result: Dict[str, Any]
    ):
        """Update instance health status based on check results"""
        
        old_healthy = instance.is_healthy
        instance.is_healthy = is_healthy
        instance.last_health_check = datetime.utcnow()
        
        if is_healthy:
            instance.last_success_response = datetime.utcnow()
            
            # Update status if it was unhealthy
            if not old_healthy and instance.status == InstanceStatus.UNHEALTHY:
                instance.status = InstanceStatus.HEALTHY
                logger.info(f"Instance {instance.instance_id} recovered and is now healthy")
        else:
            # Update status to unhealthy
            instance.status = InstanceStatus.UNHEALTHY
            
            # Check consecutive failures
            recent_failures = db.query(HealthCheck).filter(
                HealthCheck.instance_id == instance.instance_id,
                HealthCheck.status == "unhealthy",
                HealthCheck.created_at >= datetime.utcnow() - timedelta(minutes=10)
            ).count()
            
            if recent_failures >= self.config.max_failures:
                logger.error(f"Instance {instance.instance_id} has {recent_failures} consecutive failures")
        
        db.commit()
    
    def _cache_health_status(
        self,
        instance_id: str,
        is_healthy: bool,
        result: Dict[str, Any]
    ):
        """Cache health status for quick access"""
        
        self._health_cache[instance_id] = {
            "is_healthy": is_healthy,
            "last_check": datetime.utcnow().isoformat(),
            "result": result
        }
    
    async def get_health_status(
        self,
        db: Session,
        instance_id: str
    ) -> Optional[HealthReport]:
        """Get current health status for an instance"""
        
        # Check cache first
        if instance_id in self._health_cache:
            cached = self._health_cache[instance_id]
            last_check = datetime.fromisoformat(cached["last_check"])
            
            # Return cached if recent (within 30 seconds)
            if datetime.utcnow() - last_check < timedelta(seconds=30):
                instance = await self.instance_manager.get_instance(db, instance_id)
                if instance:
                    return self._create_health_report(instance, cached)
        
        # Get fresh data from database
        instance = await self.instance_manager.get_instance(db, instance_id)
        if not instance:
            return None
        
        return self._create_health_report(instance)
    
    def _create_health_report(
        self,
        instance: AIInstance,
        cached_data: Dict[str, Any] = None
    ) -> HealthReport:
        """Create a health report from instance data"""
        
        if cached_data:
            is_healthy = cached_data["is_healthy"]
            last_check = datetime.fromisoformat(cached_data["last_check"])
            result = cached_data["result"]
            score = result.get("score", 100.0 if is_healthy else 0.0)
            issues = [] if is_healthy else [result.get("error", "Unknown error")]
        else:
            is_healthy = instance.is_healthy
            last_check = instance.last_health_check or datetime.utcnow()
            score = instance.success_rate
            issues = []
            
            if not is_healthy:
                issues.append("Instance marked as unhealthy")
            if instance.success_rate < 80:
                issues.append(f"Low success rate: {instance.success_rate:.1f}%")
            if instance.average_response_time > 5000:
                issues.append(f"High response time: {instance.average_response_time:.0f}ms")
        
        # Determine health status
        if is_healthy and score >= 80:
            status = HealthStatus.HEALTHY
        elif is_healthy and score >= 60:
            status = HealthStatus.DEGRADED
        else:
            status = HealthStatus.UNHEALTHY
        
        # Calculate next check time
        if self._running:
            next_check = last_check + timedelta(seconds=self.config.interval_seconds)
        else:
            next_check = None
        
        return HealthReport(
            instance_id=instance.instance_id,
            status=status,
            score=score,
            checks_performed=["basic", "latency", "comprehensive"],
            issues=issues,
            metrics={
                "success_rate": instance.success_rate,
                "average_response_time": instance.average_response_time,
                "current_load": instance.current_load,
                "max_concurrent_requests": instance.max_concurrent_requests,
                "total_requests": instance.total_requests
            },
            last_check=last_check,
            next_check=next_check
        )
    
    async def get_overall_health_summary(self, db: Session) -> Dict[str, Any]:
        """Get overall health summary for all instances"""
        
        instances = db.query(AIInstance).filter(
            AIInstance.is_active == True
        ).all()
        
        total_instances = len(instances)
        healthy_instances = len([i for i in instances if i.is_healthy])
        unhealthy_instances = total_instances - healthy_instances
        
        # Get detailed health reports
        health_reports = []
        for instance in instances:
            report = await self.get_health_status(db, instance.instance_id)
            if report:
                health_reports.append(report)
        
        # Calculate overall metrics
        avg_success_rate = sum(i.success_rate for i in instances) / total_instances if total_instances > 0 else 0
        avg_response_time = sum(i.average_response_time for i in instances if i.average_response_time > 0) / len([i for i in instances if i.average_response_time > 0]) if instances else 0
        
        return {
            "total_instances": total_instances,
            "healthy_instances": healthy_instances,
            "unhealthy_instances": unhealthy_instances,
            "overall_health_percentage": (healthy_instances / total_instances * 100) if total_instances > 0 else 0,
            "average_success_rate": avg_success_rate,
            "average_response_time": avg_response_time,
            "monitoring_active": self._running,
            "monitored_instances": len(self._monitoring_tasks),
            "health_reports": health_reports
        }