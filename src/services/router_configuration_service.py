"""
Router Configuration Service

This service provides comprehensive configuration management for the intelligent query router,
including routing policies, model specializations, cost settings, and performance thresholds.
"""

import json
import logging
import os
import yaml
from datetime import datetime, timedelta
from typing import Dict, Any, List, Optional, Union
from dataclasses import dataclass, field, asdict
from enum import Enum
from pathlib import Path

from .intelligent_query_router import (
    QueryType, QueryComplexity, RoutingStrategy, ModelSpecialization,
    ProviderType, LoadBalancingStrategy
)

logger = logging.getLogger(__name__)

class ConfigFormat(Enum):
    """Configuration file formats"""
    JSON = "json"
    YAML = "yaml"
    ENV = "env"

class ConfigScope(Enum):
    """Configuration scopes"""
    GLOBAL = "global"
    PROVIDER = "provider"
    MODEL = "model"
    QUERY_TYPE = "query_type"
    USER = "user"

@dataclass
class RoutingPolicy:
    """Routing policy configuration"""
    policy_id: str
    name: str
    description: str
    priority: int = 1  # Higher number = higher priority
    is_active: bool = True
    
    # Conditions
    query_types: List[QueryType] = field(default_factory=list)
    complexity_levels: List[QueryComplexity] = field(default_factory=list)
    languages: List[str] = field(default_factory=list)
    user_ids: List[str] = field(default_factory=list)
    time_windows: List[Dict[str, str]] = field(default_factory=list)  # {"start": "09:00", "end": "17:00"}
    
    # Routing rules
    preferred_providers: List[ProviderType] = field(default_factory=list)
    excluded_providers: List[ProviderType] = field(default_factory=list)
    preferred_models: List[str] = field(default_factory=list)
    excluded_models: List[str] = field(default_factory=list)
    
    # Strategy and weights
    routing_strategy: RoutingStrategy = RoutingStrategy.BALANCED
    weights: Dict[str, float] = field(default_factory=dict)  # For weighted strategies
    
    # Constraints
    max_cost_per_request: Optional[float] = None
    max_response_time: Optional[float] = None
    min_confidence_score: Optional[float] = None
    
    # Metadata
    created_at: str = field(default_factory=lambda: datetime.utcnow().isoformat())
    updated_at: str = field(default_factory=lambda: datetime.utcnow().isoformat())
    created_by: str = "system"
    tags: List[str] = field(default_factory=list)

@dataclass
class CostConfiguration:
    """Cost management configuration"""
    enable_cost_tracking: bool = True
    cost_budget_monthly: float = 1000.0  # USD
    cost_alert_threshold: float = 0.8  # Alert at 80% of budget
    cost_per_request_limits: Dict[str, float] = field(default_factory=dict)  # provider -> limit
    
    # Cost optimization settings
    enable_cost_optimization: bool = True
    cost_weight_in_routing: float = 0.2  # Weight for cost in balanced routing
    cheap_model_threshold: float = 0.01  # Below this is considered cheap
    
    # Model-specific costs (per 1k tokens)
    model_costs: Dict[str, float] = field(default_factory=dict)
    
    # Currency and billing
    currency: str = "USD"
    billing_cycle_start_day: int = 1

@dataclass
class PerformanceThresholds:
    """Performance threshold configuration"""
    # Response time thresholds (ms)
    max_routing_time: float = 100.0
    max_response_time: float = 5000.0
    p95_response_time_threshold: float = 3000.0
    
    # Success rate thresholds (%)
    min_success_rate: float = 95.0
    min_confidence_score: float = 0.7
    
    # Error rate thresholds (%)
    max_error_rate: float = 5.0
    max_timeout_rate: float = 2.0
    
    # Capacity thresholds (%)
    max_utilization_threshold: float = 80.0
    scale_up_threshold: float = 70.0
    scale_down_threshold: float = 20.0
    
    # Circuit breaker thresholds
    circuit_breaker_failure_threshold: int = 5
    circuit_breaker_timeout: int = 60
    circuit_breaker_success_threshold: int = 3

@dataclass
class RouterConfiguration:
    """Complete router configuration"""
    version: str = "1.0.0"
    environment: str = "production"
    
    # Core settings
    default_routing_strategy: RoutingStrategy = RoutingStrategy.BALANCED
    enable_intelligent_routing: bool = True
    enable_fallback: bool = True
    max_alternatives: int = 3
    routing_timeout: float = 100.0  # ms
    cache_ttl: int = 300  # seconds
    
    # Load balancing
    default_load_balancing_strategy: LoadBalancingStrategy = LoadBalancingStrategy.HEALTH_BASED
    enable_round_robin_fallback: bool = True
    
    # Routing policies
    policies: List[RoutingPolicy] = field(default_factory=list)
    
    # Model specializations
    model_specializations: Dict[str, ModelSpecialization] = field(default_factory=dict)
    
    # Cost configuration
    cost_config: CostConfiguration = field(default_factory=CostConfiguration)
    
    # Performance thresholds
    performance_thresholds: PerformanceThresholds = field(default_factory=PerformanceThresholds)
    
    # Query classification
    enable_query_classification: bool = True
    classification_confidence_threshold: float = 0.7
    
    # Monitoring and analytics
    enable_monitoring: bool = True
    enable_analytics: bool = True
    metrics_retention_days: int = 30
    
    # Feature flags
    enable_ml_routing: bool = False  # Future ML-based routing
    enable_ab_testing: bool = False  # A/B testing for routing strategies
    enable_real_time_optimization: bool = True
    
    # Security
    enable_request_logging: bool = True
    mask_sensitive_data: bool = True
    max_request_size: int = 10000  # characters
    
    # Timestamps
    created_at: str = field(default_factory=lambda: datetime.utcnow().isoformat())
    updated_at: str = field(default_factory=lambda: datetime.utcnow().isoformat())

class RouterConfigurationService:
    """Service for managing router configuration"""
    
    def __init__(self, config_path: str = None, redis_client=None):
        self.config_path = config_path or os.getenv(
            "ROUTER_CONFIG_PATH", 
            "/home/gary/multi-model-orchestrator/ish-chat-backend/config/router_config.yaml"
        )
        self.redis_client = redis_client
        self.config: RouterConfiguration = RouterConfiguration()
        
        # Ensure config directory exists
        Path(self.config_path).parent.mkdir(parents=True, exist_ok=True)
        
        # Load configuration
        self.load_configuration()
        
        logger.info(f"Router Configuration Service initialized with config: {self.config_path}")

    def load_configuration(self) -> bool:
        """Load configuration from file"""
        try:
            if os.path.exists(self.config_path):
                with open(self.config_path, 'r') as f:
                    if self.config_path.endswith('.yaml') or self.config_path.endswith('.yml'):
                        data = yaml.safe_load(f)
                    else:
                        data = json.load(f)
                
                self.config = self._deserialize_config(data)
                logger.info("Configuration loaded successfully")
                return True
            else:
                logger.info("Configuration file not found, using defaults")
                self.save_configuration()  # Save default configuration
                return False
                
        except Exception as e:
            logger.error(f"Error loading configuration: {str(e)}")
            logger.info("Using default configuration")
            self.config = RouterConfiguration()
            return False

    def save_configuration(self) -> bool:
        """Save configuration to file"""
        try:
            self.config.updated_at = datetime.utcnow().isoformat()
            
            with open(self.config_path, 'w') as f:
                if self.config_path.endswith('.yaml') or self.config_path.endswith('.yml'):
                    yaml.dump(asdict(self.config), f, default_flow_style=False, indent=2)
                else:
                    json.dump(asdict(self.config), f, indent=2, default=str)
            
            logger.info("Configuration saved successfully")
            return True
            
        except Exception as e:
            logger.error(f"Error saving configuration: {str(e)}")
            return False

    def _deserialize_config(self, data: Dict[str, Any]) -> RouterConfiguration:
        """Deserialize configuration data from dictionary"""
        
        # Handle enum conversions
        if "default_routing_strategy" in data:
            data["default_routing_strategy"] = RoutingStrategy(data["default_routing_strategy"])
        
        if "default_load_balancing_strategy" in data:
            data["default_load_balancing_strategy"] = LoadBalancingStrategy(data["default_load_balancing_strategy"])
        
        # Handle policies
        if "policies" in data:
            policies = []
            for policy_data in data["policies"]:
                # Convert enums in policies
                if "routing_strategy" in policy_data:
                    policy_data["routing_strategy"] = RoutingStrategy(policy_data["routing_strategy"])
                
                if "query_types" in policy_data:
                    policy_data["query_types"] = [QueryType(qt) for qt in policy_data["query_types"]]
                
                if "complexity_levels" in policy_data:
                    policy_data["complexity_levels"] = [QueryComplexity(qc) for qc in policy_data["complexity_levels"]]
                
                if "preferred_providers" in policy_data:
                    policy_data["preferred_providers"] = [ProviderType(pt) for pt in policy_data["preferred_providers"]]
                
                if "excluded_providers" in policy_data:
                    policy_data["excluded_providers"] = [ProviderType(pt) for pt in policy_data["excluded_providers"]]
                
                policies.append(RoutingPolicy(**policy_data))
            
            data["policies"] = policies
        
        # Handle cost configuration
        if "cost_config" in data:
            data["cost_config"] = CostConfiguration(**data["cost_config"])
        
        # Handle performance thresholds
        if "performance_thresholds" in data:
            data["performance_thresholds"] = PerformanceThresholds(**data["performance_thresholds"])
        
        return RouterConfiguration(**data)

    def get_configuration(self) -> RouterConfiguration:
        """Get current configuration"""
        return self.config

    def update_configuration(self, updates: Dict[str, Any]) -> bool:
        """Update configuration with partial updates"""
        try:
            # Convert dict updates to config object updates
            for key, value in updates.items():
                if hasattr(self.config, key):
                    setattr(self.config, key, value)
                else:
                    logger.warning(f"Unknown configuration key: {key}")
            
            # Save updated configuration
            return self.save_configuration()
            
        except Exception as e:
            logger.error(f"Error updating configuration: {str(e)}")
            return False

    def add_routing_policy(self, policy: RoutingPolicy) -> bool:
        """Add a new routing policy"""
        try:
            # Check if policy already exists
            existing_policy = next((p for p in self.config.policies if p.policy_id == policy.policy_id), None)
            
            if existing_policy:
                # Update existing policy
                index = self.config.policies.index(existing_policy)
                self.config.policies[index] = policy
                logger.info(f"Updated routing policy: {policy.policy_id}")
            else:
                # Add new policy
                self.config.policies.append(policy)
                logger.info(f"Added new routing policy: {policy.policy_id}")
            
            # Sort policies by priority
            self.config.policies.sort(key=lambda p: p.priority, reverse=True)
            
            return self.save_configuration()
            
        except Exception as e:
            logger.error(f"Error adding routing policy: {str(e)}")
            return False

    def remove_routing_policy(self, policy_id: str) -> bool:
        """Remove a routing policy"""
        try:
            original_count = len(self.config.policies)
            self.config.policies = [p for p in self.config.policies if p.policy_id != policy_id]
            
            if len(self.config.policies) < original_count:
                logger.info(f"Removed routing policy: {policy_id}")
                return self.save_configuration()
            else:
                logger.warning(f"Routing policy not found: {policy_id}")
                return False
                
        except Exception as e:
            logger.error(f"Error removing routing policy: {str(e)}")
            return False

    def get_routing_policies(
        self,
        query_type: Optional[QueryType] = None,
        complexity: Optional[QueryComplexity] = None,
        language: Optional[str] = None,
        active_only: bool = True
    ) -> List[RoutingPolicy]:
        """Get routing policies matching criteria"""
        
        policies = self.config.policies
        
        if active_only:
            policies = [p for p in policies if p.is_active]
        
        # Filter by criteria
        if query_type:
            policies = [p for p in policies if not p.query_types or query_type in p.query_types]
        
        if complexity:
            policies = [p for p in policies if not p.complexity_levels or complexity in p.complexity_levels]
        
        if language:
            policies = [p for p in policies if not p.languages or language in p.languages]
        
        return policies

    def update_model_specialization(self, model_key: str, specialization: ModelSpecialization) -> bool:
        """Update or add model specialization"""
        try:
            self.config.model_specializations[model_key] = specialization
            logger.info(f"Updated model specialization: {model_key}")
            return self.save_configuration()
            
        except Exception as e:
            logger.error(f"Error updating model specialization: {str(e)}")
            return False

    def get_model_specialization(self, provider_type: ProviderType, model_name: str) -> Optional[ModelSpecialization]:
        """Get model specialization"""
        model_key = f"{provider_type.value}_{model_name}"
        return self.config.model_specializations.get(model_key)

    def update_cost_configuration(self, cost_config: CostConfiguration) -> bool:
        """Update cost configuration"""
        try:
            self.config.cost_config = cost_config
            logger.info("Updated cost configuration")
            return self.save_configuration()
            
        except Exception as e:
            logger.error(f"Error updating cost configuration: {str(e)}")
            return False

    def update_performance_thresholds(self, thresholds: PerformanceThresholds) -> bool:
        """Update performance thresholds"""
        try:
            self.config.performance_thresholds = thresholds
            logger.info("Updated performance thresholds")
            return self.save_configuration()
            
        except Exception as e:
            logger.error(f"Error updating performance thresholds: {str(e)}")
            return False

    def validate_configuration(self) -> Dict[str, Any]:
        """Validate configuration and return validation results"""
        
        validation_results = {
            "valid": True,
            "errors": [],
            "warnings": [],
            "info": []
        }
        
        # Validate policies
        for policy in self.config.policies:
            if not policy.policy_id:
                validation_results["errors"].append("Policy missing policy_id")
                validation_results["valid"] = False
            
            if not policy.name:
                validation_results["errors"].append(f"Policy {policy.policy_id} missing name")
                validation_results["valid"] = False
            
            # Check for conflicting policies
            conflicting_policies = [
                p for p in self.config.policies
                if p != policy and 
                set(p.query_types) & set(policy.query_types) and
                set(p.complexity_levels) & set(policy.complexity_levels)
            ]
            
            if conflicting_policies:
                validation_results["warnings"].append(
                    f"Policy {policy.policy_id} has overlapping conditions with {len(conflicting_policies)} other policies"
                )
        
        # Validate model specializations
        for model_key, spec in self.config.model_specializations.items():
            if spec.cost_per_1k_tokens < 0:
                validation_results["errors"].append(f"Invalid cost for model {model_key}: {spec.cost_per_1k_tokens}")
                validation_results["valid"] = False
            
            if spec.quality_score < 0 or spec.quality_score > 1:
                validation_results["errors"].append(f"Invalid quality score for model {model_key}: {spec.quality_score}")
                validation_results["valid"] = False
        
        # Validate cost configuration
        if self.config.cost_config.cost_budget_monthly <= 0:
            validation_results["errors"].append("Cost budget must be positive")
            validation_results["valid"] = False
        
        if self.config.cost_config.cost_alert_threshold <= 0 or self.config.cost_config.cost_alert_threshold > 1:
            validation_results["errors"].append("Cost alert threshold must be between 0 and 1")
            validation_results["valid"] = False
        
        # Validate performance thresholds
        if self.config.performance_thresholds.min_success_rate < 0 or self.config.performance_thresholds.min_success_rate > 100:
            validation_results["errors"].append("Success rate threshold must be between 0 and 100")
            validation_results["valid"] = False
        
        if self.config.performance_thresholds.max_error_rate < 0 or self.config.performance_thresholds.max_error_rate > 100:
            validation_results["errors"].append("Error rate threshold must be between 0 and 100")
            validation_results["valid"] = False
        
        # Add info
        validation_results["info"].append(f"Configuration has {len(self.config.policies)} routing policies")
        validation_results["info"].append(f"Configuration has {len(self.config.model_specializations)} model specializations")
        validation_results["info"].append(f"Default routing strategy: {self.config.default_routing_strategy.value}")
        
        return validation_results

    def export_configuration(self, format: ConfigFormat = ConfigFormat.YAML) -> str:
        """Export configuration in specified format"""
        
        config_dict = asdict(self.config)
        
        if format == ConfigFormat.JSON:
            return json.dumps(config_dict, indent=2, default=str)
        elif format == ConfigFormat.YAML:
            return yaml.dump(config_dict, default_flow_style=False, indent=2)
        else:
            raise ValueError(f"Unsupported export format: {format}")

    def import_configuration(self, config_data: str, format: ConfigFormat = ConfigFormat.YAML) -> bool:
        """Import configuration from string"""
        try:
            if format == ConfigFormat.JSON:
                data = json.loads(config_data)
            elif format == ConfigFormat.YAML:
                data = yaml.safe_load(config_data)
            else:
                raise ValueError(f"Unsupported import format: {format}")
            
            self.config = self._deserialize_config(data)
            
            # Validate imported configuration
            validation = self.validate_configuration()
            if not validation["valid"]:
                logger.error(f"Imported configuration is invalid: {validation['errors']}")
                return False
            
            return self.save_configuration()
            
        except Exception as e:
            logger.error(f"Error importing configuration: {str(e)}")
            return False

    def get_configuration_summary(self) -> Dict[str, Any]:
        """Get configuration summary"""
        
        active_policies = [p for p in self.config.policies if p.is_active]
        
        # Policy distribution by query type
        query_type_distribution = {}
        for policy in active_policies:
            for qtype in policy.query_types:
                query_type_distribution[qtype.value] = query_type_distribution.get(qtype.value, 0) + 1
        
        # Strategy distribution
        strategy_distribution = {}
        for policy in active_policies:
            strategy = policy.routing_strategy.value
            strategy_distribution[strategy] = strategy_distribution.get(strategy, 0) + 1
        
        return {
            "version": self.config.version,
            "environment": self.config.environment,
            "last_updated": self.config.updated_at,
            "policies": {
                "total": len(self.config.policies),
                "active": len(active_policies),
                "by_priority": {
                    "high": len([p for p in active_policies if p.priority >= 8]),
                    "medium": len([p for p in active_policies if 4 <= p.priority < 8]),
                    "low": len([p for p in active_policies if p.priority < 4])
                },
                "query_type_distribution": query_type_distribution,
                "strategy_distribution": strategy_distribution
            },
            "model_specializations": {
                "total": len(self.config.model_specializations),
                "by_provider": {
                    provider: len([k for k in self.config.model_specializations.keys() if k.startswith(provider)])
                    for provider in ["zai", "openai", "anthropic", "perplexity"]
                }
            },
            "cost_configuration": {
                "budget_monthly": self.config.cost_config.cost_budget_monthly,
                "alert_threshold": self.config.cost_config.cost_alert_threshold,
                "cost_optimization_enabled": self.config.cost_config.enable_cost_optimization
            },
            "performance_thresholds": {
                "max_response_time": self.config.performance_thresholds.max_response_time,
                "min_success_rate": self.config.performance_thresholds.min_success_rate,
                "max_error_rate": self.config.performance_thresholds.max_error_rate
            },
            "features": {
                "intelligent_routing": self.config.enable_intelligent_routing,
                "query_classification": self.config.enable_query_classification,
                "monitoring": self.config.enable_monitoring,
                "analytics": self.config.enable_analytics,
                "cost_optimization": self.config.cost_config.enable_cost_optimization,
                "real_time_optimization": self.config.enable_real_time_optimization
            }
        }

    async def apply_routing_policy(
        self,
        query_type: QueryType,
        complexity: QueryComplexity,
        language: str,
        user_id: Optional[str] = None
    ) -> Optional[RoutingPolicy]:
        """Apply routing policies to get the best matching policy"""
        
        applicable_policies = self.get_routing_policies(
            query_type=query_type,
            complexity=complexity,
            language=language
        )
        
        # Filter by time windows
        current_time = datetime.utcnow().time()
        user_id = user_id or "anonymous"
        
        valid_policies = []
        for policy in applicable_policies:
            # Check time windows
            if policy.time_windows:
                time_match = False
                for window in policy.time_windows:
                    start_time = datetime.strptime(window["start"], "%H:%M").time()
                    end_time = datetime.strptime(window["end"], "%H:%M").time()
                    
                    if start_time <= current_time <= end_time:
                        time_match = True
                        break
                
                if not time_match:
                    continue
            
            # Check user IDs
            if policy.user_ids and user_id not in policy.user_ids:
                continue
            
            valid_policies.append(policy)
        
        # Return highest priority policy
        return valid_policies[0] if valid_policies else None

    async def cache_configuration(self):
        """Cache configuration in Redis for fast access"""
        if not self.redis_client:
            return
        
        try:
            config_json = json.dumps(asdict(self.config), default=str)
            await self.redis_client.setex(
                "router_config:current",
                timedelta(hours=1),
                config_json
            )
            
            # Cache individual components
            policies_json = json.dumps([asdict(p) for p in self.config.policies], default=str)
            await self.redis_client.setex(
                "router_config:policies",
                timedelta(hours=1),
                policies_json
            )
            
            specializations_json = json.dumps(
                {k: asdict(v) for k, v in self.config.model_specializations.items()},
                default=str
            )
            await self.redis_client.setex(
                "router_config:specializations",
                timedelta(hours=1),
                specializations_json
            )
            
            logger.debug("Configuration cached in Redis")
            
        except Exception as e:
            logger.error(f"Error caching configuration: {str(e)}")

    async def load_cached_configuration(self) -> bool:
        """Load configuration from Redis cache"""
        if not self.redis_client:
            return False
        
        try:
            config_json = await self.redis_client.get("router_config:current")
            if config_json:
                data = json.loads(config_json)
                self.config = self._deserialize_config(data)
                logger.info("Configuration loaded from Redis cache")
                return True
            
        except Exception as e:
            logger.error(f"Error loading cached configuration: {str(e)}")
        
        return False

# Global configuration service instance
router_configuration_service = None

def get_router_configuration_service(config_path: str = None, redis_client=None) -> RouterConfigurationService:
    """Get or create global router configuration service"""
    global router_configuration_service
    if router_configuration_service is None:
        router_configuration_service = RouterConfigurationService(config_path, redis_client)
    return router_configuration_service