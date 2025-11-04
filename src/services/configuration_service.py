"""
Configuration Management Service for Instance Manager
"""
import json
import logging
import os
import yaml
from datetime import datetime, timedelta
from typing import Dict, List, Optional, Any, Union
from dataclasses import dataclass, field, asdict
from pathlib import Path
from enum import Enum

from sqlalchemy.orm import Session
from sqlalchemy import desc

from ..models.instance_manager import (
    AIInstance, ProviderGroup, LoadBalancerConfig
)
from ..database.database import get_db

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
    INSTANCE = "instance"
    GROUP = "group"

@dataclass
class ConfigurationItem:
    """Configuration item with metadata"""
    key: str
    value: Any
    scope: ConfigScope
    description: str
    data_type: str  # string, integer, float, boolean, array, object
    required: bool = False
    default_value: Any = None
    validation_regex: Optional[str] = None
    min_value: Optional[Union[int, float]] = None
    max_value: Optional[Union[int, float]] = None
    allowed_values: Optional[List[Any]] = None
    created_at: datetime = field(default_factory=datetime.utcnow)
    updated_at: datetime = field(default_factory=datetime.utcnow)
    version: int = 1

@dataclass
class ProviderConfig:
    """Provider-specific configuration"""
    provider_type: str
    enabled: bool = True
    default_models: List[str] = field(default_factory=list)
    api_endpoints: List[str] = field(default_factory=list)
    rate_limits: Dict[str, int] = field(default_factory=dict)
    timeout_settings: Dict[str, int] = field(default_factory=dict)
    retry_settings: Dict[str, int] = field(default_factory=dict)
    authentication: Dict[str, Any] = field(default_factory=dict)
    custom_settings: Dict[str, Any] = field(default_factory=dict)

@dataclass
class LoadBalancerConfig:
    """Load balancer configuration"""
    strategy: str = "health_based"
    health_check_interval: int = 30
    health_check_timeout: int = 10
    unhealthy_threshold: int = 3
    healthy_threshold: int = 2
    failover_enabled: bool = True
    circuit_breaker_enabled: bool = True
    session_affinity: bool = False

@dataclass
class AutoScalingConfig:
    """Auto-scaling configuration"""
    enabled: bool = True
    min_instances: int = 1
    max_instances: int = 10
    scale_up_threshold: float = 0.8
    scale_down_threshold: float = 0.2
    scale_up_cooldown: int = 300
    scale_down_cooldown: int = 600
    evaluation_interval: int = 60
    predictive_scaling: bool = False

@dataclass
class MonitoringConfig:
    """Monitoring configuration"""
    enabled: bool = True
    metrics_collection_interval: int = 60
    health_check_interval: int = 30
    alert_thresholds: Dict[str, float] = field(default_factory=dict)
    notification_settings: Dict[str, Any] = field(default_factory=dict)
    retention_days: int = 30

class ConfigurationService:
    """Service for managing Instance Manager configuration"""
    
    def __init__(self, config_dir: str = "config"):
        self.config_dir = Path(config_dir)
        self.config_dir.mkdir(exist_ok=True)
        
        # Configuration storage
        self._config_cache = {}
        self._config_file_path = self.config_dir / "instance_manager_config.json"
        self._providers_file_path = self.config_dir / "providers.yaml"
        self._load_balancer_file_path = self.config_dir / "load_balancer.yaml"
        self._auto_scaling_file_path = self.config_dir / "auto_scaling.yaml"
        self._monitoring_file_path = self.config_dir / "monitoring.yaml"
        
        # Default configurations
        self._default_config = self._initialize_default_config()
        
        # Load existing configuration
        self.load_configuration()
    
    def _initialize_default_config(self) -> Dict[str, Any]:
        """Initialize default configuration"""
        
        return {
            "global": {
                "instance_manager": {
                    "debug": False,
                    "log_level": "INFO",
                    "max_concurrent_health_checks": 10,
                    "default_timeout": 30,
                    "cleanup_interval_hours": 24,
                    "data_retention_days": 30
                },
                "database": {
                    "connection_pool_size": 10,
                    "max_overflow": 20,
                    "pool_timeout": 30,
                    "pool_recycle": 3600
                },
                "security": {
                    "api_key_rotation_days": 90,
                    "encrypt_api_keys": True,
                    "allowed_origins": ["*"],
                    "rate_limiting": {
                        "enabled": True,
                        "requests_per_minute": 1000,
                        "burst_size": 100
                    }
                }
            },
            "providers": {
                "zai": {
                    "enabled": True,
                    "default_models": ["glm-4", "glm-4-coding-max"],
                    "api_endpoints": ["https://open.bigmodel.cn/api/paas/v4"],
                    "rate_limits": {
                        "requests_per_minute": 60,
                        "tokens_per_minute": 10000
                    },
                    "timeout_settings": {
                        "connect_timeout": 10,
                        "read_timeout": 30,
                        "total_timeout": 60
                    },
                    "retry_settings": {
                        "max_retries": 3,
                        "retry_delay": 1,
                        "backoff_factor": 2
                    }
                },
                "openai": {
                    "enabled": True,
                    "default_models": ["gpt-4", "gpt-3.5-turbo"],
                    "api_endpoints": ["https://api.openai.com/v1"],
                    "rate_limits": {
                        "requests_per_minute": 60,
                        "tokens_per_minute": 90000
                    },
                    "timeout_settings": {
                        "connect_timeout": 10,
                        "read_timeout": 30,
                        "total_timeout": 60
                    },
                    "retry_settings": {
                        "max_retries": 3,
                        "retry_delay": 1,
                        "backoff_factor": 2
                    }
                },
                "anthropic": {
                    "enabled": True,
                    "default_models": ["claude-3-sonnet-20240229", "claude-3-haiku-20240307"],
                    "api_endpoints": ["https://api.anthropic.com/v1"],
                    "rate_limits": {
                        "requests_per_minute": 60,
                        "tokens_per_minute": 40000
                    },
                    "timeout_settings": {
                        "connect_timeout": 10,
                        "read_timeout": 30,
                        "total_timeout": 60
                    },
                    "retry_settings": {
                        "max_retries": 3,
                        "retry_delay": 1,
                        "backoff_factor": 2
                    }
                },
                "perplexity": {
                    "enabled": True,
                    "default_models": ["llama-3-sonar-small-32k-chat", "mixtral-8x7b-instruct"],
                    "api_endpoints": ["https://api.perplexity.ai"],
                    "rate_limits": {
                        "requests_per_minute": 60,
                        "tokens_per_minute": 20000
                    },
                    "timeout_settings": {
                        "connect_timeout": 10,
                        "read_timeout": 30,
                        "total_timeout": 60
                    },
                    "retry_settings": {
                        "max_retries": 3,
                        "retry_delay": 1,
                        "backoff_factor": 2
                    }
                }
            },
            "load_balancer": {
                "strategy": "health_based",
                "health_check_interval": 30,
                "health_check_timeout": 10,
                "unhealthy_threshold": 3,
                "healthy_threshold": 2,
                "failover_enabled": True,
                "circuit_breaker_enabled": True,
                "circuit_breaker_threshold": 5,
                "circuit_breaker_timeout": 60,
                "session_affinity": False
            },
            "auto_scaling": {
                "enabled": True,
                "min_instances": 1,
                "max_instances": 10,
                "scale_up_threshold": 0.8,
                "scale_down_threshold": 0.2,
                "scale_up_cooldown": 300,
                "scale_down_cooldown": 600,
                "evaluation_interval": 60,
                "predictive_scaling": False
            },
            "monitoring": {
                "enabled": True,
                "metrics_collection_interval": 60,
                "health_check_interval": 30,
                "alert_thresholds": {
                    "response_time_warning": 2000,
                    "response_time_critical": 5000,
                    "error_rate_warning": 5,
                    "error_rate_critical": 10,
                    "success_rate_warning": 90,
                    "success_rate_critical": 80
                },
                "notification_settings": {
                    "email": {
                        "enabled": False,
                        "smtp_server": "",
                        "smtp_port": 587,
                        "username": "",
                        "password": "",
                        "recipients": []
                    },
                    "slack": {
                        "enabled": False,
                        "webhook_url": "",
                        "channel": "#alerts"
                    }
                },
                "retention_days": 30
            }
        }
    
    def load_configuration(self):
        """Load configuration from files"""
        
        try:
            # Load main configuration
            if self._config_file_path.exists():
                with open(self._config_file_path, 'r') as f:
                    loaded_config = json.load(f)
                
                # Merge with defaults
                self._merge_config(self._default_config, loaded_config)
            
            # Update cache
            self._config_cache = self._default_config.copy()
            
            logger.info("Configuration loaded successfully")
            
        except Exception as e:
            logger.error(f"Failed to load configuration: {e}")
            logger.info("Using default configuration")
            self._config_cache = self._default_config.copy()
    
    def save_configuration(self):
        """Save current configuration to files"""
        
        try:
            # Create backup
            if self._config_file_path.exists():
                backup_path = self._config_file_path.with_suffix('.json.backup')
                self._config_file_path.rename(backup_path)
            
            # Save main configuration
            with open(self._config_file_path, 'w') as f:
                json.dump(self._config_cache, f, indent=2, default=str)
            
            logger.info("Configuration saved successfully")
            
        except Exception as e:
            logger.error(f"Failed to save configuration: {e}")
            raise
    
    def get_config(
        self,
        key: str,
        scope: ConfigScope = ConfigScope.GLOBAL,
        default: Any = None
    ) -> Any:
        """Get configuration value"""
        
        try:
            # Navigate through nested keys
            keys = key.split('.')
            value = self._config_cache
            
            for k in keys:
                if isinstance(value, dict) and k in value:
                    value = value[k]
                else:
                    return default
            
            return value
            
        except Exception as e:
            logger.error(f"Failed to get config value for key '{key}': {e}")
            return default
    
    def set_config(
        self,
        key: str,
        value: Any,
        scope: ConfigScope = ConfigScope.GLOBAL,
        description: Optional[str] = None
    ):
        """Set configuration value"""
        
        try:
            # Validate configuration
            self._validate_config(key, value)
            
            # Navigate through nested keys and set value
            keys = key.split('.')
            config = self._config_cache
            
            for k in keys[:-1]:
                if k not in config:
                    config[k] = {}
                config = config[k]
            
            # Set the final value
            config[keys[-1]] = value
            
            logger.info(f"Configuration updated: {key} = {value}")
            
        except Exception as e:
            logger.error(f"Failed to set config value for key '{key}': {e}")
            raise
    
    def get_provider_config(self, provider_type: str) -> Optional[ProviderConfig]:
        """Get provider-specific configuration"""
        
        try:
            provider_data = self.get_config(f"providers.{provider_type}")
            if not provider_data:
                return None
            
            return ProviderConfig(
                provider_type=provider_type,
                enabled=provider_data.get("enabled", True),
                default_models=provider_data.get("default_models", []),
                api_endpoints=provider_data.get("api_endpoints", []),
                rate_limits=provider_data.get("rate_limits", {}),
                timeout_settings=provider_data.get("timeout_settings", {}),
                retry_settings=provider_data.get("retry_settings", {}),
                authentication=provider_data.get("authentication", {}),
                custom_settings=provider_data.get("custom_settings", {})
            )
            
        except Exception as e:
            logger.error(f"Failed to get provider config for '{provider_type}': {e}")
            return None
    
    def update_provider_config(self, provider_config: ProviderConfig):
        """Update provider-specific configuration"""
        
        try:
            provider_data = asdict(provider_config)
            self.set_config(f"providers.{provider_config.provider_type}", provider_data)
            
        except Exception as e:
            logger.error(f"Failed to update provider config for '{provider_config.provider_type}': {e}")
            raise
    
    def get_load_balancer_config(self) -> LoadBalancerConfig:
        """Get load balancer configuration"""
        
        try:
            lb_data = self.get_config("load_balancer", default={})
            
            return LoadBalancerConfig(
                strategy=lb_data.get("strategy", "health_based"),
                health_check_interval=lb_data.get("health_check_interval", 30),
                health_check_timeout=lb_data.get("health_check_timeout", 10),
                unhealthy_threshold=lb_data.get("unhealthy_threshold", 3),
                healthy_threshold=lb_data.get("healthy_threshold", 2),
                failover_enabled=lb_data.get("failover_enabled", True),
                circuit_breaker_enabled=lb_data.get("circuit_breaker_enabled", True),
                session_affinity=lb_data.get("session_affinity", False)
            )
            
        except Exception as e:
            logger.error(f"Failed to get load balancer config: {e}")
            return LoadBalancerConfig()
    
    def update_load_balancer_config(self, config: LoadBalancerConfig):
        """Update load balancer configuration"""
        
        try:
            config_data = asdict(config)
            self.set_config("load_balancer", config_data)
            
        except Exception as e:
            logger.error(f"Failed to update load balancer config: {e}")
            raise
    
    def get_auto_scaling_config(self) -> AutoScalingConfig:
        """Get auto-scaling configuration"""
        
        try:
            as_data = self.get_config("auto_scaling", default={})
            
            return AutoScalingConfig(
                enabled=as_data.get("enabled", True),
                min_instances=as_data.get("min_instances", 1),
                max_instances=as_data.get("max_instances", 10),
                scale_up_threshold=as_data.get("scale_up_threshold", 0.8),
                scale_down_threshold=as_data.get("scale_down_threshold", 0.2),
                scale_up_cooldown=as_data.get("scale_up_cooldown", 300),
                scale_down_cooldown=as_data.get("scale_down_cooldown", 600),
                evaluation_interval=as_data.get("evaluation_interval", 60),
                predictive_scaling=as_data.get("predictive_scaling", False)
            )
            
        except Exception as e:
            logger.error(f"Failed to get auto scaling config: {e}")
            return AutoScalingConfig()
    
    def update_auto_scaling_config(self, config: AutoScalingConfig):
        """Update auto-scaling configuration"""
        
        try:
            config_data = asdict(config)
            self.set_config("auto_scaling", config_data)
            
        except Exception as e:
            logger.error(f"Failed to update auto scaling config: {e}")
            raise
    
    def get_monitoring_config(self) -> MonitoringConfig:
        """Get monitoring configuration"""
        
        try:
            mon_data = self.get_config("monitoring", default={})
            
            return MonitoringConfig(
                enabled=mon_data.get("enabled", True),
                metrics_collection_interval=mon_data.get("metrics_collection_interval", 60),
                health_check_interval=mon_data.get("health_check_interval", 30),
                alert_thresholds=mon_data.get("alert_thresholds", {}),
                notification_settings=mon_data.get("notification_settings", {}),
                retention_days=mon_data.get("retention_days", 30)
            )
            
        except Exception as e:
            logger.error(f"Failed to get monitoring config: {e}")
            return MonitoringConfig()
    
    def update_monitoring_config(self, config: MonitoringConfig):
        """Update monitoring configuration"""
        
        try:
            config_data = asdict(config)
            self.set_config("monitoring", config_data)
            
        except Exception as e:
            logger.error(f"Failed to update monitoring config: {e}")
            raise
    
    def export_configuration(
        self,
        format: ConfigFormat = ConfigFormat.JSON,
        include_secrets: bool = False
    ) -> str:
        """Export configuration to string"""
        
        try:
            # Create a copy of the configuration
            config_copy = self._config_cache.copy()
            
            # Remove secrets if requested
            if not include_secrets:
                config_copy = self._remove_secrets(config_copy)
            
            # Export in requested format
            if format == ConfigFormat.JSON:
                return json.dumps(config_copy, indent=2, default=str)
            elif format == ConfigFormat.YAML:
                return yaml.dump(config_copy, default_flow_style=False)
            else:
                raise ValueError(f"Unsupported format: {format}")
                
        except Exception as e:
            logger.error(f"Failed to export configuration: {e}")
            raise
    
    def import_configuration(
        self,
        config_data: str,
        format: ConfigFormat = ConfigFormat.JSON,
        merge: bool = True
    ):
        """Import configuration from string"""
        
        try:
            # Parse configuration
            if format == ConfigFormat.JSON:
                imported_config = json.loads(config_data)
            elif format == ConfigFormat.YAML:
                imported_config = yaml.safe_load(config_data)
            else:
                raise ValueError(f"Unsupported format: {format}")
            
            # Validate imported configuration
            self._validate_imported_config(imported_config)
            
            # Merge or replace configuration
            if merge:
                self._merge_config(self._config_cache, imported_config)
            else:
                self._config_cache = imported_config
            
            # Save configuration
            self.save_configuration()
            
            logger.info(f"Configuration imported successfully (merge={merge})")
            
        except Exception as e:
            logger.error(f"Failed to import configuration: {e}")
            raise
    
    def _merge_config(self, base: Dict[str, Any], update: Dict[str, Any]):
        """Recursively merge configuration dictionaries"""
        
        for key, value in update.items():
            if key in base and isinstance(base[key], dict) and isinstance(value, dict):
                self._merge_config(base[key], value)
            else:
                base[key] = value
    
    def _validate_config(self, key: str, value: Any):
        """Validate configuration value"""
        
        # Add validation logic here
        # For now, we'll do basic type checking
        
        if key == "load_balancer.strategy":
            valid_strategies = ["round_robin", "weighted", "least_connections", "least_response_time", "random", "health_based"]
            if value not in valid_strategies:
                raise ValueError(f"Invalid load balancer strategy: {value}")
        
        elif key.endswith(".threshold"):
            if not isinstance(value, (int, float)) or not (0 <= value <= 1):
                raise ValueError(f"Threshold must be a number between 0 and 1: {value}")
        
        elif key.endswith(".interval") or key.endswith(".cooldown"):
            if not isinstance(value, int) or value <= 0:
                raise ValueError(f"Interval/cooldown must be a positive integer: {value}")
    
    def _validate_imported_config(self, config: Dict[str, Any]):
        """Validate imported configuration structure"""
        
        required_sections = ["global", "providers", "load_balancer", "auto_scaling", "monitoring"]
        
        for section in required_sections:
            if section not in config:
                logger.warning(f"Missing configuration section: {section}")
    
    def _remove_secrets(self, config: Dict[str, Any]) -> Dict[str, Any]:
        """Remove sensitive information from configuration"""
        
        # Create a copy
        config_copy = config.copy()
        
        # Remove API keys and other sensitive data
        if "providers" in config_copy:
            for provider_name, provider_config in config_copy["providers"].items():
                if "authentication" in provider_config:
                    auth_config = provider_config["authentication"].copy()
                    for key in auth_config.keys():
                        if any(secret_word in key.lower() for secret_word in ["key", "token", "password", "secret"]):
                            auth_config[key] = "***REDACTED***"
                    provider_config["authentication"] = auth_config
        
        # Remove other sensitive fields
        sensitive_keys = ["api_key", "password", "secret", "token"]
        
        def _remove_from_dict(d):
            if isinstance(d, dict):
                for key in list(d.keys()):
                    if any(sensitive_word in key.lower() for sensitive_word in sensitive_keys):
                        d[key] = "***REDACTED***"
                    else:
                        _remove_from_dict(d[key])
            elif isinstance(d, list):
                for item in d:
                    _remove_from_dict(item)
        
        _remove_from_dict(config_copy)
        
        return config_copy
    
    def get_environment_variables(self) -> Dict[str, str]:
        """Get configuration as environment variables"""
        
        env_vars = {}
        
        def _flatten_dict(d, prefix=""):
            for key, value in d.items():
                env_key = f"{prefix}{key.upper()}" if prefix else key.upper()
                
                if isinstance(value, dict):
                    _flatten_dict(value, f"{env_key}_")
                elif isinstance(value, bool):
                    env_vars[env_key] = str(value).lower()
                elif isinstance(value, (int, float, str)):
                    env_vars[env_key] = str(value)
                else:
                    env_vars[env_key] = json.dumps(value)
        
        _flatten_dict(self._config_cache, "INSTANCE_MANAGER_")
        
        return env_vars
    
    def load_from_environment(self, prefix: str = "INSTANCE_MANAGER_"):
        """Load configuration from environment variables"""
        
        for key, value in os.environ.items():
            if key.startswith(prefix):
                # Remove prefix and convert to config key
                config_key = key[len(prefix):].lower().replace('_', '.')
                
                # Parse value
                try:
                    # Try JSON first
                    parsed_value = json.loads(value)
                except json.JSONDecodeError:
                    # Try boolean
                    if value.lower() in ['true', 'false']:
                        parsed_value = value.lower() == 'true'
                    # Try integer
                    elif value.isdigit():
                        parsed_value = int(value)
                    # Try float
                    elif '.' in value and value.replace('.', '').isdigit():
                        parsed_value = float(value)
                    else:
                        parsed_value = value
                
                # Set configuration
                self.set_config(config_key, parsed_value)
        
        logger.info("Configuration loaded from environment variables")
    
    def get_config_summary(self) -> Dict[str, Any]:
        """Get configuration summary for monitoring"""
        
        return {
            "total_providers": len(self._config_cache.get("providers", {})),
            "enabled_providers": len([
                p for p in self._config_cache.get("providers", {}).values()
                if p.get("enabled", False)
            ]),
            "load_balancer_strategy": self.get_config("load_balancer.strategy"),
            "auto_scaling_enabled": self.get_config("auto_scaling.enabled"),
            "monitoring_enabled": self.get_config("monitoring.enabled"),
            "configuration_version": self.get_config("global.instance_manager.version", "1.0.0"),
            "last_updated": datetime.utcnow().isoformat()
        }