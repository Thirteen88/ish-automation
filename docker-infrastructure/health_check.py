#!/usr/bin/env python3
"""
Comprehensive health check script for ISH Chat containers
"""
import sys
import argparse
import httpx
import asyncio
import os
import json
import redis
import psycopg2
from datetime import datetime
import structlog

# Configure structured logging
structlog.configure(
    processors=[
        structlog.stdlib.filter_by_level,
        structlog.stdlib.add_logger_name,
        structlog.stdlib.add_log_level,
        structlog.stdlib.PositionalArgumentsFormatter(),
        structlog.processors.TimeStamper(fmt="iso"),
        structlog.processors.StackInfoRenderer(),
        structlog.processors.format_exc_info,
        structlog.processors.UnicodeDecoder(),
        structlog.processors.JSONRenderer()
    ],
    context_class=dict,
    logger_factory=structlog.stdlib.LoggerFactory(),
    wrapper_class=structlog.stdlib.BoundLogger,
    cache_logger_on_first_use=True,
)

logger = structlog.get_logger()

class HealthChecker:
    def __init__(self, provider=None, app=None):
        self.provider = provider
        self.app = app
        self.base_url = "http://localhost"
        
    async def check_provider_health(self, provider, port):
        """Check health of AI provider service"""
        try:
            url = f"{self.base_url}:{port}/health"
            async with httpx.AsyncClient(timeout=10) as client:
                response = await client.get(url)
                if response.status_code == 200:
                    logger.info("Provider health check passed", provider=provider, port=port)
                    return True
                else:
                    logger.error("Provider health check failed", 
                               provider=provider, port=port, status_code=response.status_code)
                    return False
        except Exception as e:
            logger.error("Provider health check error", 
                        provider=provider, port=port, error=str(e))
            return False

    async def check_app_health(self, port):
        """Check health of main application"""
        try:
            url = f"{self.base_url}:{port}/health"
            async with httpx.AsyncClient(timeout=10) as client:
                response = await client.get(url)
                if response.status_code == 200:
                    data = response.json()
                    logger.info("App health check passed", port=port, data=data)
                    return True
                else:
                    logger.error("App health check failed", 
                               port=port, status_code=response.status_code)
                    return False
        except Exception as e:
            logger.error("App health check error", port=port, error=str(e))
            return False

    def check_redis_health(self):
        """Check Redis connectivity"""
        try:
            redis_host = os.getenv('REDIS_HOST', 'localhost')
            redis_port = int(os.getenv('REDIS_PORT', 6379))
            redis_password = os.getenv('REDIS_PASSWORD')
            
            r = redis.Redis(
                host=redis_host,
                port=redis_port,
                password=redis_password,
                socket_connect_timeout=5,
                socket_timeout=5
            )
            
            # Simple ping test
            r.ping()
            logger.info("Redis health check passed", host=redis_host, port=redis_port)
            return True
        except Exception as e:
            logger.error("Redis health check failed", error=str(e))
            return False

    def check_database_health(self):
        """Check PostgreSQL connectivity"""
        try:
            db_url = os.getenv('DATABASE_URL')
            if not db_url:
                logger.warning("DATABASE_URL not configured, skipping database health check")
                return True
            
            # Parse database URL
            import urllib.parse
            parsed = urllib.parse.urlparse(db_url)
            
            conn = psycopg2.connect(
                host=parsed.hostname,
                port=parsed.port or 5432,
                database=parsed.path[1:],  # Remove leading slash
                user=parsed.username,
                password=parsed.password,
                connect_timeout=5
            )
            
            # Simple query test
            with conn.cursor() as cursor:
                cursor.execute("SELECT 1")
                result = cursor.fetchone()
                
            conn.close()
            logger.info("Database health check passed", database=parsed.path[1:])
            return True
        except Exception as e:
            logger.error("Database health check failed", error=str(e))
            return False

    def check_system_resources(self):
        """Check system resources"""
        try:
            import psutil
            
            # CPU usage
            cpu_percent = psutil.cpu_percent(interval=1)
            
            # Memory usage
            memory = psutil.virtual_memory()
            memory_percent = memory.percent
            
            # Disk usage
            disk = psutil.disk_usage('/')
            disk_percent = disk.percent
            
            # Check thresholds
            cpu_ok = cpu_percent < 80
            memory_ok = memory_percent < 80
            disk_ok = disk_percent < 85
            
            logger.info("System resource check", 
                       cpu_percent=cpu_percent, cpu_ok=cpu_ok,
                       memory_percent=memory_percent, memory_ok=memory_ok,
                       disk_percent=disk_percent, disk_ok=disk_ok)
            
            return cpu_ok and memory_ok and disk_ok
        except ImportError:
            logger.warning("psutil not available, skipping system resource check")
            return True
        except Exception as e:
            logger.error("System resource check failed", error=str(e))
            return False

    async def run_health_checks(self):
        """Run all relevant health checks"""
        all_checks_passed = True
        
        if self.provider:
            # Provider-specific health checks
            provider_ports = {
                'zai': 8001,
                'openai': 8002,
                'claude': 8003,
                'perplexity': 8004
            }
            
            if self.provider in provider_ports:
                port = provider_ports[self.provider]
                if not await self.check_provider_health(self.provider, port):
                    all_checks_passed = False
            
            # Check dependencies
            if not self.check_redis_health():
                all_checks_passed = False
                
        elif self.app:
            # Main application health checks
            app_ports = [8000, 9090]  # HTTP and metrics ports
            for port in app_ports:
                if not await self.check_app_health(port):
                    all_checks_passed = False
            
            # Check dependencies
            if not self.check_redis_health():
                all_checks_passed = False
            if not self.check_database_health():
                all_checks_passed = False
        
        # Always check system resources
        if not self.check_system_resources():
            all_checks_passed = False
        
        if all_checks_passed:
            logger.info("All health checks passed")
            return True
        else:
            logger.error("Some health checks failed")
            return False

async def main():
    parser = argparse.ArgumentParser(description='Health check for ISH Chat containers')
    parser.add_argument('--provider', choices=['zai', 'openai', 'claude', 'perplexity'],
                       help='Check specific AI provider')
    parser.add_argument('--app', choices=['main'],
                       help='Check main application')
    parser.add_argument('--verbose', '-v', action='store_true',
                       help='Enable verbose logging')
    
    args = parser.parse_args()
    
    if args.verbose:
        structlog.configure(
            processors=[
                structlog.stdlib.filter_by_level,
                structlog.stdlib.add_logger_name,
                structlog.stdlib.add_log_level,
                structlog.stdlib.PositionalArgumentsFormatter(),
                structlog.processors.TimeStamper(fmt="iso"),
                structlog.processors.StackInfoRenderer(),
                structlog.processors.format_exc_info,
                structlog.processors.UnicodeDecoder(),
                structlog.dev.ConsoleRenderer()
            ]
        )
    
    checker = HealthChecker(provider=args.provider, app=args.app)
    
    try:
        health_status = await checker.run_health_checks()
        sys.exit(0 if health_status else 1)
    except KeyboardInterrupt:
        logger.info("Health check interrupted")
        sys.exit(1)
    except Exception as e:
        logger.error("Health check failed with error", error=str(e))
        sys.exit(1)

if __name__ == "__main__":
    asyncio.run(main())