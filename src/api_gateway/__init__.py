"""
API Gateway Module for ISH Chat System
Provides comprehensive gateway functionality including:
- Load balancing and routing
- Authentication and authorization
- Rate limiting and security
- Circuit breaker pattern
- Request/response transformation
"""

from .middleware import (
    APIGatewayMiddleware,
    SecurityConfig,
    RateLimitConfig,
    CircuitBreakerConfig,
    create_api_gateway,
    with_circuit_breaker
)

__all__ = [
    "APIGatewayMiddleware",
    "SecurityConfig", 
    "RateLimitConfig",
    "CircuitBreakerConfig",
    "create_api_gateway",
    "with_circuit_breaker"
]

__version__ = "1.0.0"