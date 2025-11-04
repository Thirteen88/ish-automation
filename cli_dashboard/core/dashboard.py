"""
Main CLI Dashboard Application
"""
import asyncio
import sys
import time
import signal
from datetime import datetime, timedelta
from typing import Dict, List, Optional, Any
from collections import deque
import os

try:
    from rich.console import Console
    from rich.layout import Layout
    from rich.panel import Panel
    from rich.table import Table
    from rich.progress import Progress, BarColumn, TextColumn
    from rich.live import Live
    from rich.text import Text
    from rich.align import Align
    from rich.columns import Columns
    from rich.rule import Rule
    from rich.spinner import Spinner
    RICH_AVAILABLE = True
except ImportError:
    RICH_AVAILABLE = False
    print("Warning: 'rich' library not found. Install with: pip install rich")
    print("Falling back to basic terminal output...")

from .config import DashboardConfig
from .api_client import ISHChatAPIClient, InstanceInfo, HealthInfo, SystemStatus, MetricsInfo
from .data_manager import DashboardDataManager
from .ui_components import DashboardUI, BasicDashboardUI
from utils.logger import get_logger

logger = get_logger(__name__)

class ISHChatDashboard:
    """Main CLI Dashboard for ISH Chat system monitoring"""

    def __init__(self, config: DashboardConfig):
        self.config = config
        self.running = False
        self.last_update = datetime.utcnow()

        # Initialize components
        self.api_client = ISHChatAPIClient(config)
        self.data_manager = DashboardDataManager(config)

        # UI components
        if RICH_AVAILABLE and config.color_enabled:
            self.ui = DashboardUI(config)
        else:
            self.ui = BasicDashboardUI(config)

        # Live display (for rich)
        self.live: Optional[Live] = None

        # Performance metrics
        self.update_times = deque(maxlen=config.max_history_points)
        self.error_count = 0
        self.success_count = 0

    async def start(self):
        """Start the dashboard"""
        logger.info("Starting ISH Chat Dashboard")

        # Test API connection
        logger.info("Testing API connection...")
        connected = await self.api_client.test_connection()
        if not connected:
            if not self.config.simulate_data:
                logger.error(f"Failed to connect to API at {self.config.api_base_url}")
                logger.error("Please ensure the ISH Chat backend is running")
                if not self.config.debug:
                    logger.error("Run with --debug for more information")
                    return
                logger.warning("Continuing with simulated data...")
                self.config.simulate_data = True
        else:
            logger.info("API connection successful")

        # Start API client
        await self.api_client.start()

        # Initialize UI
        self.ui.initialize()

        # Start live display if using rich
        if RICH_AVAILABLE and self.config.color_enabled:
            # Generate initial layout
            initial_layout = self.ui.generate_layout(
                self.data_manager.get_data(),
                self.last_update,
                self._get_performance_stats()
            )
            self.live = Live(
                initial_layout,
                refresh_per_second=1.0 / self.config.refresh_rate,
                screen=False
            )
            self.live.start()

        self.running = True
        logger.info("Dashboard started successfully")

        # Main update loop
        try:
            await self._update_loop()
        except KeyboardInterrupt:
            logger.info("Received keyboard interrupt")
        except Exception as e:
            logger.error(f"Dashboard error: {e}")
            if self.config.debug:
                import traceback
                traceback.print_exc()
        finally:
            await self.stop()

    async def stop(self):
        """Stop the dashboard"""
        logger.info("Stopping dashboard...")
        self.running = False

        # Stop live display
        if self.live:
            self.live.stop()
            self.live = None

        # Stop API client
        await self.api_client.stop()

        # Cleanup UI
        self.ui.cleanup()

        logger.info("Dashboard stopped")

    def cleanup(self):
        """Cleanup resources"""
        if self.live:
            self.live.stop()

    async def _update_loop(self):
        """Main update loop"""
        logger.debug("Starting update loop")

        while self.running:
            try:
                start_time = time.time()

                # Update data
                await self._update_data()

                # Update UI
                self._update_ui()

                # Update performance metrics
                update_time = time.time() - start_time
                self.update_times.append(update_time)
                self.success_count += 1

                # Log performance if debug mode
                if self.config.debug and self.success_count % 10 == 0:
                    avg_update_time = sum(self.update_times) / len(self.update_times) if self.update_times else 0
                    logger.debug(f"Update performance: avg={avg_update_time:.3f}s, errors={self.error_count}")

                # Wait for next update
                await asyncio.sleep(self.config.refresh_rate)

            except asyncio.CancelledError:
                break
            except Exception as e:
                self.error_count += 1
                logger.error(f"Update loop error: {e}")
                if self.config.debug:
                    import traceback
                    traceback.print_exc()

                # Wait longer on error
                await asyncio.sleep(min(self.config.refresh_rate * 2, 10))

    async def _update_data(self):
        """Update dashboard data"""
        try:
            # Update system status
            if self.config.enable_instance_monitoring:
                await self._update_instances_data()

            # Update health data
            if self.config.enable_health_monitoring:
                await self._update_health_data()

            # Update load balancer metrics
            if self.config.enable_load_balancer_metrics:
                await self._update_load_balancer_data()

            # Update auto-scaling metrics
            if self.config.enable_auto_scaling_metrics:
                await self._update_auto_scaling_data()

            # Update external agents if enabled
            if self.config.enable_external_agents:
                await self._update_external_agents_data()

            # Update last update time
            self.last_update = datetime.utcnow()

        except Exception as e:
            logger.error(f"Data update error: {e}")
            if self.config.debug:
                import traceback
                traceback.print_exc()

    async def _update_instances_data(self):
        """Update instances data"""
        try:
            if self.config.simulate_data:
                # Generate simulated data
                instances = self._generate_simulated_instances()
                self.data_manager.update_instances(instances)
            else:
                # Get real data from API
                instances, error = await self.api_client.get_instances()
                if error:
                    logger.warning(f"Failed to get instances: {error}")
                else:
                    self.data_manager.update_instances(instances)

                    # Get detailed metrics for each instance
                    if not self.config.simulate_data:
                        for instance in instances[:5]:  # Limit to avoid API spam
                            try:
                                metrics, _ = await self.api_client.get_instance_metrics(
                                    instance.instance_id,
                                    self.config.metrics_window_seconds
                                )
                                if metrics:
                                    self.data_manager.update_instance_metrics(metrics)
                            except Exception as e:
                                logger.debug(f"Failed to get metrics for {instance.instance_id}: {e}")

        except Exception as e:
            logger.error(f"Instances data update error: {e}")

    async def _update_health_data(self):
        """Update health data"""
        try:
            if self.config.simulate_data:
                # Generate simulated health data
                health_summary = self._generate_simulated_health_summary()
                self.data_manager.update_health_summary(health_summary)
            else:
                # Get real health summary
                health_summary, error = await self.api_client.get_health_summary()
                if error:
                    logger.warning(f"Failed to get health summary: {error}")
                else:
                    self.data_manager.update_health_summary(health_summary)

        except Exception as e:
            logger.error(f"Health data update error: {e}")

    async def _update_load_balancer_data(self):
        """Update load balancer data"""
        try:
            if self.config.simulate_data:
                # Generate simulated load balancer data
                lb_metrics = self._generate_simulated_lb_metrics()
                self.data_manager.update_load_balancer_metrics(lb_metrics)
            else:
                # Get real load balancer metrics
                lb_metrics, error = await self.api_client.get_load_balancer_metrics()
                if error:
                    logger.warning(f"Failed to get load balancer metrics: {error}")
                else:
                    self.data_manager.update_load_balancer_metrics(lb_metrics)

        except Exception as e:
            logger.error(f"Load balancer data update error: {e}")

    async def _update_auto_scaling_data(self):
        """Update auto-scaling data"""
        try:
            if self.config.simulate_data:
                # Generate simulated auto-scaling data
                as_metrics = self._generate_simulated_as_metrics()
                self.data_manager.update_auto_scaling_metrics(as_metrics)
            else:
                # Get real auto-scaling metrics
                as_metrics, error = await self.api_client.get_auto_scaling_metrics()
                if error:
                    logger.warning(f"Failed to get auto-scaling metrics: {error}")
                else:
                    self.data_manager.update_auto_scaling_metrics(as_metrics)

        except Exception as e:
            logger.error(f"Auto-scaling data update error: {e}")

    async def _update_external_agents_data(self):
        """Update external agents data"""
        try:
            if self.config.simulate_data:
                # Generate simulated external agents data
                external_agents = self._generate_simulated_external_agents()
                self.data_manager.update_external_agents(external_agents)
            else:
                # Try to get external agents from status monitor
                try:
                    # Import status monitor if available
                    sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', '..', 'src'))
                    from services.status_monitor import status_monitor

                    status_data = await status_monitor.generate_status_display()
                    if status_data:
                        self.data_manager.update_external_agents(status_data.get('models', {}))
                except Exception as e:
                    logger.debug(f"Failed to get external agents data: {e}")

        except Exception as e:
            logger.error(f"External agents data update error: {e}")

    def _update_ui(self):
        """Update UI display"""
        try:
            # Generate new layout
            layout = self.ui.generate_layout(
                self.data_manager.get_data(),
                self.last_update,
                self._get_performance_stats()
            )

            # Update live display
            if self.live:
                self.live.update(layout)
            else:
                # For basic UI, print directly
                self.ui.print_display(layout)

        except Exception as e:
            logger.error(f"UI update error: {e}")
            if self.config.debug:
                import traceback
                traceback.print_exc()

    def _get_performance_stats(self) -> Dict[str, Any]:
        """Get dashboard performance statistics"""
        avg_update_time = sum(self.update_times) / len(self.update_times) if self.update_times else 0
        total_updates = self.success_count + self.error_count

        return {
            'avg_update_time': avg_update_time,
            'total_updates': total_updates,
            'success_count': self.success_count,
            'error_count': self.error_count,
            'success_rate': (self.success_count / total_updates * 100) if total_updates > 0 else 0,
            'uptime': datetime.utcnow() - (self.last_update - timedelta(seconds=len(self.update_times) * self.config.refresh_rate))
        }

    # Simulation methods for testing without real backend
    def _generate_simulated_instances(self) -> List[InstanceInfo]:
        """Generate simulated instance data"""
        import random

        providers = ['zai', 'openai', 'anthropic', 'perplexity']
        models = {
            'zai': ['ish-chat-v1', 'ish-chat-v2'],
            'openai': ['gpt-4', 'gpt-3.5-turbo'],
            'anthropic': ['claude-3-opus', 'claude-3-sonnet'],
            'perplexity': ['pplx-7b', 'pplx-13b']
        }

        instances = []
        for i, provider in enumerate(providers):
            for j, model in enumerate(models[provider]):
                instance_id = f"{provider}-{model}-{j}"

                # Simulate varying performance
                success_rate = 85 + random.random() * 14
                response_time = 0.5 + random.random() * 2.0
                current_load = random.randint(0, 8)

                instance = InstanceInfo(
                    instance_id=instance_id,
                    provider_type=provider,
                    model_name=model,
                    instance_name=f"{provider.title()} {model.title()} #{j+1}",
                    status='healthy' if success_rate > 90 else 'unhealthy',
                    is_active=random.random() > 0.1,
                    is_healthy=success_rate > 85,
                    total_requests=random.randint(100, 1000),
                    successful_requests=int(random.randint(100, 1000) * success_rate / 100),
                    failed_requests=int(random.randint(100, 1000) * (100 - success_rate) / 100),
                    average_response_time=response_time,
                    success_rate=success_rate,
                    current_load=current_load,
                    max_concurrent_requests=10,
                    last_health_check=datetime.utcnow() - timedelta(minutes=random.randint(1, 10)),
                    created_at=datetime.utcnow() - timedelta(days=random.randint(1, 30)),
                    updated_at=datetime.utcnow() - timedelta(minutes=random.randint(1, 30)),
                    tags={'environment': 'production', 'region': 'us-west-2'},
                    metadata={'version': '1.0.0', 'instance_type': 'standard'},
                    priority=random.randint(1, 5)
                )
                instances.append(instance)

        return instances

    def _generate_simulated_health_summary(self) -> Dict[str, Any]:
        """Generate simulated health summary"""
        import random

        return {
            'total_instances': 8,
            'healthy_instances': 6,
            'unhealthy_instances': 2,
            'average_health_score': 87.5,
            'last_check': datetime.utcnow().isoformat(),
            'issues': [
                'High response time on openai-gpt-4-0',
                'Failed health check on perplexity-pplx-7b-0'
            ]
        }

    def _generate_simulated_lb_metrics(self) -> Dict[str, Any]:
        """Generate simulated load balancer metrics"""
        import random

        return {
            'total_requests': random.randint(1000, 5000),
            'successful_requests': random.randint(900, 4800),
            'failed_requests': random.randint(10, 200),
            'average_response_time': random.uniform(0.5, 2.0),
            'load_distribution': {
                'zai': random.randint(100, 500),
                'openai': random.randint(200, 800),
                'anthropic': random.randint(150, 600),
                'perplexity': random.randint(50, 300)
            }
        }

    def _generate_simulated_as_metrics(self) -> Dict[str, Any]:
        """Generate simulated auto-scaling metrics"""
        import random

        return {
            'active_groups': 4,
            'scaling_events_today': random.randint(0, 10),
            'last_scaling_event': (datetime.utcnow() - timedelta(hours=random.randint(1, 24))).isoformat(),
            'group_status': {
                'zai-group': {'current_instances': 2, 'desired_instances': 2},
                'openai-group': {'current_instances': 3, 'desired_instances': 3},
                'anthropic-group': {'current_instances': 2, 'desired_instances': 2},
                'perplexity-group': {'current_instances': 1, 'desired_instances': 2}
            }
        }

    def _generate_simulated_external_agents(self) -> Dict[str, Any]:
        """Generate simulated external agents data"""
        import random

        agents = {
            'claude_opus_41': {
                'name': 'Claude Opus 4.1',
                'status': 'idle' if random.random() > 0.3 else 'busy',
                'connection_status': 'connected',
                'success_rate': random.uniform(85, 95),
                'response_time': random.uniform(1.0, 3.0)
            },
            'gpt_5': {
                'name': 'GPT-5',
                'status': 'idle' if random.random() > 0.4 else 'busy',
                'connection_status': 'connected',
                'success_rate': random.uniform(80, 90),
                'response_time': random.uniform(1.5, 2.5)
            }
        }

        return {
            'total': len(agents),
            'active': sum(1 for a in agents.values() if a['status'] == 'idle'),
            'busy': sum(1 for a in agents.values() if a['status'] == 'busy'),
            'offline': sum(1 for a in agents.values() if a['connection_status'] != 'connected'),
            'details': agents
        }