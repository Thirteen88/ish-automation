"""
ISH Chat CLI Status Dashboard

A comprehensive real-time terminal dashboard for monitoring the multi-instance ISH Chat AI system.
"""

__version__ = "1.0.0"
__author__ = "ISH Chat Team"
__description__ = "Real-time CLI dashboard for ISH Chat multi-instance AI system"

from .main import main
from .core.config import DashboardConfig
from .core.dashboard import ISHChatDashboard

__all__ = [
    'main',
    'DashboardConfig',
    'ISHChatDashboard',
    '__version__',
    '__author__',
    '__description__'
]