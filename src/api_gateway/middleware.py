"""
API Gateway Middleware for ISH Chat System
Provides advanced routing, authentication, rate limiting, and security features
"""

import os
import json
import time
import asyncio
import hashlib
import logging
from typing import Optional, Dict, Any, List, Callable
from datetime import datetime, timedelta
from functools import wraps
import redis.asyncio as redis
from fastapi import Request, Response, HTTPException, status
from fastapi.middleware.base import BaseHTTPMiddleware
from fastapi.responses import JSONResponse
from starlette.middleware.base import RequestResponseEndpoint
import jwt
import httpx
from dataclasses import dataclass, asdict
import ipaddress
from collections import defaultdict, deque

# Configure logging
logger = logging.getLogger(__name__)

@dataclass
class RateLimitConfig:
    """Configuration for rate limiting"""
    requests_per_minute: int = 60
    requests_per_hour: int = 1000
    requests_per_day: int = 10000
    burst_size: int = 10
    window_size: int = 60  # seconds

@dataclass
class SecurityConfig:
    """Security configuration"""
    enable_cors: bool = True
    enable_csp: bool = True
    enable_rate_limiting: bool = True
    enable_ip_whitelist: bool = False
    enable_ip_blacklist: bool = False
    enable_jwt_auth: bool = True
    enable_api_key_auth: bool = True
    max_request_size: int = 10 * 1024 * 1024  # 10MB
    allowed_origins: List[str] = None
    blocked_ips: List[str] = None
    allowed_ips: List[str] = None

@dataclass
class CircuitBreakerConfig:
    """Circuit breaker configuration"""
    failure_threshold: int = 5
    recovery_timeout: int = 30
    expected_exception: type = Exception
    timeout: float = 30.0

class CircuitBreaker:
    """Circuit breaker pattern implementation"""
    
    def __init__(self, config: CircuitBreakerConfig):
        self.config = config
        self.failure_count = 0
        self.last_failure_time = None
        self.state = 'CLOSED'  # CLOSED, OPEN, HALF_OPEN
        self.lock = asyncio.Lock()
    
    async def call(self, func: Callable, *args, **kwargs):
        """Execute function with circuit breaker protection"""
        async with self.lock:
            if self.state == 'OPEN':
                if time.time() - self.last_failure_time > self.config.recovery_timeout:
                    self.state = 'HALF_OPEN'
                    logger.info("Circuit breaker transitioning to HALF_OPEN")
                else:
                    raise HTTPException(
                        status_code=503,
                        detail="Service temporarily unavailable"
                    )
            
            try:
                result = await asyncio.wait_for(
                    func(*args, **kwargs),
                    timeout=self.config.timeout
                )
                
                if self.state == 'HALF_OPEN':
                    self.state = 'CLOSED'
                    self.failure_count = 0
                    logger.info("Circuit breaker returning to CLOSED")
                
                return result
                
            except self.config.expected_exception as e:
                self.failure_count += 1
                self.last_failure_time = time.time()
                
                if self.failure_count >= self.config.failure_threshold:
                    self.state = 'OPEN'
                    logger.warning(f"Circuit breaker OPENED after {self.failure_count} failures")
                
                raise HTTPException(
                    status_code=503,
                    detail=f"Service error: {str(e)}"
                )
            except asyncio.TimeoutError:
                self.failure_count += 1
                self.last_failure_time = time.time()
                
                if self.failure_count >= self.config.failure_threshold:
                    self.state = 'OPEN'
                    logger.warning(f"Circuit breaker OPENED due to timeout")
                
                raise HTTPException(
                    status_code=504,
                    detail="Service timeout"
                )

class RateLimiter:
    """Advanced rate limiting with sliding window"""
    
    def __init__(self, redis_client: redis.Redis):
        self.redis = redis_client
        self.local_cache = defaultdict(lambda: deque())
    
    async def is_allowed(
        self,
        key: str,
        limit: int,
        window: int,
        burst: Optional[int] = None
    ) -> tuple[bool, Dict[str, Any]]:
        """Check if request is allowed with sliding window algorithm"""
        now = int(time.time())
        window_start = now - window
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
        
        # Check burst capacity
        if burst and current_count <= burst:
            return True, {
                "allowed": True,
                "limit": limit,
                "remaining": max(0, limit - current_count),
                "reset_time": now + window,
                "current_count": current_count
            }
        
        # Check rate limit
        if current_count <= limit:
            return True, {
                "allowed": True,
                "limit": limit,
                "remaining": max(0, limit - current_count),
                "reset_time": now + window,
                "current_count": current_count
            }
        
        return False, {
            "allowed": False,
            "limit": limit,
            "remaining": 0,
            "reset_time": now + window,
            "current_count": current_count,
            "retry_after": max(1, window - (now - int(results[1][0][0])) if results[1] else window)
        }

class APIKeyManager:
    """API key management and validation"""
    
    def __init__(self, redis_client: redis.Redis):
        self.redis = redis_client
        self.cache = {}
        self.cache_ttl = 300  # 5 minutes
    
    async def validate_api_key(self, api_key: str) -> Optional[Dict[str, Any]]:
        """Validate API key and return metadata"""
        # Check cache first
        if api_key in self.cache:
            cached_data = self.cache[api_key]
            if time.time() - cached_data['cached_at'] < self.cache_ttl:
                return cached_data['data']
        
        # Check Redis
        key_data = await self.redis.hgetall(f"api_key:{api_key}")
        if not key_data:
            return None
        
        # Parse and validate
        try:
            data = {
                'id': key_data.get(b'id', b'').decode(),
                'user_id': key_data.get(b'user_id', b'').decode(),
                'name': key_data.get(b'name', b'').decode(),
                'permissions': json.loads(key_data.get(b'permissions', b'[]').decode()),
                'rate_limit': int(key_data.get(b'rate_limit', b'60').decode()),
                'expires_at': key_data.get(b'expires_at', b'').decode(),
                'is_active': key_data.get(b'is_active', b'true').decode() == 'true'
            }
            
            # Check if expired
            if data['expires_at']:
                expiry = datetime.fromisoformat(data['expires_at'])
                if expiry < datetime.utcnow():
                    return None
            
            # Check if active
            if not data['is_active']:
                return None
            
            # Cache result
            self.cache[api_key] = {
                'data': data,
                'cached_at': time.time()
            }
            
            return data
            
        except Exception as e:
            logger.error(f"Error parsing API key data: {e}")
            return None
    
    async def update_api_key_usage(self, api_key: str, endpoint: str):
        """Update API key usage statistics"""
        await self.redis.incr(f"api_key_usage:{api_key}")
        await self.redis.incr(f"api_key_usage:{api_key}:{endpoint}")
        await self.redis.expire(f"api_key_usage:{api_key}", 86400)  # 24 hours
        await self.redis.expire(f"api_key_usage:{api_key}:{endpoint}", 86400)

class JWTManager:
    """JWT token management"""
    
    def __init__(self, secret_key: str, algorithm: str = "HS256"):
        self.secret_key = secret_key
        self.algorithm = algorithm
        self.blacklist_cache = set()
        self.blacklist_cache_time = 0
    
    def generate_token(self, payload: Dict[str, Any], expires_delta: timedelta = None) -> str:
        """Generate JWT token"""
        if expires_delta:
            expire = datetime.utcnow() + expires_delta
        else:
            expire = datetime.utcnow() + timedelta(hours=24)
        
        payload.update({
            "exp": expire,
            "iat": datetime.utcnow(),
            "type": "access"
        })
        
        return jwt.encode(payload, self.secret_key, algorithm=self.algorithm)
    
    def verify_token(self, token: str) -> Optional[Dict[str, Any]]:
        """Verify JWT token"""
        try:
            # Check blacklist cache
            if token in self.blacklist_cache:
                return None
            
            payload = jwt.decode(token, self.secret_key, algorithms=[self.algorithm])
            
            # Check if token is blacklisted (in Redis would be better)
            if payload.get("jti") in self.blacklist_cache:
                return None
            
            return payload
            
        except jwt.ExpiredSignatureError:
            logger.warning("JWT token expired")
            return None
        except jwt.InvalidTokenError as e:
            logger.warning(f"Invalid JWT token: {e}")
            return None
    
    async def revoke_token(self, token: str):
        """Revoke JWT token (add to blacklist)"""
        payload = self.verify_token(token)
        if payload:
            jti = payload.get("jti")
            if jti:
                self.blacklist_cache.add(token)
                self.blacklist_cache.add(jti)

class IPFilter:
    """IP filtering for security"""
    
    def __init__(self, redis_client: redis.Redis):
        self.redis = redis_client
        self.cache = {}
        self.cache_ttl = 300
    
    def _ip_to_int(self, ip: str) -> int:
        """Convert IP to integer for range matching"""
        return int(ipaddress.ip_address(ip))
    
    def _is_ip_in_range(self, ip: str, ip_range: str) -> bool:
        """Check if IP is in range (CIDR notation)"""
        try:
            return ipaddress.ip_address(ip) in ipaddress.ip_network(ip_range, strict=False)
        except ValueError:
            return False
    
    async def is_ip_allowed(self, ip: str) -> tuple[bool, str]:
        """Check if IP is allowed based on whitelist/blacklist"""
        # Check cache first
        if ip in self.cache:
            cached_result = self.cache[ip]
            if time.time() - cached_result['cached_at'] < self.cache_ttl:
                return cached_result['allowed'], cached_result['reason']
        
        # Check blacklist
        blacklisted = await self.redis.sismember("blacklisted_ips", ip)
        if blacklisted:
            result = (False, "IP is blacklisted")
            self.cache[ip] = {
                'allowed': result[0],
                'reason': result[1],
                'cached_at': time.time()
            }
            return result
        
        # Check blacklist ranges
        blacklist_ranges = await self.redis.smembers("blacklisted_ip_ranges")
        for range_str in blacklist_ranges:
            range_str = range_str.decode() if isinstance(range_str, bytes) else range_str
            if self._is_ip_in_range(ip, range_str):
                result = (False, f"IP is in blacklisted range: {range_str}")
                self.cache[ip] = {
                    'allowed': result[0],
                    'reason': result[1],
                    'cached_at': time.time()
                }
                return result
        
        # Check whitelist if configured
        whitelist_enabled = await self.redis.exists("whitelisted_ips")
        if whitelist_enabled:
            whitelisted = await self.redis.sismember("whitelisted_ips", ip)
            if not whitelisted:
                # Check whitelist ranges
                whitelist_ranges = await self.redis.smembers("whitelisted_ip_ranges")
                for range_str in whitelist_ranges:
                    range_str = range_str.decode() if isinstance(range_str, bytes) else range_str
                    if self._is_ip_in_range(ip, range_str):
                        result = (True, f"IP is in whitelisted range: {range_str}")
                        self.cache[ip] = {
                            'allowed': result[0],
                            'reason': result[1],
                            'cached_at': time.time()
                        }
                        return result
                
                result = (False, "IP is not whitelisted")
            else:
                result = (True, "IP is whitelisted")
        else:
            result = (True, "No IP restrictions")
        
        # Cache result
        self.cache[ip] = {
            'allowed': result[0],
            'reason': result[1],
            'cached_at': time.time()
        }
        
        return result

class APIGatewayMiddleware(BaseHTTPMiddleware):
    """Main API Gateway Middleware"""
    
    def __init__(self, app, config: SecurityConfig):
        super().__init__(app)
        self.config = config
        self.redis_client = None
        self.rate_limiter = None
        self.api_key_manager = None
        self.jwt_manager = None
        self.ip_filter = None
        self.circuit_breakers = {}
        self._initialized = False
    
    async def initialize(self):
        """Initialize async components"""
        if self._initialized:
            return
        
        try:
            # Initialize Redis connection
            redis_url = os.getenv("REDIS_URL", "redis://localhost:6379")
            self.redis_client = redis.from_url(redis_url, decode_responses=True)
            
            # Initialize components
            self.rate_limiter = RateLimiter(self.redis_client)
            self.api_key_manager = APIKeyManager(self.redis_client)
            self.jwt_manager = JWTManager(
                os.getenv("JWT_SECRET_KEY", "your-secret-key-here"),
                algorithm=os.getenv("JWT_ALGORITHM", "HS256")
            )
            self.ip_filter = IPFilter(self.redis_client)
            
            # Initialize circuit breakers for AI providers
            self.circuit_breakers = {
                'zai': CircuitBreaker(CircuitBreakerConfig(
                    failure_threshold=3,
                    recovery_timeout=30,
                    timeout=30.0
                )),
                'openai': CircuitBreaker(CircuitBreakerConfig(
                    failure_threshold=3,
                    recovery_timeout=30,
                    timeout=45.0
                )),
                'claude': CircuitBreaker(CircuitBreakerConfig(
                    failure_threshold=3,
                    recovery_timeout=30,
                    timeout=45.0
                )),
                'perplexity': CircuitBreaker(CircuitBreakerConfig(
                    failure_threshold=3,
                    recovery_timeout=30,
                    timeout=60.0
                ))
            }
            
            self._initialized = True
            logger.info("API Gateway middleware initialized successfully")
            
        except Exception as e:
            logger.error(f"Failed to initialize API Gateway middleware: {e}")
            raise
    
    async def dispatch(self, request: Request, call_next: RequestResponseEndpoint) -> Response:
        """Main middleware dispatch method"""
        if not self._initialized:
            await self.initialize()
        
        start_time = time.time()
        client_ip = self._get_client_ip(request)
        
        try:
            # IP filtering
            if self.config.enable_ip_whitelist or self.config.enable_ip_blacklist:
                ip_allowed, ip_reason = await self.ip_filter.is_ip_allowed(client_ip)
                if not ip_allowed:
                    logger.warning(f"IP blocked: {client_ip} - {ip_reason}")
                    return JSONResponse(
                        status_code=403,
                        content={"detail": f"Access denied: {ip_reason}"}
                    )
            
            # Request size validation
            content_length = request.headers.get("content-length")
            if content_length and int(content_length) > self.config.max_request_size:
                return JSONResponse(
                    status_code=413,
                    content={"detail": "Request entity too large"}
                )
            
            # Authentication
            auth_result = await self._authenticate_request(request)
            if not auth_result['success']:
                return auth_result['response']
            
            user_context = auth_result['context']
            
            # Rate limiting
            if self.config.enable_rate_limiting:
                rate_limit_result = await self._check_rate_limit(request, client_ip, user_context)
                if not rate_limit_result['allowed']:
                    headers = {
                        "X-RateLimit-Limit": str(rate_limit_result['limit']),
                        "X-RateLimit-Remaining": str(rate_limit_result['remaining']),
                        "X-RateLimit-Reset": str(rate_limit_result['reset_time']),
                        "Retry-After": str(rate_limit_result.get('retry_after', 60))
                    }
                    return JSONResponse(
                        status_code=429,
                        content={"detail": "Rate limit exceeded"},
                        headers=headers
                    )
            
            # Add security headers
            response = await call_next(request)
            
            # Add security headers to response
            response = self._add_security_headers(response)
            
            # Add rate limit headers
            if self.config.enable_rate_limiting:
                response.headers["X-RateLimit-Limit"] = str(rate_limit_result['limit'])
                response.headers["X-RateLimit-Remaining"] = str(rate_limit_result['remaining'])
                response.headers["X-RateLimit-Reset"] = str(rate_limit_result['reset_time'])
            
            # Add request ID and timing
            request_id = request.headers.get("X-Request-ID", f"req_{int(time.time()*1000)}")
            response.headers["X-Request-ID"] = request_id
            response.headers["X-Response-Time"] = f"{(time.time() - start_time)*1000:.2f}ms"
            
            # Log request
            await self._log_request(request, response, user_context, time.time() - start_time)
            
            return response
            
        except Exception as e:
            logger.error(f"Gateway middleware error: {e}", exc_info=True)
            return JSONResponse(
                status_code=500,
                content={"detail": "Internal server error"}
            )
    
    def _get_client_ip(self, request: Request) -> str:
        """Get client IP from request"""
        # Check for forwarded headers
        forwarded_for = request.headers.get("X-Forwarded-For")
        if forwarded_for:
            return forwarded_for.split(",")[0].strip()
        
        real_ip = request.headers.get("X-Real-IP")
        if real_ip:
            return real_ip
        
        return request.client.host if request.client else "unknown"
    
    async def _authenticate_request(self, request: Request) -> Dict[str, Any]:
        """Authenticate request using various methods"""
        # Skip authentication for health checks
        if request.url.path in ["/health", "/ready", "/live", "/metrics"]:
            return {"success": True, "context": {"type": "health_check"}}
        
        # Try API key authentication
        if self.config.enable_api_key_auth:
            api_key = request.headers.get("X-API-Key") or request.query_params.get("api_key")
            if api_key:
                api_key_data = await self.api_key_manager.validate_api_key(api_key)
                if api_key_data:
                    await self.api_key_manager.update_api_key_usage(api_key, request.url.path)
                    return {
                        "success": True,
                        "context": {
                            "type": "api_key",
                            "user_id": api_key_data['user_id'],
                            "permissions": api_key_data['permissions'],
                            "rate_limit": api_key_data['rate_limit']
                        }
                    }
                else:
                    return {
                        "success": False,
                        "response": JSONResponse(
                            status_code=401,
                            content={"detail": "Invalid API key"}
                        )
                    }
        
        # Try JWT authentication
        if self.config.enable_jwt_auth:
            auth_header = request.headers.get("Authorization")
            if auth_header and auth_header.startswith("Bearer "):
                token = auth_header.split(" ")[1]
                token_data = self.jwt_manager.verify_token(token)
                if token_data:
                    return {
                        "success": True,
                        "context": {
                            "type": "jwt",
                            "user_id": token_data.get("sub"),
                            "permissions": token_data.get("permissions", []),
                            "exp": token_data.get("exp")
                        }
                    }
                else:
                    return {
                        "success": False,
                        "response": JSONResponse(
                            status_code=401,
                            content={"detail": "Invalid or expired token"}
                        )
                    }
        
        # If no authentication provided and auth is required
        if self.config.enable_api_key_auth or self.config.enable_jwt_auth:
            return {
                "success": False,
                "response": JSONResponse(
                    status_code=401,
                    content={"detail": "Authentication required"}
                )
            }
        
        # No authentication required
        return {"success": True, "context": {"type": "anonymous"}}
    
    async def _check_rate_limit(
        self,
        request: Request,
        client_ip: str,
        user_context: Dict[str, Any]
    ) -> Dict[str, Any]:
        """Check rate limits for the request"""
        # Determine rate limit key and limits
        if user_context['type'] == 'api_key':
            # Rate limit per API key
            key = f"rate_limit:api_key:{user_context['user_id']}"
            limit = user_context.get('rate_limit', 60)
        elif user_context['type'] == 'jwt':
            # Rate limit per user
            key = f"rate_limit:user:{user_context['user_id']}"
            limit = 200  # Higher limit for authenticated users
        else:
            # Rate limit per IP
            key = f"rate_limit:ip:{client_ip}"
            limit = 30  # Lower limit for anonymous users
        
        # Special limits for sensitive endpoints
        if request.url.path.startswith("/api/v1/auth/"):
            limit = min(limit, 10)  # Stricter limit for auth endpoints
        elif request.url.path.startswith("/api/v1/upload"):
            limit = min(limit, 20)  # Stricter limit for uploads
        
        # Check rate limit
        allowed, info = await self.rate_limiter.is_allowed(key, limit, 60, burst=limit//2)
        
        return {
            "allowed": allowed,
            "limit": limit,
            "remaining": info['remaining'],
            "reset_time": info['reset_time'],
            "retry_after": info.get('retry_after')
        }
    
    def _add_security_headers(self, response: Response) -> Response:
        """Add security headers to response"""
        if self.config.enable_cors:
            response.headers["Access-Control-Allow-Origin"] = "*"
            response.headers["Access-Control-Allow-Methods"] = "GET, POST, PUT, DELETE, OPTIONS"
            response.headers["Access-Control-Allow-Headers"] = "Authorization, Content-Type, X-API-Key, X-Request-ID"
            response.headers["Access-Control-Allow-Credentials"] = "true"
        
        if self.config.enable_csp:
            csp = (
                "default-src 'self'; "
                "script-src 'self' 'unsafe-inline' 'unsafe-eval'; "
                "style-src 'self' 'unsafe-inline'; "
                "img-src 'self' data: https:; "
                "font-src 'self' data:; "
                "connect-src 'self' wss: https:; "
                "media-src 'self' blob:; "
                "object-src 'none'; "
                "base-uri 'self'; "
                "form-action 'self'"
            )
            response.headers["Content-Security-Policy"] = csp
        
        response.headers["X-Frame-Options"] = "DENY"
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["X-XSS-Protection"] = "1; mode=block"
        response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["Permissions-Policy"] = "camera=(), microphone=(), geolocation=()"
        
        return response
    
    async def _log_request(
        self,
        request: Request,
        response: Response,
        user_context: Dict[str, Any],
        duration: float
    ):
        """Log request details"""
        log_data = {
            "timestamp": datetime.utcnow().isoformat(),
            "method": request.method,
            "path": request.url.path,
            "query": str(request.url.query),
            "client_ip": self._get_client_ip(request),
            "user_agent": request.headers.get("User-Agent", ""),
            "user_type": user_context['type'],
            "user_id": user_context.get('user_id'),
            "status_code": response.status_code,
            "duration_ms": round(duration * 1000, 2),
            "request_id": response.headers.get("X-Request-ID")
        }
        
        # Log to Redis for analytics
        try:
            await self.redis_client.lpush(
                "request_logs",
                json.dumps(log_data)
            )
            # Keep only last 10000 logs
            await self.redis_client.ltrim("request_logs", 0, 9999)
        except Exception as e:
            logger.error(f"Failed to log request to Redis: {e}")
        
        # Log to standard logger for important requests
        if response.status_code >= 400 or duration > 5.0:
            logger.warning(
                f"Request: {request.method} {request.url.path} - "
                f"Status: {response.status_code} - "
                f"Duration: {duration:.2f}s - "
                f"User: {user_context.get('user_id', 'anonymous')}"
            )

# Decorator for applying circuit breaker to functions
def with_circuit_breaker(gateway: APIGatewayMiddleware, service_name: str):
    """Decorator to apply circuit breaker to async functions"""
    def decorator(func):
        @wraps(func)
        async def wrapper(*args, **kwargs):
            if service_name in gateway.circuit_breakers:
                return await gateway.circuit_breakers[service_name].call(func, *args, **kwargs)
            return await func(*args, **kwargs)
        return wrapper
    return decorator

# Factory function to create gateway middleware
def create_api_gateway(app, config: Optional[SecurityConfig] = None) -> APIGatewayMiddleware:
    """Create API Gateway middleware with configuration"""
    if config is None:
        config = SecurityConfig(
            allowed_origins=["*"],
            enable_cors=True,
            enable_rate_limiting=True,
            enable_jwt_auth=True,
            enable_api_key_auth=True
        )
    
    return APIGatewayMiddleware(app, config)