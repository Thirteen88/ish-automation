"""
Advanced Rate Limiting Service for ISH Chat System
Provides flexible and scalable rate limiting with multiple strategies
"""

import os
import time
import json
import asyncio
import logging
from typing import Optional, Dict, Any, List, Tuple
from datetime import datetime, timedelta
from dataclasses import dataclass, asdict
import redis.asyncio as redis
import redis.exceptions
from collections import defaultdict, deque

logger = logging.getLogger(__name__)

@dataclass
class RateLimitConfig:
    """Rate limit configuration"""
    requests_per_second: int = 10
    requests_per_minute: int = 100
    requests_per_hour: int = 1000
    requests_per_day: int = 10000
    burst_size: int = 20
    window_size: int = 60  # seconds for sliding window
    strategy: str = "sliding_window"  # sliding_window, fixed_window, token_bucket

@dataclass
class RateLimitResult:
    """Rate limit check result"""
    allowed: bool
    limit: int
    remaining: int
    reset_time: int
    retry_after: Optional[int] = None
    current_count: int = 0
    strategy_used: str = ""

class TokenBucket:
    """Token bucket rate limiter implementation"""
    
    def __init__(self, capacity: int, refill_rate: float):
        self.capacity = capacity
        self.refill_rate = refill_rate  # tokens per second
        self.tokens = capacity
        self.last_refill = time.time()
        self.lock = asyncio.Lock()
    
    async def consume(self, tokens: int = 1) -> Tuple[bool, float]:
        """Consume tokens from bucket"""
        async with self.lock:
            now = time.time()
            time_passed = now - self.last_refill
            
            # Refill tokens
            self.tokens = min(self.capacity, self.tokens + time_passed * self.refill_rate)
            self.last_refill = now
            
            if self.tokens >= tokens:
                self.tokens -= tokens
                return True, self.tokens / self.refill_rate
            else:
                return False, (tokens - self.tokens) / self.refill_rate

class SlidingWindowRateLimiter:
    """Sliding window rate limiter with Redis backend"""
    
    def __init__(self, redis_client: redis.Redis):
        self.redis = redis_client
        self.local_cache = defaultdict(lambda: deque())
        self.local_cache_lock = asyncio.Lock()
    
    async def is_allowed(
        self,
        key: str,
        limit: int,
        window: int,
        identifier: str = None
    ) -> RateLimitResult:
        """Check if request is allowed using sliding window algorithm"""
        now = int(time.time())
        window_start = now - window
        
        # Try Redis first
        try:
            pipe = self.redis.pipeline()
            
            # Remove old entries
            pipe.zremrangebyscore(key, 0, window_start)
            
            # Add current request
            pipe.zadd(key, {str(now): now})
            
            # Count requests in window
            pipe.zcard(key)
            
            # Set expiration
            pipe.expire(key, window + 60)
            
            results = await pipe.execute()
            current_count = results[2]
            
            remaining = max(0, limit - current_count)
            allowed = current_count <= limit
            
            return RateLimitResult(
                allowed=allowed,
                limit=limit,
                remaining=remaining,
                reset_time=now + window,
                current_count=current_count,
                strategy_used="sliding_window_redis"
            )
            
        except redis.exceptions.RedisError as e:
            logger.warning(f"Redis error, falling back to local cache: {e}")
            
            # Fallback to local cache
            async with self.local_cache_lock:
                if key not in self.local_cache:
                    self.local_cache[key] = deque()
                
                window_queue = self.local_cache[key]
                
                # Remove old entries
                while window_queue and window_queue[0] <= window_start:
                    window_queue.popleft()
                
                current_count = len(window_queue)
                remaining = max(0, limit - current_count)
                allowed = current_count < limit
                
                if allowed:
                    window_queue.append(now)
                
                return RateLimitResult(
                    allowed=allowed,
                    limit=limit,
                    remaining=remaining,
                    reset_time=now + window,
                    current_count=current_count,
                    strategy_used="sliding_window_local"
                )

class FixedWindowRateLimiter:
    """Fixed window rate limiter with Redis backend"""
    
    def __init__(self, redis_client: redis.Redis):
        self.redis = redis_client
    
    async def is_allowed(
        self,
        key: str,
        limit: int,
        window: int,
        identifier: str = None
    ) -> RateLimitResult:
        """Check if request is allowed using fixed window algorithm"""
        now = int(time.time())
        window_start = (now // window) * window
        window_end = window_start + window
        
        try:
            # Use atomic increment with expiration
            pipe = self.redis.pipeline()
            pipe.incr(key)
            pipe.expire(key, window + 60)
            results = await pipe.execute()
            
            current_count = results[0]
            remaining = max(0, limit - current_count)
            allowed = current_count <= limit
            
            return RateLimitResult(
                allowed=allowed,
                limit=limit,
                remaining=remaining,
                reset_time=window_end,
                current_count=current_count,
                strategy_used="fixed_window_redis"
            )
            
        except redis.exceptions.RedisError as e:
            logger.warning(f"Redis error in fixed window limiter: {e}")
            # Allow request if Redis is unavailable
            return RateLimitResult(
                allowed=True,
                limit=limit,
                remaining=limit - 1,
                reset_time=now + window,
                current_count=1,
                strategy_used="fixed_window_fallback"
            )

class TokenBucketRateLimiter:
    """Token bucket rate limiter with Redis backend"""
    
    def __init__(self, redis_client: redis.Redis):
        self.redis = redis_client
        self.local_buckets = {}
        self.local_buckets_lock = asyncio.Lock()
    
    async def is_allowed(
        self,
        key: str,
        capacity: int,
        refill_rate: float,
        tokens: int = 1
    ) -> RateLimitResult:
        """Check if request is allowed using token bucket algorithm"""
        now = time.time()
        
        try:
            # Redis-based token bucket using Lua script for atomicity
            lua_script = """
            local key = KEYS[1]
            local capacity = tonumber(ARGV[1])
            local refill_rate = tonumber(ARGV[2])
            local tokens = tonumber(ARGV[3])
            local now = tonumber(ARGV[4])
            
            local bucket = redis.call('HMGET', key, 'tokens', 'last_refill')
            local current_tokens = tonumber(bucket[1]) or capacity
            local last_refill = tonumber(bucket[2]) or now
            
            -- Refill tokens
            local time_passed = now - last_refill
            current_tokens = math.min(capacity, current_tokens + time_passed * refill_rate)
            
            local allowed = current_tokens >= tokens
            if allowed then
                current_tokens = current_tokens - tokens
            end
            
            -- Update bucket
            redis.call('HMSET', key, 'tokens', current_tokens, 'last_refill', now)
            redis.call('EXPIRE', key, 3600)
            
            return {allowed, current_tokens, tokens - current_tokens}
            """
            
            result = await self.redis.eval(
                lua_script,
                1,  # number of keys
                key,
                capacity,
                refill_rate,
                tokens,
                now
            )
            
            allowed = bool(result[0])
            current_tokens = float(result[1])
            wait_time = float(result[2])
            
            remaining = int(current_tokens)
            retry_after = int(wait_time) if not allowed and wait_time > 0 else None
            
            return RateLimitResult(
                allowed=allowed,
                limit=capacity,
                remaining=remaining,
                reset_time=int(now + wait_time) if wait_time > 0 else int(now + 1),
                retry_after=retry_after,
                current_count=int(capacity - current_tokens),
                strategy_used="token_bucket_redis"
            )
            
        except redis.exceptions.RedisError as e:
            logger.warning(f"Redis error in token bucket limiter: {e}")
            
            # Fallback to local token bucket
            async with self.local_buckets_lock:
                if key not in self.local_buckets:
                    self.local_buckets[key] = TokenBucket(capacity, refill_rate)
                
                bucket = self.local_buckets[key]
                allowed, wait_time = await bucket.consume(tokens)
                
                remaining = int(bucket.tokens)
                retry_after = int(wait_time) if not allowed and wait_time > 0 else None
                
                return RateLimitResult(
                    allowed=allowed,
                    limit=capacity,
                    remaining=remaining,
                    reset_time=int(now + wait_time) if wait_time > 0 else int(now + 1),
                    retry_after=retry_after,
                    current_count=int(capacity - bucket.tokens),
                    strategy_used="token_bucket_local"
                )

class RateLimiterService:
    """Main rate limiting service"""
    
    def __init__(self, redis_client: redis.Redis):
        self.redis = redis_client
        self.sliding_window = SlidingWindowRateLimiter(redis_client)
        self.fixed_window = FixedWindowRateLimiter(redis_client)
        self.token_bucket = TokenBucketRateLimiter(redis_client)
        
        # Default configurations
        self.default_configs = {
            "global": RateLimitConfig(
                requests_per_minute=100,
                requests_per_hour=1000,
                strategy="sliding_window"
            ),
            "auth": RateLimitConfig(
                requests_per_minute=10,
                requests_per_hour=100,
                strategy="sliding_window"
            ),
            "upload": RateLimitConfig(
                requests_per_minute=20,
                requests_per_hour=500,
                strategy="sliding_window"
            ),
            "ai_api": RateLimitConfig(
                requests_per_minute=30,
                requests_per_hour=1000,
                strategy="token_bucket"
            ),
            "anonymous": RateLimitConfig(
                requests_per_minute=30,
                requests_per_hour=300,
                strategy="sliding_window"
            ),
            "authenticated": RateLimitConfig(
                requests_per_minute=200,
                requests_per_hour=5000,
                strategy="sliding_window"
            )
        }
    
    async def check_rate_limit(
        self,
        key: str,
        config_name: str = "global",
        identifier: str = None,
        custom_config: Optional[RateLimitConfig] = None
    ) -> RateLimitResult:
        """Check rate limit for given key"""
        config = custom_config or self.default_configs.get(config_name, self.default_configs["global"])
        
        # Create full key
        full_key = f"rate_limit:{config_name}:{key}"
        if identifier:
            full_key += f":{identifier}"
        
        # Choose strategy
        if config.strategy == "sliding_window":
            # Use minute-level limit for sliding window
            return await self.sliding_window.is_allowed(
                full_key,
                config.requests_per_minute,
                60,  # 1 minute window
                identifier
            )
        elif config.strategy == "fixed_window":
            # Use minute-level limit for fixed window
            return await self.fixed_window.is_allowed(
                full_key,
                config.requests_per_minute,
                60,  # 1 minute window
                identifier
            )
        elif config.strategy == "token_bucket":
            # Use token bucket with capacity and refill rate
            return await self.token_bucket.is_allowed(
                full_key,
                config.burst_size,
                config.requests_per_second / 60.0,  # tokens per second
                1  # consume 1 token
            )
        else:
            # Default to sliding window
            return await self.sliding_window.is_allowed(
                full_key,
                config.requests_per_minute,
                60,
                identifier
            )
    
    async def check_multi_level_limits(
        self,
        key: str,
        config_name: str = "global",
        identifier: str = None
    ) -> List[RateLimitResult]:
        """Check multiple rate limit levels (minute, hour, day)"""
        config = self.default_configs.get(config_name, self.default_configs["global"])
        results = []
        
        # Minute-level check
        minute_key = f"rate_limit:minute:{key}"
        if identifier:
            minute_key += f":{identifier}"
        
        minute_result = await self.sliding_window.is_allowed(
            minute_key,
            config.requests_per_minute,
            60,
            identifier
        )
        results.append(minute_result)
        
        # Hour-level check
        hour_key = f"rate_limit:hour:{key}"
        if identifier:
            hour_key += f":{identifier}"
        
        hour_result = await self.sliding_window.is_allowed(
            hour_key,
            config.requests_per_hour,
            3600,
            identifier
        )
        results.append(hour_result)
        
        # Day-level check
        day_key = f"rate_limit:day:{key}"
        if identifier:
            day_key += f":{identifier}"
        
        day_result = await self.sliding_window.is_allowed(
            day_key,
            config.requests_per_day,
            86400,
            identifier
        )
        results.append(day_result)
        
        return results
    
    async def get_rate_limit_status(
        self,
        key: str,
        config_name: str = "global",
        identifier: str = None
    ) -> Dict[str, Any]:
        """Get current rate limit status"""
        results = await self.check_multi_level_limits(key, config_name, identifier)
        config = self.default_configs.get(config_name, self.default_configs["global"])
        
        return {
            "config_name": config_name,
            "strategy": config.strategy,
            "limits": {
                "per_minute": {
                    "limit": config.requests_per_minute,
                    "remaining": results[0].remaining,
                    "reset_time": results[0].reset_time,
                    "allowed": results[0].allowed
                },
                "per_hour": {
                    "limit": config.requests_per_hour,
                    "remaining": results[1].remaining,
                    "reset_time": results[1].reset_time,
                    "allowed": results[1].allowed
                },
                "per_day": {
                    "limit": config.requests_per_day,
                    "remaining": results[2].remaining,
                    "reset_time": results[2].reset_time,
                    "allowed": results[2].allowed
                }
            },
            "overall_allowed": all(result.allowed for result in results)
        }
    
    async def reset_rate_limit(
        self,
        key: str,
        config_name: str = "global",
        identifier: str = None
    ):
        """Reset rate limit for given key"""
        patterns = [
            f"rate_limit:{config_name}:{key}",
            f"rate_limit:minute:{key}",
            f"rate_limit:hour:{key}",
            f"rate_limit:day:{key}"
        ]
        
        if identifier:
            patterns = [f"{pattern}:{identifier}" for pattern in patterns]
        
        for pattern in patterns:
            await self.redis.delete(pattern)
    
    async def get_rate_limit_stats(
        self,
        key_prefix: str = None,
        limit: int = 100
    ) -> Dict[str, Any]:
        """Get rate limit statistics"""
        try:
            pattern = f"rate_limit:*{key_prefix}*" if key_prefix else "rate_limit:*"
            keys = await self.redis.keys(pattern)
            
            if len(keys) > limit:
                keys = keys[:limit]
            
            stats = {
                "total_keys": len(keys),
                "configurations": defaultdict(int),
                "strategies": defaultdict(int),
                "sample_keys": []
            }
            
            for key in keys[:10]:  # Sample first 10 keys
                key_str = key.decode() if isinstance(key, bytes) else key
                parts = key_str.split(":")
                
                if len(parts) >= 3:
                    config_name = parts[1]
                    stats["configurations"][config_name] += 1
                
                stats["sample_keys"].append(key_str)
            
            return stats
            
        except Exception as e:
            logger.error(f"Error getting rate limit stats: {e}")
            return {"error": str(e)}
    
    def create_config(
        self,
        requests_per_minute: int,
        requests_per_hour: int = None,
        requests_per_day: int = None,
        burst_size: int = None,
        strategy: str = "sliding_window"
    ) -> RateLimitConfig:
        """Create custom rate limit configuration"""
        if requests_per_hour is None:
            requests_per_hour = requests_per_minute * 60
        if requests_per_day is None:
            requests_per_day = requests_per_hour * 24
        if burst_size is None:
            burst_size = min(requests_per_minute // 4, 50)
        
        return RateLimitConfig(
            requests_per_minute=requests_per_minute,
            requests_per_hour=requests_per_hour,
            requests_per_day=requests_per_day,
            burst_size=burst_size,
            strategy=strategy
        )

# Decorator for rate limiting
def rate_limit(
    limiter_service: RateLimiterService,
    config_name: str = "global",
    key_extractor: callable = None
):
    """Decorator for rate limiting FastAPI endpoints"""
    def decorator(func):
        async def wrapper(*args, **kwargs):
            # Extract key from request (assuming first argument is Request)
            request = None
            for arg in args:
                if hasattr(arg, 'client') and hasattr(arg, 'url'):
                    request = arg
                    break
            
            if not request:
                # Try to get request from kwargs
                request = kwargs.get('request')
            
            if not request:
                # No request found, allow the call
                return await func(*args, **kwargs)
            
            # Extract key
            if key_extractor:
                key = key_extractor(request)
            else:
                # Default: use client IP
                key = request.client.host if request.client else "unknown"
            
            # Check rate limit
            result = await limiter_service.check_rate_limit(key, config_name)
            
            if not result.allowed:
                from fastapi import HTTPException
                raise HTTPException(
                    status_code=429,
                    detail="Rate limit exceeded",
                    headers={
                        "X-RateLimit-Limit": str(result.limit),
                        "X-RateLimit-Remaining": str(result.remaining),
                        "X-RateLimit-Reset": str(result.reset_time),
                        "Retry-After": str(result.retry_after or 60)
                    }
                )
            
            # Add rate limit headers to response (this would need middleware)
            return await func(*args, **kwargs)
        
        return wrapper
    return decorator

# Factory function to create rate limiter service
def create_rate_limiter_service(redis_client: redis.Redis) -> RateLimiterService:
    """Create and configure rate limiter service"""
    return RateLimiterService(redis_client)