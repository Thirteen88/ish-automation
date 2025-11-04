"""
Advanced Multi-Level Caching System for ISH Chat Backend
Implements intelligent caching strategies for AI responses, sessions, and database queries
"""
import json
import logging
import pickle
import hashlib
import asyncio
from datetime import datetime, timedelta
from typing import Any, Optional, Dict, List, Union, Tuple, Callable
from dataclasses import dataclass, asdict
from functools import wraps
import redis.asyncio as redis_async
import redis
import asyncio
from collections import OrderedDict
import weakref
import gc
import numpy as np
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.metrics.pairwise import cosine_similarity
import threading

logger = logging.getLogger(__name__)

@dataclass
class AdvancedCacheConfig:
    """Advanced cache configuration"""
    # Redis Configuration
    redis_host: str = "localhost"
    redis_port: int = 6379
    redis_db: int = 0
    redis_password: Optional[str] = None
    redis_max_connections: int = 50
    redis_socket_timeout: int = 5
    redis_socket_connect_timeout: int = 5

    # Multi-Level Cache Configuration
    l1_cache_size: int = 1000  # In-memory cache size
    l2_cache_size: int = 10000  # Redis cache size
    l3_cache_size: int = 100000  # Database query cache

    # TTL Settings (seconds)
    ai_response_ttl: int = 3600    # 1 hour for AI responses
    session_ttl: int = 7200        # 2 hours for sessions
    user_context_ttl: int = 1800   # 30 minutes for user context
    query_cache_ttl: int = 600     # 10 minutes for database queries
    static_content_ttl: int = 86400  # 24 hours for static content

    # AI Response Caching
    enable_semantic_caching: bool = True
    semantic_similarity_threshold: float = 0.85
    max_ai_response_cache_size: int = 50000

    # Performance Settings
    cache_warmup_enabled: bool = True
    background_cleanup_interval: int = 300  # 5 minutes
    max_concurrent_operations: int = 100

    # Monitoring
    enable_metrics: bool = True
    metrics_collection_interval: int = 60  # 1 minute

class L1MemoryCache:
    """L1 In-memory cache with LRU eviction"""

    def __init__(self, max_size: int = 1000):
        self.max_size = max_size
        self.cache = OrderedDict()
        self.lock = threading.RLock()
        self.hits = 0
        self.misses = 0

    def get(self, key: str) -> Optional[Any]:
        """Get value from L1 cache"""
        with self.lock:
            if key in self.cache:
                # Move to end (most recently used)
                value = self.cache.pop(key)
                self.cache[key] = value
                self.hits += 1
                return value
            self.misses += 1
            return None

    def set(self, key: str, value: Any) -> None:
        """Set value in L1 cache"""
        with self.lock:
            if key in self.cache:
                # Update existing
                self.cache.pop(key)
            elif len(self.cache) >= self.max_size:
                # Remove least recently used
                self.cache.popitem(last=False)

            self.cache[key] = value

    def delete(self, key: str) -> bool:
        """Delete key from L1 cache"""
        with self.lock:
            if key in self.cache:
                del self.cache[key]
                return True
            return False

    def clear(self) -> None:
        """Clear L1 cache"""
        with self.lock:
            self.cache.clear()
            self.hits = 0
            self.misses = 0

    def get_stats(self) -> Dict[str, Any]:
        """Get L1 cache statistics"""
        with self.lock:
            total_requests = self.hits + self.misses
            hit_rate = (self.hits / total_requests * 100) if total_requests > 0 else 0
            return {
                "size": len(self.cache),
                "max_size": self.max_size,
                "hits": self.hits,
                "misses": self.misses,
                "hit_rate": hit_rate
            }

class SemanticCache:
    """Semantic cache for AI responses using similarity matching"""

    def __init__(self, config: AdvancedCacheConfig):
        self.config = config
        self.vectorizer = TfidfVectorizer(
            max_features=1000,
            stop_words='english',
            ngram_range=(1, 2)
        )
        self.response_cache = {}
        self.query_vectors = []
        self.queries = []
        self.lock = threading.RLock()
        self._fitted = False

    def _fit_vectorizer(self, queries: List[str]) -> None:
        """Fit TF-IDF vectorizer on queries"""
        if len(queries) >= 5:  # Minimum queries for fitting
            try:
                self.vectorizer.fit(queries)
                self._fitted = True
            except Exception as e:
                logger.error(f"Error fitting vectorizer: {e}")

    def _get_query_vector(self, query: str) -> Optional[np.ndarray]:
        """Get vector representation of query"""
        try:
            if not self._fitted:
                return None
            return self.vectorizer.transform([query]).toarray()[0]
        except Exception as e:
            logger.error(f"Error vectorizing query: {e}")
            return None

    def _calculate_similarity(self, query1: str, query2: str) -> float:
        """Calculate semantic similarity between two queries"""
        try:
            if not self._fitted:
                return 0.0

            vec1 = self._get_query_vector(query1)
            vec2 = self._get_query_vector(query2)

            if vec1 is None or vec2 is None:
                return 0.0

            similarity = cosine_similarity([vec1], [vec2])[0][0]
            return float(similarity)
        except Exception as e:
            logger.error(f"Error calculating similarity: {e}")
            return 0.0

    def get_similar_response(self, query: str) -> Optional[Tuple[str, float]]:
        """Get similar response from semantic cache"""
        with self.lock:
            if not self.queries:
                return None

            max_similarity = 0.0
            best_match = None

            for cached_query in self.queries:
                similarity = self._calculate_similarity(query, cached_query)
                if similarity > max_similarity and similarity >= self.config.semantic_similarity_threshold:
                    max_similarity = similarity
                    best_match = cached_query

            if best_match:
                response = self.response_cache.get(best_match)
                if response:
                    return response, max_similarity

            return None

    def store_response(self, query: str, response: str) -> None:
        """Store response in semantic cache"""
        with self.lock:
            # Add to cache
            self.response_cache[query] = response

            # Update queries list
            if query not in self.queries:
                self.queries.append(query)

                # Fit vectorizer if needed
                if not self._fitted and len(self.queries) >= 5:
                    self._fit_vectorizer(self.queries)

                # Limit cache size
                if len(self.queries) > self.config.max_ai_response_cache_size:
                    # Remove oldest query
                    old_query = self.queries.pop(0)
                    self.response_cache.pop(old_query, None)

    def clear(self) -> None:
        """Clear semantic cache"""
        with self.lock:
            self.response_cache.clear()
            self.queries.clear()
            self.query_vectors.clear()
            self._fitted = False

class AdvancedCacheService:
    """Advanced multi-level caching service"""

    def __init__(self, config: AdvancedCacheConfig = None):
        self.config = config or AdvancedCacheConfig()
        self.l1_cache = L1MemoryCache(self.config.l1_cache_size)
        self.semantic_cache = SemanticCache(self.config)
        self.redis_client = None
        self._connected = False
        self._connection_lock = asyncio.Lock()
        self._metrics = {
            "l1_hits": 0,
            "l2_hits": 0,
            "semantic_hits": 0,
            "misses": 0,
            "total_requests": 0
        }
        self._background_tasks = set()

    async def connect(self) -> None:
        """Connect to Redis and start background tasks"""
        async with self._connection_lock:
            if self._connected:
                return

            try:
                # Create Redis client
                self.redis_client = redis_async.Redis(
                    host=self.config.redis_host,
                    port=self.config.redis_port,
                    db=self.config.redis_db,
                    password=self.config.redis_password,
                    max_connections=self.config.redis_max_connections,
                    socket_timeout=self.config.redis_socket_timeout,
                    socket_connect_timeout=self.config.redis_socket_connect_timeout,
                    decode_responses=True
                )

                # Test connection
                await self.redis_client.ping()
                self._connected = True

                # Start background tasks
                if self.config.background_cleanup_interval > 0:
                    task = asyncio.create_task(self._background_cleanup())
                    self._background_tasks.add(task)
                    task.add_done_callback(self._background_tasks.discard)

                logger.info("Advanced cache service connected successfully")

            except Exception as e:
                logger.error(f"Failed to connect to Redis: {e}")
                self._connected = False
                raise

    async def disconnect(self) -> None:
        """Disconnect and cleanup"""
        try:
            # Cancel background tasks
            for task in self._background_tasks:
                task.cancel()

            # Wait for tasks to complete
            if self._background_tasks:
                await asyncio.gather(*self._background_tasks, return_exceptions=True)

            # Close Redis connection
            if self.redis_client:
                await self.redis_client.close()

            # Clear caches
            self.l1_cache.clear()
            self.semantic_cache.clear()

            self._connected = False
            logger.info("Advanced cache service disconnected")

        except Exception as e:
            logger.error(f"Error during disconnect: {e}")

    # Multi-level cache operations
    async def get(self, key: str, default: Any = None) -> Any:
        """Get value from multi-level cache"""
        self._metrics["total_requests"] += 1

        # L1 Cache (In-memory)
        value = self.l1_cache.get(key)
        if value is not None:
            self._metrics["l1_hits"] += 1
            return value

        # L2 Cache (Redis)
        if self._connected:
            try:
                value = await self.redis_client.get(key)
                if value is not None:
                    # Deserialize and store in L1
                    deserialized = self._deserialize(value)
                    self.l1_cache.set(key, deserialized)
                    self._metrics["l2_hits"] += 1
                    return deserialized
            except Exception as e:
                logger.error(f"Redis get error: {e}")

        self._metrics["misses"] += 1
        return default

    async def set(self, key: str, value: Any, ttl: Optional[int] = None) -> bool:
        """Set value in multi-level cache"""
        try:
            # Store in L1
            self.l1_cache.set(key, value)

            # Store in L2 (Redis)
            if self._connected:
                serialized = self._serialize(value)
                if ttl:
                    await self.redis_client.setex(key, ttl, serialized)
                else:
                    await self.redis_client.set(key, serialized)
                return True

            return False

        except Exception as e:
            logger.error(f"Cache set error: {e}")
            return False

    async def delete(self, key: str) -> bool:
        """Delete from all cache levels"""
        try:
            # Delete from L1
            self.l1_cache.delete(key)

            # Delete from L2
            if self._connected:
                await self.redis_client.delete(key)
                return True

            return False

        except Exception as e:
            logger.error(f"Cache delete error: {e}")
            return False

    # AI Response Caching
    async def get_ai_response(self, query: str, provider: str, model: str) -> Optional[str]:
        """Get cached AI response with semantic matching"""
        # Check semantic cache first
        if self.config.enable_semantic_caching:
            semantic_result = self.semantic_cache.get_similar_response(query)
            if semantic_result:
                response, similarity = semantic_result
                self._metrics["semantic_hits"] += 1
                logger.debug(f"Semantic cache hit (similarity: {similarity:.2f})")
                return response

        # Check exact cache
        cache_key = f"ai_response:{provider}:{model}:{self._hash_query(query)}"
        return await self.get(cache_key)

    async def cache_ai_response(
        self,
        query: str,
        response: str,
        provider: str,
        model: str,
        ttl: Optional[int] = None
    ) -> bool:
        """Cache AI response"""
        try:
            # Cache in semantic cache
            if self.config.enable_semantic_caching:
                self.semantic_cache.store_response(query, response)

            # Cache exact response
            cache_key = f"ai_response:{provider}:{model}:{self._hash_query(query)}"
            cache_ttl = ttl or self.config.ai_response_ttl

            return await self.set(cache_key, response, cache_ttl)

        except Exception as e:
            logger.error(f"Error caching AI response: {e}")
            return False

    # Session Caching
    async def get_session(self, session_id: str) -> Optional[Dict[str, Any]]:
        """Get cached session"""
        cache_key = f"session:{session_id}"
        return await self.get(cache_key)

    async def cache_session(
        self,
        session_id: str,
        session_data: Dict[str, Any],
        ttl: Optional[int] = None
    ) -> bool:
        """Cache session data"""
        cache_key = f"session:{session_id}"
        cache_ttl = ttl or self.config.session_ttl
        return await self.set(cache_key, session_data, cache_ttl)

    # User Context Caching
    async def get_user_context(self, user_id: str) -> Optional[Dict[str, Any]]:
        """Get cached user context"""
        cache_key = f"user_context:{user_id}"
        return await self.get(cache_key)

    async def cache_user_context(
        self,
        user_id: str,
        context: Dict[str, Any],
        ttl: Optional[int] = None
    ) -> bool:
        """Cache user context"""
        cache_key = f"user_context:{user_id}"
        cache_ttl = ttl or self.config.user_context_ttl
        return await self.set(cache_key, context, cache_ttl)

    # Database Query Caching
    async def get_query_result(self, query_hash: str) -> Optional[Any]:
        """Get cached query result"""
        cache_key = f"query_result:{query_hash}"
        return await self.get(cache_key)

    async def cache_query_result(
        self,
        query_hash: str,
        result: Any,
        ttl: Optional[int] = None
    ) -> bool:
        """Cache database query result"""
        cache_key = f"query_result:{query_hash}"
        cache_ttl = ttl or self.config.query_cache_ttl
        return await self.set(cache_key, result, cache_ttl)

    def _hash_query(self, query: str) -> str:
        """Generate hash for query"""
        return hashlib.md5(query.encode()).hexdigest()

    def _serialize(self, value: Any) -> str:
        """Serialize value for storage"""
        try:
            if isinstance(value, (dict, list, tuple)):
                return json.dumps(value, default=str)
            elif isinstance(value, (str, int, float, bool)):
                return str(value)
            else:
                return pickle.dumps(value).decode('latin1')
        except Exception as e:
            logger.error(f"Serialization error: {e}")
            return str(value)

    def _deserialize(self, value: str) -> Any:
        """Deserialize value from storage"""
        try:
            # Try JSON first
            return json.loads(value)
        except (json.JSONDecodeError, TypeError):
            try:
                # Try pickle
                return pickle.loads(value.encode('latin1'))
            except (pickle.PickleError, UnicodeDecodeError):
                # Return as string
                return value

    async def _background_cleanup(self) -> None:
        """Background cleanup task"""
        while True:
            try:
                await asyncio.sleep(self.config.background_cleanup_interval)

                # Cleanup L1 cache (trigger garbage collection)
                if len(self.l1_cache.cache) > self.config.l1_cache_size * 0.8:
                    gc.collect()

                # Cleanup Redis expired keys
                if self._connected:
                    await self._cleanup_expired_keys()

            except asyncio.CancelledError:
                break
            except Exception as e:
                logger.error(f"Background cleanup error: {e}")

    async def _cleanup_expired_keys(self) -> None:
        """Cleanup expired keys in Redis"""
        try:
            # Get patterns to clean
            patterns = [
                "session:*",
                "user_context:*",
                "query_result:*",
                "temp:*"
            ]

            for pattern in patterns:
                keys = await self.redis_client.keys(pattern)
                if keys:
                    # Check TTL and cleanup if needed
                    for key in keys[:100]:  # Limit batch size
                        ttl = await self.redis_client.ttl(key)
                        if ttl == -1:  # No expiration set
                            await self.redis_client.expire(key, 3600)  # Set 1 hour TTL

        except Exception as e:
            logger.error(f"Redis cleanup error: {e}")

    # Performance Metrics
    async def get_metrics(self) -> Dict[str, Any]:
        """Get comprehensive cache metrics"""
        total_requests = self._metrics["total_requests"]

        if total_requests == 0:
            return {
                "total_requests": 0,
                "l1_hit_rate": 0,
                "l2_hit_rate": 0,
                "semantic_hit_rate": 0,
                "overall_hit_rate": 0
            }

        l1_hit_rate = (self._metrics["l1_hits"] / total_requests) * 100
        l2_hit_rate = (self._metrics["l2_hits"] / total_requests) * 100
        semantic_hit_rate = (self._metrics["semantic_hits"] / total_requests) * 100
        total_hits = self._metrics["l1_hits"] + self._metrics["l2_hits"] + self._metrics["semantic_hits"]
        overall_hit_rate = (total_hits / total_requests) * 100

        # L1 cache stats
        l1_stats = self.l1_cache.get_stats()

        # Redis stats
        redis_stats = {}
        if self._connected:
            try:
                info = await self.redis_client.info()
                redis_stats = {
                    "connected": True,
                    "used_memory": info.get("used_memory_human"),
                    "connected_clients": info.get("connected_clients"),
                    "keyspace_hits": info.get("keyspace_hits", 0),
                    "keyspace_misses": info.get("keyspace_misses", 0),
                    "total_keys": info.get("db0", {}).get("keys", 0)
                }
            except Exception as e:
                redis_stats = {"connected": False, "error": str(e)}

        return {
            "total_requests": total_requests,
            "l1_hit_rate": l1_hit_rate,
            "l2_hit_rate": l2_hit_rate,
            "semantic_hit_rate": semantic_hit_rate,
            "overall_hit_rate": overall_hit_rate,
            "l1_cache": l1_stats,
            "redis": redis_stats,
            "semantic_cache": {
                "cached_queries": len(self.semantic_cache.queries),
                "cache_size": len(self.semantic_cache.response_cache)
            }
        }

    async def health_check(self) -> Dict[str, Any]:
        """Comprehensive health check"""
        health = {
            "status": "healthy",
            "timestamp": datetime.utcnow().isoformat(),
            "checks": {}
        }

        # Check Redis connection
        if self._connected:
            try:
                start_time = datetime.utcnow()
                await self.redis_client.ping()
                response_time = (datetime.utcnow() - start_time).total_seconds() * 1000

                health["checks"]["redis"] = {
                    "status": "healthy",
                    "response_time_ms": response_time
                }
            except Exception as e:
                health["checks"]["redis"] = {
                    "status": "unhealthy",
                    "error": str(e)
                }
                health["status"] = "degraded"
        else:
            health["checks"]["redis"] = {
                "status": "disconnected"
            }
            health["status"] = "degraded"

        # Check L1 cache
        l1_stats = self.l1_cache.get_stats()
        health["checks"]["l1_cache"] = {
            "status": "healthy",
            "size": l1_stats["size"],
            "hit_rate": l1_stats["hit_rate"]
        }

        # Check semantic cache
        health["checks"]["semantic_cache"] = {
            "status": "healthy",
            "cached_queries": len(self.semantic_cache.queries),
            "fitted": self.semantic_cache._fitted
        }

        return health

# Cache decorators for easy use
def advanced_cache(
    ttl: int = 300,
    key_prefix: str = "",
    cache_instance: AdvancedCacheService = None
):
    """Decorator for advanced caching"""
    def decorator(func):
        @wraps(func)
        async def wrapper(*args, **kwargs):
            if not cache_instance or not cache_instance._connected:
                return await func(*args, **kwargs)

            # Generate cache key
            cache_key = f"{key_prefix}:{func.__name__}:{cache_instance._hash_query(str(args) + str(sorted(kwargs.items())))}"

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

def ai_response_cache(
    provider: str,
    model: str,
    ttl: Optional[int] = None,
    cache_instance: AdvancedCacheService = None
):
    """Decorator for AI response caching"""
    def decorator(func):
        @wraps(func)
        async def wrapper(*args, **kwargs):
            if not cache_instance:
                return await func(*args, **kwargs)

            # Extract query from arguments
            query = args[0] if args else kwargs.get('query', '')

            # Try to get from cache
            cached_response = await cache_instance.get_ai_response(query, provider, model)
            if cached_response:
                return cached_response

            # Execute function and cache result
            result = await func(*args, **kwargs)
            await cache_instance.cache_ai_response(query, result, provider, model, ttl)

            return result

        return wrapper
    return decorator