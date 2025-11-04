"""
Redis Cache Service for Instance Manager - Caching and distributed coordination
"""
import json
import logging
import pickle
from datetime import datetime, timedelta
from typing import Any, Optional, Dict, List, Union
from dataclasses import dataclass, asdict
import redis
import redis.asyncio as redis_async
from functools import wraps
import asyncio

logger = logging.getLogger(__name__)

@dataclass
class CacheConfig:
    """Cache configuration"""
    host: str = "localhost"
    port: int = 6379
    db: int = 0
    password: Optional[str] = None
    max_connections: int = 20
    socket_timeout: int = 5
    socket_connect_timeout: int = 5
    retry_on_timeout: bool = True
    health_check_interval: int = 30
    
    # Cache TTL settings (seconds)
    instance_cache_ttl: int = 300  # 5 minutes
    health_cache_ttl: int = 60     # 1 minute
    metrics_cache_ttl: int = 120   # 2 minutes
    config_cache_ttl: int = 1800   # 30 minutes
    session_cache_ttl: int = 3600  # 1 hour

class RedisCacheService:
    """Redis cache service for Instance Manager"""
    
    def __init__(self, config: CacheConfig = None):
        self.config = config or CacheConfig()
        self.redis_client = None
        self.redis_async_client = None
        self._connected = False
        self._connection_lock = asyncio.Lock()
        
    async def connect(self):
        """Establish Redis connection"""
        
        async with self._connection_lock:
            if self._connected:
                return
            
            try:
                # Create async Redis client
                self.redis_async_client = redis_async.Redis(
                    host=self.config.host,
                    port=self.config.port,
                    db=self.config.db,
                    password=self.config.password,
                    max_connections=self.config.max_connections,
                    socket_timeout=self.config.socket_timeout,
                    socket_connect_timeout=self.config.socket_connect_timeout,
                    retry_on_timeout=self.config.retry_on_timeout,
                    decode_responses=True
                )
                
                # Create sync Redis client for compatibility
                self.redis_client = redis.Redis(
                    host=self.config.host,
                    port=self.config.port,
                    db=self.config.db,
                    password=self.config.password,
                    max_connections=self.config.max_connections,
                    socket_timeout=self.config.socket_timeout,
                    socket_connect_timeout=self.config.socket_connect_timeout,
                    retry_on_timeout=self.config.retry_on_timeout,
                    decode_responses=True
                )
                
                # Test connection
                await self.redis_async_client.ping()
                
                self._connected = True
                logger.info(f"Redis connection established: {self.config.host}:{self.config.port}")
                
            except Exception as e:
                logger.error(f"Failed to connect to Redis: {e}")
                self._connected = False
                raise
    
    async def disconnect(self):
        """Close Redis connections"""
        
        try:
            if self.redis_async_client:
                await self.redis_async_client.close()
            
            if self.redis_client:
                self.redis_client.close()
            
            self._connected = False
            logger.info("Redis connections closed")
            
        except Exception as e:
            logger.error(f"Error closing Redis connections: {e}")
    
    def is_connected(self) -> bool:
        """Check if Redis is connected"""
        return self._connected
    
    # Cache operations
    async def get(self, key: str, default: Any = None) -> Any:
        """Get value from cache"""
        
        try:
            if not self._connected:
                return default
            
            value = await self.redis_async_client.get(key)
            if value is None:
                return default
            
            # Try to deserialize JSON first
            try:
                return json.loads(value)
            except (json.JSONDecodeError, TypeError):
                # Try to deserialize pickle
                try:
                    return pickle.loads(value.encode('latin1'))
                except (pickle.PickleError, UnicodeDecodeError):
                    # Return raw string
                    return value
                    
        except Exception as e:
            logger.error(f"Cache get error for key '{key}': {e}")
            return default
    
    async def set(
        self,
        key: str,
        value: Any,
        ttl: Optional[int] = None
    ) -> bool:
        """Set value in cache with optional TTL"""
        
        try:
            if not self._connected:
                return False
            
            # Serialize value
            if isinstance(value, (dict, list, tuple)):
                serialized = json.dumps(value, default=str)
            elif isinstance(value, (str, int, float, bool)):
                serialized = str(value)
            else:
                # Use pickle for complex objects
                serialized = pickle.dumps(value).decode('latin1')
            
            # Set with TTL
            if ttl:
                result = await self.redis_async_client.setex(key, ttl, serialized)
            else:
                result = await self.redis_async_client.set(key, serialized)
            
            return result
            
        except Exception as e:
            logger.error(f"Cache set error for key '{key}': {e}")
            return False
    
    async def delete(self, key: str) -> bool:
        """Delete key from cache"""
        
        try:
            if not self._connected:
                return False
            
            result = await self.redis_async_client.delete(key)
            return result > 0
            
        except Exception as e:
            logger.error(f"Cache delete error for key '{key}': {e}")
            return False
    
    async def exists(self, key: str) -> bool:
        """Check if key exists in cache"""
        
        try:
            if not self._connected:
                return False
            
            result = await self.redis_async_client.exists(key)
            return result > 0
            
        except Exception as e:
            logger.error(f"Cache exists error for key '{key}': {e}")
            return False
    
    async def expire(self, key: str, ttl: int) -> bool:
        """Set TTL for existing key"""
        
        try:
            if not self._connected:
                return False
            
            result = await self.redis_async_client.expire(key, ttl)
            return result
            
        except Exception as e:
            logger.error(f"Cache expire error for key '{key}': {e}")
            return False
    
    async def increment(self, key: str, amount: int = 1) -> Optional[int]:
        """Increment numeric value"""
        
        try:
            if not self._connected:
                return None
            
            result = await self.redis_async_client.incrby(key, amount)
            return result
            
        except Exception as e:
            logger.error(f"Cache increment error for key '{key}': {e}")
            return None
    
    async def get_keys(self, pattern: str = "*") -> List[str]:
        """Get keys matching pattern"""
        
        try:
            if not self._connected:
                return []
            
            keys = await self.redis_async_client.keys(pattern)
            return keys
            
        except Exception as e:
            logger.error(f"Cache get keys error for pattern '{pattern}': {e}")
            return []
    
    # Instance-specific cache operations
    async def cache_instance(self, instance_id: str, instance_data: Dict[str, Any]) -> bool:
        """Cache instance data"""
        
        key = f"instance:{instance_id}"
        return await self.set(key, instance_data, self.config.instance_cache_ttl)
    
    async def get_cached_instance(self, instance_id: str) -> Optional[Dict[str, Any]]:
        """Get cached instance data"""
        
        key = f"instance:{instance_id}"
        return await self.get(key)
    
    async def cache_instance_health(self, instance_id: str, health_data: Dict[str, Any]) -> bool:
        """Cache instance health data"""
        
        key = f"health:{instance_id}"
        return await self.set(key, health_data, self.config.health_cache_ttl)
    
    async def get_cached_instance_health(self, instance_id: str) -> Optional[Dict[str, Any]]:
        """Get cached instance health data"""
        
        key = f"health:{instance_id}"
        return await self.get(key)
    
    async def cache_instance_metrics(self, instance_id: str, metrics_data: Dict[str, Any]) -> bool:
        """Cache instance metrics data"""
        
        key = f"metrics:{instance_id}"
        return await self.set(key, metrics_data, self.config.metrics_cache_ttl)
    
    async def get_cached_instance_metrics(self, instance_id: str) -> Optional[Dict[str, Any]]:
        """Get cached instance metrics data"""
        
        key = f"metrics:{instance_id}"
        return await self.get(key)
    
    # Load balancing cache operations
    async def cache_load_balancing_result(
        self,
        provider_type: str,
        model_name: str,
        result: Dict[str, Any],
        ttl: int = 60
    ) -> bool:
        """Cache load balancing result"""
        
        key = f"lb:{provider_type}:{model_name}"
        return await self.set(key, result, ttl)
    
    async def get_cached_load_balancing_result(
        self,
        provider_type: str,
        model_name: str
    ) -> Optional[Dict[str, Any]]:
        """Get cached load balancing result"""
        
        key = f"lb:{provider_type}:{model_name}"
        return await self.get(key)
    
    # Session management
    async def create_session(self, session_id: str, session_data: Dict[str, Any]) -> bool:
        """Create session"""
        
        key = f"session:{session_id}"
        return await self.set(key, session_data, self.config.session_cache_ttl)
    
    async def get_session(self, session_id: str) -> Optional[Dict[str, Any]]:
        """Get session data"""
        
        key = f"session:{session_id}"
        return await self.get(key)
    
    async def update_session(self, session_id: str, session_data: Dict[str, Any]) -> bool:
        """Update session data"""
        
        key = f"session:{session_id}"
        return await self.set(key, session_data, self.config.session_cache_ttl)
    
    async def delete_session(self, session_id: str) -> bool:
        """Delete session"""
        
        key = f"session:{session_id}"
        return await self.delete(key)
    
    # Distributed locks
    async def acquire_lock(
        self,
        lock_name: str,
        timeout: int = 10,
        wait_timeout: int = 30
    ) -> Optional[str]:
        """Acquire distributed lock"""
        
        if not self._connected:
            return None
        
        lock_key = f"lock:{lock_name}"
        lock_value = f"{datetime.utcnow().timestamp()}-{id(asyncio.current_task())}"
        
        start_time = datetime.utcnow()
        
        while (datetime.utcnow() - start_time).total_seconds() < wait_timeout:
            try:
                # Try to acquire lock
                result = await self.redis_async_client.set(
                    lock_key, lock_value, nx=True, ex=timeout
                )
                
                if result:
                    logger.debug(f"Acquired lock: {lock_name}")
                    return lock_value
                
                # Wait before retrying
                await asyncio.sleep(0.1)
                
            except Exception as e:
                logger.error(f"Error acquiring lock {lock_name}: {e}")
                await asyncio.sleep(1)
        
        logger.warning(f"Failed to acquire lock: {lock_name}")
        return None
    
    async def release_lock(self, lock_name: str, lock_value: str) -> bool:
        """Release distributed lock"""
        
        if not self._connected:
            return False
        
        lock_key = f"lock:{lock_name}"
        
        try:
            # Use Lua script to safely release lock
            lua_script = """
            if redis.call("get", KEYS[1]) == ARGV[1] then
                return redis.call("del", KEYS[1])
            else
                return 0
            end
            """
            
            result = await self.redis_async_client.eval(
                lua_script, 1, lock_key, lock_value
            )
            
            success = result > 0
            if success:
                logger.debug(f"Released lock: {lock_name}")
            else:
                logger.warning(f"Failed to release lock (not owner): {lock_name}")
            
            return success
            
        except Exception as e:
            logger.error(f"Error releasing lock {lock_name}: {e}")
            return False
    
    # Rate limiting
    async def check_rate_limit(
        self,
        identifier: str,
        limit: int,
        window: int
    ) -> Dict[str, Any]:
        """Check rate limit using sliding window"""
        
        if not self._connected:
            return {"allowed": True, "remaining": limit, "reset_time": 0}
        
        key = f"rate_limit:{identifier}"
        current_time = datetime.utcnow().timestamp()
        
        try:
            # Use Redis sorted set for sliding window
            pipe = self.redis_async_client.pipeline()
            
            # Remove old entries
            pipe.zremrangebyscore(key, 0, current_time - window)
            
            # Add current request
            pipe.zadd(key, {str(current_time): current_time})
            
            # Count requests in window
            pipe.zcard(key)
            
            # Set expiration
            pipe.expire(key, window)
            
            results = await pipe.execute()
            
            request_count = results[2]
            remaining = max(0, limit - request_count)
            allowed = request_count <= limit
            
            # Calculate reset time
            oldest_request = await self.redis_async_client.zrange(key, 0, 0, withscores=True)
            reset_time = int(oldest_request[0][1] + window) if oldest_request else int(current_time + window)
            
            return {
                "allowed": allowed,
                "remaining": remaining,
                "reset_time": reset_time,
                "current_count": request_count,
                "limit": limit
            }
            
        except Exception as e:
            logger.error(f"Rate limit check error for {identifier}: {e}")
            return {"allowed": True, "remaining": limit, "reset_time": 0}
    
    # Pub/Sub for real-time updates
    async def publish(self, channel: str, message: Dict[str, Any]) -> bool:
        """Publish message to channel"""
        
        if not self._connected:
            return False
        
        try:
            message_str = json.dumps(message, default=str)
            result = await self.redis_async_client.publish(channel, message_str)
            return result > 0
            
        except Exception as e:
            logger.error(f"Publish error for channel {channel}: {e}")
            return False
    
    async def subscribe(self, channel: str) -> Optional[Any]:
        """Subscribe to channel"""
        
        if not self._connected:
            return None
        
        try:
            pubsub = self.redis_async_client.pubsub()
            await pubsub.subscribe(channel)
            return pubsub
            
        except Exception as e:
            logger.error(f"Subscribe error for channel {channel}: {e}")
            return None
    
    # Health check
    async def health_check(self) -> Dict[str, Any]:
        """Perform Redis health check"""
        
        try:
            if not self._connected:
                return {
                    "status": "unhealthy",
                    "error": "Not connected to Redis"
                }
            
            start_time = datetime.utcnow()
            
            # Test basic operations
            test_key = "health_check_test"
            
            # Test set/get
            await self.redis_async_client.set(test_key, "test", ex=10)
            value = await self.redis_async_client.get(test_key)
            
            # Test delete
            await self.redis_async_client.delete(test_key)
            
            response_time = (datetime.utcnow() - start_time).total_seconds() * 1000
            
            # Get Redis info
            info = await self.redis_async_client.info()
            
            return {
                "status": "healthy" if value == "test" else "unhealthy",
                "response_time_ms": response_time,
                "redis_version": info.get("redis_version"),
                "connected_clients": info.get("connected_clients"),
                "used_memory": info.get("used_memory_human"),
                "uptime_seconds": info.get("uptime_in_seconds")
            }
            
        except Exception as e:
            return {
                "status": "unhealthy",
                "error": str(e)
            }
    
    # Cache statistics
    async def get_cache_stats(self) -> Dict[str, Any]:
        """Get cache statistics"""
        
        try:
            if not self._connected:
                return {"connected": False}
            
            info = await self.redis_async_client.info()
            
            # Get key counts by pattern
            instance_keys = len(await self.get_keys("instance:*"))
            health_keys = len(await self.get_keys("health:*"))
            metrics_keys = len(await self.get_keys("metrics:*"))
            session_keys = len(await self.get_keys("session:*"))
            
            return {
                "connected": True,
                "total_keys": info.get("db0", {}).get("keys", 0),
                "used_memory": info.get("used_memory_human"),
                "used_memory_bytes": info.get("used_memory"),
                "connected_clients": info.get("connected_clients"),
                "key_counts": {
                    "instances": instance_keys,
                    "health": health_keys,
                    "metrics": metrics_keys,
                    "sessions": session_keys
                },
                "hit_rate": info.get("keyspace_hits", 0) / max(1, info.get("keyspace_hits", 0) + info.get("keyspace_misses", 0)) * 100,
                "uptime_seconds": info.get("uptime_in_seconds")
            }
            
        except Exception as e:
            return {
                "connected": False,
                "error": str(e)
            }
    
    # Cache cleanup
    async def cleanup_expired_keys(self, pattern: str = "*") -> int:
        """Clean up expired keys (manual cleanup)"""
        
        try:
            if not self._connected:
                return 0
            
            keys = await self.get_keys(pattern)
            deleted_count = 0
            
            for key in keys:
                ttl = await self.redis_async_client.ttl(key)
                if ttl == -1:  # No expiration set
                    # Set a reasonable expiration for old keys
                    await self.redis_async_client.expire(key, 3600)  # 1 hour
                    deleted_count += 1
                elif ttl == -2:  # Key expired but not deleted
                    await self.redis_async_client.delete(key)
                    deleted_count += 1
            
            logger.info(f"Cleaned up {deleted_count} expired keys")
            return deleted_count
            
        except Exception as e:
            logger.error(f"Cache cleanup error: {e}")
            return 0

# Cache decorator for functions
def cached(ttl: int = 300, key_prefix: str = "", cache_instance: RedisCacheService = None):
    """Decorator to cache function results"""
    
    def decorator(func):
        @wraps(func)
        async def wrapper(*args, **kwargs):
            if not cache_instance or not cache_instance.is_connected():
                return await func(*args, **kwargs)
            
            # Generate cache key
            cache_key = f"{key_prefix}:{func.__name__}:{hash(str(args) + str(sorted(kwargs.items())))}"
            
            # Try to get from cache
            cached_result = await cache_instance.get(cache_key)
            if cached_result is not None:
                return cached_result
            
            # Execute function and cache result
            result = await func(*args, **kwargs)
            await cache_instance.set(cache_key, result, ttl)
            
            return result
        
        return wrapper
    return decorator