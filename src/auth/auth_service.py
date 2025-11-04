"""
Authentication Service for ISH Chat System
Provides comprehensive authentication and authorization features
"""

import os
import json
import time
import secrets
import hashlib
import logging
from typing import Optional, Dict, Any, List, Union
from datetime import datetime, timedelta
from dataclasses import dataclass, asdict
import redis.asyncio as redis
from passlib.context import CryptContext
import jwt
from pydantic import BaseModel, EmailStr, validator
import httpx
import asyncio

logger = logging.getLogger(__name__)

# Password hashing context
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

@dataclass
class User:
    """User model"""
    id: str
    email: str
    username: str
    password_hash: str
    is_active: bool = True
    is_verified: bool = False
    created_at: datetime = None
    last_login: Optional[datetime] = None
    roles: List[str] = None
    permissions: List[str] = None
    metadata: Dict[str, Any] = None
    
    def __post_init__(self):
        if self.created_at is None:
            self.created_at = datetime.utcnow()
        if self.roles is None:
            self.roles = ["user"]
        if self.permissions is None:
            self.permissions = []
        if self.metadata is None:
            self.metadata = {}

@dataclass
class APIKey:
    """API Key model"""
    id: str
    name: str
    key_hash: str
    user_id: str
    permissions: List[str]
    rate_limit: int = 60
    expires_at: Optional[datetime] = None
    is_active: bool = True
    created_at: datetime = None
    last_used: Optional[datetime] = None
    usage_count: int = 0
    
    def __post_init__(self):
        if self.created_at is None:
            self.created_at = datetime.utcnow()

class UserCreate(BaseModel):
    """User creation model"""
    email: EmailStr
    username: str
    password: str
    
    @validator('password')
    def validate_password(cls, v):
        if len(v) < 8:
            raise ValueError('Password must be at least 8 characters long')
        if not any(c.isupper() for c in v):
            raise ValueError('Password must contain at least one uppercase letter')
        if not any(c.islower() for c in v):
            raise ValueError('Password must contain at least one lowercase letter')
        if not any(c.isdigit() for c in v):
            raise ValueError('Password must contain at least one digit')
        return v

class UserLogin(BaseModel):
    """User login model"""
    email: EmailStr
    password: str

class APIKeyCreate(BaseModel):
    """API Key creation model"""
    name: str
    permissions: List[str] = []
    rate_limit: int = 60
    expires_days: Optional[int] = None

class TokenResponse(BaseModel):
    """Token response model"""
    access_token: str
    refresh_token: str
    token_type: str = "bearer"
    expires_in: int
    user: Dict[str, Any]

class AuthService:
    """Authentication service"""
    
    def __init__(self, redis_client: redis.Redis):
        self.redis = redis_client
        self.jwt_secret = os.getenv("JWT_SECRET_KEY", secrets.token_urlsafe(32))
        self.jwt_algorithm = os.getenv("JWT_ALGORITHM", "HS256")
        self.access_token_expire_minutes = int(os.getenv("ACCESS_TOKEN_EXPIRE_MINUTES", "30"))
        self.refresh_token_expire_days = int(os.getenv("REFRESH_TOKEN_EXPIRE_DAYS", "7"))
        self.password_reset_expire_hours = int(os.getenv("PASSWORD_RESET_EXPIRE_HOURS", "2"))
        
        # Cache for users and API keys
        self.user_cache = {}
        self.api_key_cache = {}
        self.cache_ttl = 300  # 5 minutes
    
    async def initialize(self):
        """Initialize the auth service"""
        # Create default admin user if none exists
        admin_email = os.getenv("DEFAULT_ADMIN_EMAIL", "admin@ish-chat.local")
        admin_password = os.getenv("DEFAULT_ADMIN_PASSWORD", "admin123456")
        
        existing_admin = await self.get_user_by_email(admin_email)
        if not existing_admin:
            await self.create_user(
                email=admin_email,
                username="admin",
                password=admin_password,
                roles=["admin", "user"],
                is_verified=True
            )
            logger.info(f"Created default admin user: {admin_email}")
    
    def hash_password(self, password: str) -> str:
        """Hash password using bcrypt"""
        return pwd_context.hash(password)
    
    def verify_password(self, password: str, hashed_password: str) -> bool:
        """Verify password against hash"""
        return pwd_context.verify(password, hashed_password)
    
    def hash_api_key(self, api_key: str) -> str:
        """Hash API key using SHA-256"""
        return hashlib.sha256(api_key.encode()).hexdigest()
    
    def generate_api_key(self) -> str:
        """Generate a secure API key"""
        return f"ish-chat-{secrets.token_urlsafe(32)}"
    
    def create_access_token(self, user_id: str, permissions: List[str] = None) -> str:
        """Create JWT access token"""
        now = datetime.utcnow()
        expires = now + timedelta(minutes=self.access_token_expire_minutes)
        
        payload = {
            "sub": user_id,
            "type": "access",
            "iat": now,
            "exp": expires,
            "jti": secrets.token_urlsafe(16),
            "permissions": permissions or []
        }
        
        return jwt.encode(payload, self.jwt_secret, algorithm=self.jwt_algorithm)
    
    def create_refresh_token(self, user_id: str) -> str:
        """Create JWT refresh token"""
        now = datetime.utcnow()
        expires = now + timedelta(days=self.refresh_token_expire_days)
        
        payload = {
            "sub": user_id,
            "type": "refresh",
            "iat": now,
            "exp": expires,
            "jti": secrets.token_urlsafe(16)
        }
        
        return jwt.encode(payload, self.jwt_secret, algorithm=self.jwt_algorithm)
    
    def verify_token(self, token: str, token_type: str = "access") -> Optional[Dict[str, Any]]:
        """Verify JWT token"""
        try:
            payload = jwt.decode(token, self.jwt_secret, algorithms=[self.jwt_algorithm])
            
            if payload.get("type") != token_type:
                return None
            
            return payload
        except jwt.ExpiredSignatureError:
            logger.warning("Token expired")
            return None
        except jwt.InvalidTokenError as e:
            logger.warning(f"Invalid token: {e}")
            return None
    
    async def create_user(
        self,
        email: str,
        username: str,
        password: str,
        roles: List[str] = None,
        is_verified: bool = False,
        metadata: Dict[str, Any] = None
    ) -> User:
        """Create a new user"""
        # Check if user already exists
        existing_user = await self.get_user_by_email(email)
        if existing_user:
            raise ValueError("User with this email already exists")
        
        existing_user = await self.get_user_by_username(username)
        if existing_user:
            raise ValueError("User with this username already exists")
        
        # Create user
        user = User(
            id=f"user_{int(time.time())}_{secrets.token_hex(8)}",
            email=email,
            username=username,
            password_hash=self.hash_password(password),
            roles=roles or ["user"],
            is_verified=is_verified,
            metadata=metadata or {}
        )
        
        # Store in Redis
        await self.store_user(user)
        
        logger.info(f"Created user: {email}")
        return user
    
    async def authenticate_user(self, email: str, password: str) -> Optional[User]:
        """Authenticate user with email and password"""
        user = await self.get_user_by_email(email)
        if not user:
            return None
        
        if not user.is_active:
            return None
        
        if not self.verify_password(password, user.password_hash):
            return None
        
        # Update last login
        user.last_login = datetime.utcnow()
        await self.store_user(user)
        
        return user
    
    async def login_user(self, email: str, password: str) -> Optional[TokenResponse]:
        """Login user and return tokens"""
        user = await self.authenticate_user(email, password)
        if not user:
            return None
        
        # Create tokens
        access_token = self.create_access_token(user.id, user.permissions)
        refresh_token = self.create_refresh_token(user.id)
        
        # Store refresh token in Redis
        await self.redis.setex(
            f"refresh_token:{user.id}",
            self.refresh_token_expire_days * 24 * 3600,
            refresh_token
        )
        
        return TokenResponse(
            access_token=access_token,
            refresh_token=refresh_token,
            expires_in=self.access_token_expire_minutes * 60,
            user={
                "id": user.id,
                "email": user.email,
                "username": user.username,
                "roles": user.roles,
                "permissions": user.permissions,
                "is_verified": user.is_verified,
                "last_login": user.last_login.isoformat() if user.last_login else None
            }
        )
    
    async def refresh_access_token(self, refresh_token: str) -> Optional[str]:
        """Refresh access token using refresh token"""
        payload = self.verify_token(refresh_token, "refresh")
        if not payload:
            return None
        
        user_id = payload["sub"]
        
        # Check if refresh token is still valid in Redis
        stored_token = await self.redis.get(f"refresh_token:{user_id}")
        if stored_token != refresh_token:
            return None
        
        # Get user
        user = await self.get_user(user_id)
        if not user or not user.is_active:
            return None
        
        # Create new access token
        return self.create_access_token(user.id, user.permissions)
    
    async def logout_user(self, user_id: str, refresh_token: str = None):
        """Logout user by invalidating refresh token"""
        if refresh_token:
            payload = self.verify_token(refresh_token, "refresh")
            if payload and payload["sub"] == user_id:
                await self.redis.delete(f"refresh_token:{user_id}")
        
        # Add token to blacklist (in production, use Redis with expiration)
        # await self.redis.sadd("blacklisted_tokens", refresh_token)
    
    async def create_api_key(
        self,
        user_id: str,
        name: str,
        permissions: List[str] = None,
        rate_limit: int = 60,
        expires_days: int = None
    ) -> tuple[str, APIKey]:
        """Create a new API key"""
        # Generate API key
        api_key_value = self.generate_api_key()
        api_key_hash = self.hash_api_key(api_key_value)
        
        # Create API key object
        api_key = APIKey(
            id=f"key_{int(time.time())}_{secrets.token_hex(8)}",
            name=name,
            key_hash=api_key_hash,
            user_id=user_id,
            permissions=permissions or [],
            rate_limit=rate_limit,
            expires_at=datetime.utcnow() + timedelta(days=expires_days) if expires_days else None
        )
        
        # Store in Redis
        await self.store_api_key(api_key)
        
        logger.info(f"Created API key: {name} for user {user_id}")
        return api_key_value, api_key
    
    async def validate_api_key(self, api_key_value: str) -> Optional[APIKey]:
        """Validate API key and return metadata"""
        api_key_hash = self.hash_api_key(api_key_value)
        
        # Check cache first
        if api_key_hash in self.api_key_cache:
            cached_key = self.api_key_cache[api_key_hash]
            if time.time() - cached_key['cached_at'] < self.cache_ttl:
                api_key = cached_key['data']
                if api_key.is_active and (not api_key.expires_at or api_key.expires_at > datetime.utcnow()):
                    # Update last used
                    api_key.last_used = datetime.utcnow()
                    api_key.usage_count += 1
                    await self.store_api_key(api_key)
                    return api_key
        
        # Check Redis
        key_data = await self.redis.hgetall(f"api_key:{api_key_hash}")
        if not key_data:
            return None
        
        # Parse API key
        try:
            api_key = APIKey(
                id=key_data.get('id', ''),
                name=key_data.get('name', ''),
                key_hash=api_key_hash,
                user_id=key_data.get('user_id', ''),
                permissions=json.loads(key_data.get('permissions', '[]')),
                rate_limit=int(key_data.get('rate_limit', '60')),
                expires_at=datetime.fromisoformat(key_data['expires_at']) if key_data.get('expires_at') else None,
                is_active=key_data.get('is_active', 'true').lower() == 'true',
                created_at=datetime.fromisoformat(key_data['created_at']),
                last_used=datetime.fromisoformat(key_data['last_used']) if key_data.get('last_used') else None,
                usage_count=int(key_data.get('usage_count', '0'))
            )
            
            # Check if active and not expired
            if not api_key.is_active:
                return None
            
            if api_key.expires_at and api_key.expires_at <= datetime.utcnow():
                return None
            
            # Update usage
            api_key.last_used = datetime.utcnow()
            api_key.usage_count += 1
            await self.store_api_key(api_key)
            
            # Cache result
            self.api_key_cache[api_key_hash] = {
                'data': api_key,
                'cached_at': time.time()
            }
            
            return api_key
            
        except Exception as e:
            logger.error(f"Error parsing API key: {e}")
            return None
    
    async def revoke_api_key(self, api_key_hash: str):
        """Revoke API key"""
        await self.redis.hset(f"api_key:{api_key_hash}", "is_active", "false")
        
        # Remove from cache
        if api_key_hash in self.api_key_cache:
            del self.api_key_cache[api_key_hash]
    
    async def get_user(self, user_id: str) -> Optional[User]:
        """Get user by ID"""
        # Check cache first
        if user_id in self.user_cache:
            cached_user = self.user_cache[user_id]
            if time.time() - cached_user['cached_at'] < self.cache_ttl:
                return cached_user['data']
        
        # Check Redis
        user_data = await self.redis.hgetall(f"user:{user_id}")
        if not user_data:
            return None
        
        # Parse user
        try:
            user = User(
                id=user_id,
                email=user_data.get('email', ''),
                username=user_data.get('username', ''),
                password_hash=user_data.get('password_hash', ''),
                is_active=user_data.get('is_active', 'true').lower() == 'true',
                is_verified=user_data.get('is_verified', 'false').lower() == 'true',
                created_at=datetime.fromisoformat(user_data['created_at']),
                last_login=datetime.fromisoformat(user_data['last_login']) if user_data.get('last_login') else None,
                roles=json.loads(user_data.get('roles', '[]')),
                permissions=json.loads(user_data.get('permissions', '[]')),
                metadata=json.loads(user_data.get('metadata', '{}'))
            )
            
            # Cache result
            self.user_cache[user_id] = {
                'data': user,
                'cached_at': time.time()
            }
            
            return user
            
        except Exception as e:
            logger.error(f"Error parsing user data: {e}")
            return None
    
    async def get_user_by_email(self, email: str) -> Optional[User]:
        """Get user by email"""
        user_id = await self.redis.get(f"user_email:{email}")
        if user_id:
            return await self.get_user(user_id)
        return None
    
    async def get_user_by_username(self, username: str) -> Optional[User]:
        """Get user by username"""
        user_id = await self.redis.get(f"user_username:{username}")
        if user_id:
            return await self.get_user(user_id)
        return None
    
    async def store_user(self, user: User):
        """Store user in Redis"""
        # Store user data
        await self.redis.hset(f"user:{user.id}", mapping={
            'email': user.email,
            'username': user.username,
            'password_hash': user.password_hash,
            'is_active': str(user.is_active).lower(),
            'is_verified': str(user.is_verified).lower(),
            'created_at': user.created_at.isoformat(),
            'last_login': user.last_login.isoformat() if user.last_login else '',
            'roles': json.dumps(user.roles),
            'permissions': json.dumps(user.permissions),
            'metadata': json.dumps(user.metadata)
        })
        
        # Create indexes
        await self.redis.set(f"user_email:{user.email}", user.id)
        await self.redis.set(f"user_username:{user.username}", user.id)
        
        # Update cache
        self.user_cache[user.id] = {
            'data': user,
            'cached_at': time.time()
        }
    
    async def store_api_key(self, api_key: APIKey):
        """Store API key in Redis"""
        await self.redis.hset(f"api_key:{api_key.key_hash}", mapping={
            'id': api_key.id,
            'name': api_key.name,
            'user_id': api_key.user_id,
            'permissions': json.dumps(api_key.permissions),
            'rate_limit': str(api_key.rate_limit),
            'expires_at': api_key.expires_at.isoformat() if api_key.expires_at else '',
            'is_active': str(api_key.is_active).lower(),
            'created_at': api_key.created_at.isoformat(),
            'last_used': api_key.last_used.isoformat() if api_key.last_used else '',
            'usage_count': str(api_key.usage_count)
        })
        
        # Create user index
        await self.redis.sadd(f"user_api_keys:{api_key.user_id}", api_key.key_hash)
        
        # Update cache
        self.api_key_cache[api_key.key_hash] = {
            'data': api_key,
            'cached_at': time.time()
        }
    
    async def get_user_api_keys(self, user_id: str) -> List[APIKey]:
        """Get all API keys for a user"""
        key_hashes = await self.redis.smembers(f"user_api_keys:{user_id}")
        api_keys = []
        
        for key_hash in key_hashes:
            key_data = await self.redis.hgetall(f"api_key:{key_hash}")
            if key_data:
                try:
                    api_key = APIKey(
                        id=key_data.get('id', ''),
                        name=key_data.get('name', ''),
                        key_hash=key_hash.decode() if isinstance(key_hash, bytes) else key_hash,
                        user_id=key_data.get('user_id', ''),
                        permissions=json.loads(key_data.get('permissions', '[]')),
                        rate_limit=int(key_data.get('rate_limit', '60')),
                        expires_at=datetime.fromisoformat(key_data['expires_at']) if key_data.get('expires_at') else None,
                        is_active=key_data.get('is_active', 'true').lower() == 'true',
                        created_at=datetime.fromisoformat(key_data['created_at']),
                        last_used=datetime.fromisoformat(key_data['last_used']) if key_data.get('last_used') else None,
                        usage_count=int(key_data.get('usage_count', '0'))
                    )
                    api_keys.append(api_key)
                except Exception as e:
                    logger.error(f"Error parsing API key: {e}")
        
        return api_keys
    
    async def has_permission(self, user_id: str, permission: str) -> bool:
        """Check if user has specific permission"""
        user = await self.get_user(user_id)
        if not user:
            return False
        
        # Admin users have all permissions
        if "admin" in user.roles:
            return True
        
        # Check direct permissions
        if permission in user.permissions:
            return True
        
        # Check role-based permissions
        role_permissions = {
            "admin": ["*"],
            "moderator": ["read", "write", "moderate"],
            "user": ["read", "write"],
            "guest": ["read"]
        }
        
        for role in user.roles:
            if role in role_permissions:
                if "*" in role_permissions[role] or permission in role_permissions[role]:
                    return True
        
        return False
    
    async def change_password(self, user_id: str, current_password: str, new_password: str) -> bool:
        """Change user password"""
        user = await self.get_user(user_id)
        if not user:
            return False
        
        if not self.verify_password(current_password, user.password_hash):
            return False
        
        user.password_hash = self.hash_password(new_password)
        await self.store_user(user)
        
        return True
    
    async def reset_password_request(self, email: str) -> Optional[str]:
        """Request password reset"""
        user = await self.get_user_by_email(email)
        if not user:
            return None
        
        # Generate reset token
        reset_token = secrets.token_urlsafe(32)
        reset_token_hash = hashlib.sha256(reset_token.encode()).hexdigest()
        
        # Store reset token
        await self.redis.setex(
            f"password_reset:{reset_token_hash}",
            self.password_reset_expire_hours * 3600,
            user.id
        )
        
        return reset_token
    
    async def reset_password(self, reset_token: str, new_password: str) -> bool:
        """Reset password using reset token"""
        reset_token_hash = hashlib.sha256(reset_token.encode()).hexdigest()
        user_id = await self.redis.get(f"password_reset:{reset_token_hash}")
        
        if not user_id:
            return False
        
        user = await self.get_user(user_id)
        if not user:
            return False
        
        user.password_hash = self.hash_password(new_password)
        await self.store_user(user)
        
        # Delete reset token
        await self.redis.delete(f"password_reset:{reset_token_hash}")
        
        return True

# Factory function to create auth service
def create_auth_service(redis_client: redis.Redis) -> AuthService:
    """Create and configure auth service"""
    return AuthService(redis_client)