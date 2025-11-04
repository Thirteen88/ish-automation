"""
Configuration management for CLI Dashboard
"""
import os
import json
from dataclasses import dataclass, field, asdict
from typing import Dict, List, Optional, Any
from pathlib import Path

@dataclass
class DashboardConfig:
    """Configuration for the CLI Dashboard"""

    # API Configuration
    api_base_url: str = "http://localhost:8000"
    api_timeout: int = 10
    api_retries: int = 3

    # Dashboard Display
    refresh_rate: float = 2.0  # seconds
    max_history_points: int = 100
    terminal_min_width: int = 80
    terminal_min_height: int = 24

    # Data Sources
    enable_instance_monitoring: bool = True
    enable_health_monitoring: bool = True
    enable_load_balancer_metrics: bool = True
    enable_auto_scaling_metrics: bool = True
    enable_external_agents: bool = True

    # Display Options
    show_debug_info: bool = False
    show_performance_graphs: bool = True
    show_alerts: bool = True
    show_system_info: bool = True
    color_enabled: bool = True

    # Alerts and Thresholds
    alert_high_response_time: float = 5.0  # seconds
    alert_low_success_rate: float = 90.0  # percentage
    alert_high_error_rate: float = 10.0  # percentage
    alert_high_load_threshold: float = 80.0  # percentage

    # Historical Data
    history_retention_minutes: int = 60
    metrics_window_seconds: int = 300  # 5 minutes

    # Interactive Controls
    enable_controls: bool = True
    require_confirmation: bool = True

    # Logging
    log_level: str = "INFO"
    log_file: Optional[str] = None

    # Development/Debug
    debug: bool = False
    simulate_data: bool = False

    # Provider-specific settings
    provider_settings: Dict[str, Dict[str, Any]] = field(default_factory=dict)

    # Custom display settings
    custom_columns: List[str] = field(default_factory=list)
    hidden_columns: List[str] = field(default_factory=list)

    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> 'DashboardConfig':
        """Create config from dictionary"""
        return cls(**data)

    @classmethod
    def load_from_file(cls, file_path: str) -> 'DashboardConfig':
        """Load configuration from JSON file"""
        try:
            path = Path(file_path)
            if not path.exists():
                raise FileNotFoundError(f"Config file not found: {file_path}")

            with open(path, 'r') as f:
                data = json.load(f)

            return cls.from_dict(data)
        except Exception as e:
            raise ValueError(f"Failed to load config from {file_path}: {e}")

    def to_dict(self) -> Dict[str, Any]:
        """Convert config to dictionary"""
        return asdict(self)

    def save_to_file(self, file_path: str) -> None:
        """Save configuration to JSON file"""
        path = Path(file_path)
        path.parent.mkdir(parents=True, exist_ok=True)

        with open(path, 'w') as f:
            json.dump(self.to_dict(), f, indent=2)

    def update_from_dict(self, data: Dict[str, Any]) -> None:
        """Update configuration from dictionary"""
        for key, value in data.items():
            if hasattr(self, key):
                setattr(self, key, value)

    def get_provider_config(self, provider: str) -> Dict[str, Any]:
        """Get provider-specific configuration"""
        return self.provider_settings.get(provider, {})

    def set_provider_config(self, provider: str, config: Dict[str, Any]) -> None:
        """Set provider-specific configuration"""
        self.provider_settings[provider] = config

    @classmethod
    def get_default_config_path(cls) -> str:
        """Get default configuration file path"""
        home_dir = Path.home()
        config_dir = home_dir / ".config" / "ish-chat-dashboard"
        return str(config_dir / "config.json")

    def create_default_config_file(self) -> str:
        """Create default configuration file"""
        config_path = self.get_default_config_path()
        self.save_to_file(config_path)
        return config_path

# Default configuration
DEFAULT_CONFIG = DashboardConfig()

# Configuration templates
DEV_CONFIG = DashboardConfig(
    refresh_rate=1.0,
    debug=True,
    simulate_data=True,
    show_debug_info=True,
    log_level="DEBUG"
)

PRODUCTION_CONFIG = DashboardConfig(
    refresh_rate=5.0,
    debug=False,
    simulate_data=False,
    show_debug_info=False,
    log_level="INFO",
    require_confirmation=True
)

MINIMAL_CONFIG = DashboardConfig(
    refresh_rate=10.0,
    show_performance_graphs=False,
    enable_auto_scaling_metrics=False,
    enable_external_agents=False,
    show_system_info=False
)

HIGH_FREQUENCY_CONFIG = DashboardConfig(
    refresh_rate=0.5,
    max_history_points=200,
    metrics_window_seconds=60
)