"""
Interactive Controls for CLI Dashboard
Provides keyboard controls and interactive actions for instance management
"""
import asyncio
import sys
from typing import Dict, List, Optional, Callable, Any
from datetime import datetime
from enum import Enum

try:
    import readchar
    READCHAR_AVAILABLE = True
except ImportError:
    READCHAR_AVAILABLE = False

from core.config import DashboardConfig
from core.api_client import ISHChatAPIClient
from utils.logger import get_logger

logger = get_logger(__name__)

class ControlAction(Enum):
    """Available control actions"""
    REFRESH = "refresh"
    INSTANCE_DETAILS = "instance_details"
    TRIGGER_HEALTH_CHECK = "trigger_health_check"
    START_HEALTH_MONITORING = "start_health_monitoring"
    STOP_HEALTH_MONITORING = "stop_health_monitoring"
    START_AUTO_SCALING = "start_auto_scaling"
    STOP_AUTO_SCALING = "stop_auto_scaling"
    CLEAR_ALERTS = "clear_alerts"
    SHOW_HELP = "show_help"
    CHANGE_REFRESH_RATE = "change_refresh_rate"
    TOGGLE_DEBUG = "toggle_debug"
    EXIT = "exit"

class DashboardControls:
    """Interactive controls for the CLI dashboard"""

    def __init__(self, config: DashboardConfig, api_client: ISHChatAPIClient):
        self.config = config
        self.api_client = api_client
        self.selected_instance_index = 0
        self.show_help = False
        self.message_queue = asyncio.Queue()
        self.running = True

        # Key bindings
        self.key_bindings = {
            'q': ControlAction.EXIT,
            'Q': ControlAction.EXIT,
            '\x03': ControlAction.EXIT,  # Ctrl+C
            'r': ControlAction.REFRESH,
            'R': ControlAction.REFRESH,
            'h': ControlAction.SHOW_HELP,
            'H': ControlAction.SHOW_HELP,
            '?': ControlAction.SHOW_HELP,
            'd': ControlAction.INSTANCE_DETAILS,
            'D': ControlAction.INSTANCE_DETAILS,
            't': ControlAction.TRIGGER_HEALTH_CHECK,
            'T': ControlAction.TRIGGER_HEALTH_CHECK,
            's': ControlAction.START_HEALTH_MONITORING,
            'S': ControlAction.START_HEALTH_MONITORING,
            'x': ControlAction.STOP_HEALTH_MONITORING,
            'X': ControlAction.STOP_HEALTH_MONITORING,
            'a': ControlAction.START_AUTO_SCALING,
            'A': ControlAction.START_AUTO_SCALING,
            'z': ControlAction.STOP_AUTO_SCALING,
            'Z': ControlAction.STOP_AUTO_SCALING,
            'c': ControlAction.CLEAR_ALERTS,
            'C': ControlAction.CLEAR_ALERTS,
            '+': ControlAction.CHANGE_REFRESH_RATE,
            '-': ControlAction.CHANGE_REFRESH_RATE,
            'g': ControlAction.TOGGLE_DEBUG,
            'G': ControlAction.TOGGLE_DEBUG,
            '\x1b[A': ControlAction.REFRESH,  # Up arrow
            '\x1b[B': ControlAction.REFRESH,  # Down arrow
            '\x1b[C': 'next_instance',        # Right arrow
            '\x1b[D': 'prev_instance',        # Left arrow
            'j': 'next_instance',
            'J': 'next_instance',
            'k': 'prev_instance',
            'K': 'prev_instance',
            '1': 'select_provider_zai',
            '2': 'select_provider_openai',
            '3': 'select_provider_anthropic',
            '4': 'select_provider_perplexity',
        }

        # Help text
        self.help_text = """
🎮 Dashboard Controls

Navigation:
  ↑/↓ or j/k     - Navigate instances
  ←/→ or h/l     - Select previous/next instance
  1-4           - Select provider (ZAI, OpenAI, Anthropic, Perplexity)

Instance Actions:
  d/D           - Show instance details
  t/T           - Trigger health check for selected instance

System Controls:
  r/R           - Force refresh
  s/S           - Start health monitoring
  x/X           - Stop health monitoring
  a/A           - Start auto-scaling
  z/Z           - Stop auto-scaling
  c/C           - Clear all alerts

Display Options:
  +/-           - Increase/decrease refresh rate
  g/G           - Toggle debug mode
  h/H/?         - Show/hide this help

Exit:
  q/Q or Ctrl+C - Exit dashboard

        """

    async def start_input_monitor(self):
        """Start monitoring keyboard input"""
        if not READCHAR_AVAILABLE:
            logger.warning("readchar not available, interactive controls disabled")
            return

        logger.debug("Starting input monitor")

        while self.running:
            try:
                # Non-blocking read
                key = await asyncio.get_event_loop().run_in_executor(
                    None, self._read_key_non_blocking
                )

                if key:
                    await self._handle_key_input(key)

            except Exception as e:
                logger.error(f"Input monitor error: {e}")
                await asyncio.sleep(0.1)

            await asyncio.sleep(0.05)  # Small delay to prevent CPU spinning

    def _read_key_non_blocking(self) -> Optional[str]:
        """Read key without blocking"""
        try:
            import select
            import termios
            import tty

            # Check if there's data available
            if select.select([sys.stdin], [], [], 0) == ([sys.stdin], [], []):
                return sys.stdin.read(1)
        except:
            pass

        return None

    async def _handle_key_input(self, key: str):
        """Handle keyboard input"""
        try:
            # Handle escape sequences for arrow keys
            if key == '\x1b':
                # Read next two characters for escape sequence
                await asyncio.sleep(0.01)  # Small delay
                try:
                    next_key = await asyncio.get_event_loop().run_in_executor(
                        None, self._read_key_non_blocking
                    )
                    if next_key == '[':
                        await asyncio.sleep(0.01)
                        final_key = await asyncio.get_event_loop().run_in_executor(
                            None, self._read_key_non_blocking
                        )
                        if final_key:
                            key = f'\x1b[{final_key}'
                except:
                    pass

            # Get action for key
            action = self.key_bindings.get(key)

            if action == ControlAction.EXIT:
                await self.message_queue.put(('exit', None))
                self.running = False

            elif action == ControlAction.REFRESH:
                await self.message_queue.put(('refresh', None))

            elif action == ControlAction.SHOW_HELP:
                self.show_help = not self.show_help
                await self.message_queue.put(('toggle_help', self.show_help))

            elif action == ControlAction.INSTANCE_DETAILS:
                await self.message_queue.put(('instance_details', self.selected_instance_index))

            elif action == ControlAction.TRIGGER_HEALTH_CHECK:
                await self.message_queue.put(('trigger_health_check', self.selected_instance_index))

            elif action == ControlAction.START_HEALTH_MONITORING:
                await self.message_queue.put(('start_health_monitoring', None))

            elif action == ControlAction.STOP_HEALTH_MONITORING:
                await self.message_queue.put(('stop_health_monitoring', None))

            elif action == ControlAction.START_AUTO_SCALING:
                await self.message_queue.put(('start_auto_scaling', None))

            elif action == ControlAction.STOP_AUTO_SCALING:
                await self.message_queue.put(('stop_auto_scaling', None))

            elif action == ControlAction.CLEAR_ALERTS:
                await self.message_queue.put(('clear_alerts', None))

            elif action == ControlAction.CHANGE_REFRESH_RATE:
                if key == '+':
                    new_rate = max(0.5, self.config.refresh_rate - 0.5)
                else:
                    new_rate = min(10.0, self.config.refresh_rate + 0.5)
                await self.message_queue.put(('change_refresh_rate', new_rate))

            elif action == ControlAction.TOGGLE_DEBUG:
                self.config.debug = not self.config.debug
                await self.message_queue.put(('toggle_debug', self.config.debug))

            elif action == 'next_instance':
                await self.message_queue.put(('next_instance', None))

            elif action == 'prev_instance':
                await self.message_queue.put(('prev_instance', None))

            elif action and action.startswith('select_provider_'):
                provider = action.replace('select_provider_', '')
                await self.message_queue.put(('select_provider', provider))

        except Exception as e:
            logger.error(f"Error handling key input '{key}': {e}")

    async def get_action(self) -> Optional[tuple]:
        """Get next action from message queue"""
        try:
            return await asyncio.wait_for(self.message_queue.get(), timeout=0.1)
        except asyncio.TimeoutError:
            return None

    async def execute_action(self, action: tuple, data_manager):
        """Execute a control action"""
        if not action:
            return

        action_type, action_data = action

        try:
            if action_type == 'exit':
                return False  # Signal to exit

            elif action_type == 'refresh':
                logger.debug("Manual refresh triggered")
                # Data refresh is handled by main loop

            elif action_type == 'toggle_help':
                logger.debug(f"Toggling help display: {action_data}")

            elif action_type == 'instance_details':
                await self._show_instance_details(action_data, data_manager)

            elif action_type == 'trigger_health_check':
                await self._trigger_health_check(action_data, data_manager)

            elif action_type == 'start_health_monitoring':
                await self._start_health_monitoring()

            elif action_type == 'stop_health_monitoring':
                await self._stop_health_monitoring()

            elif action_type == 'start_auto_scaling':
                await self._start_auto_scaling()

            elif action_type == 'stop_auto_scaling':
                await self._stop_auto_scaling()

            elif action_type == 'clear_alerts':
                data_manager.clear_alerts()
                logger.info("Cleared all alerts")

            elif action_type == 'change_refresh_rate':
                self.config.refresh_rate = action_data
                logger.info(f"Changed refresh rate to {action_data}s")

            elif action_type == 'toggle_debug':
                logger.info(f"Debug mode: {self.config.debug}")

            elif action_type == 'next_instance':
                instances = data_manager.get_data().instances
                if instances:
                    self.selected_instance_index = (self.selected_instance_index + 1) % len(instances)
                    logger.debug(f"Selected instance {self.selected_instance_index}: {instances[self.selected_instance_index].instance_name}")

            elif action_type == 'prev_instance':
                instances = data_manager.get_data().instances
                if instances:
                    self.selected_instance_index = (self.selected_instance_index - 1) % len(instances)
                    logger.debug(f"Selected instance {self.selected_instance_index}: {instances[self.selected_instance_index].instance_name}")

            elif action_type == 'select_provider':
                # Find first instance of selected provider
                instances = data_manager.get_data().instances
                for i, instance in enumerate(instances):
                    if instance.provider_type == action_data:
                        self.selected_instance_index = i
                        logger.debug(f"Selected {action_data} instance: {instance.instance_name}")
                        break

            return True  # Continue running

        except Exception as e:
            logger.error(f"Error executing action {action_type}: {e}")
            return True

    async def _show_instance_details(self, instance_index: int, data_manager):
        """Show detailed information about selected instance"""
        try:
            instances = data_manager.get_data().instances
            if not instances or instance_index >= len(instances):
                return

            instance = instances[instance_index]

            # Get detailed metrics
            metrics, _ = await self.api_client.get_instance_metrics(
                instance.instance_id,
                self.config.metrics_window_seconds
            )

            # Log instance details
            logger.info("=" * 60)
            logger.info(f"INSTANCE DETAILS: {instance.instance_name}")
            logger.info("=" * 60)
            logger.info(f"ID: {instance.instance_id}")
            logger.info(f"Provider: {instance.provider_type}")
            logger.info(f"Model: {instance.model_name}")
            logger.info(f"Status: {instance.status}")
            logger.info(f"Healthy: {instance.is_healthy}")
            logger.info(f"Active: {instance.is_active}")
            logger.info(f"")
            logger.info(f"Performance:")
            logger.info(f"  Total Requests: {instance.total_requests}")
            logger.info(f"  Successful: {instance.successful_requests}")
            logger.info(f"  Failed: {instance.failed_requests}")
            logger.info(f"  Success Rate: {instance.success_rate:.1f}%")
            logger.info(f"  Avg Response Time: {instance.average_response_time:.2f}s")
            logger.info(f"")
            logger.info(f"Current Load:")
            logger.info(f"  Current: {instance.current_load}")
            logger.info(f"  Max: {instance.max_concurrent_requests}")
            logger.info(f"  Utilization: {(instance.current_load / instance.max_concurrent_requests * 100):.1f}%")
            logger.info(f"")
            logger.info(f"Configuration:")
            logger.info(f"  Temperature: {instance.temperature}")
            logger.info(f"  Max Tokens: {instance.max_tokens}")
            logger.info(f"  Timeout: {instance.timeout}s")
            logger.info(f"  Priority: {instance.priority}")

            if metrics:
                logger.info(f"")
                logger.info(f"Recent Metrics ({metrics.time_window_seconds}s window):")
                logger.info(f"  Requests: {metrics.total_requests}")
                logger.info(f"  Success Rate: {metrics.success_rate:.1f}%")
                logger.info(f"  Avg Response: {metrics.average_response_time_ms:.1f}ms")

            logger.info("=" * 60)

        except Exception as e:
            logger.error(f"Failed to show instance details: {e}")

    async def _trigger_health_check(self, instance_index: int, data_manager):
        """Trigger health check for selected instance"""
        try:
            instances = data_manager.get_data().instances
            if not instances or instance_index >= len(instances):
                return

            instance = instances[instance_index]
            logger.info(f"Triggering health check for {instance.instance_name}...")

            health_info, error = await self.api_client.trigger_health_check(instance.instance_id)

            if error:
                logger.error(f"Health check failed: {error}")
            else:
                logger.info(f"Health check completed for {instance.instance_name}")
                logger.info(f"Status: {health_info.status}")
                logger.info(f"Score: {health_info.score:.1f}")
                if health_info.response_time:
                    logger.info(f"Response Time: {health_info.response_time:.2f}s")
                if health_info.issues:
                    logger.warning(f"Issues: {', '.join(health_info.issues)}")

        except Exception as e:
            logger.error(f"Failed to trigger health check: {e}")

    async def _start_health_monitoring(self):
        """Start health monitoring"""
        try:
            success, error = await self.api_client.start_health_monitoring()
            if error:
                logger.error(f"Failed to start health monitoring: {error}")
            else:
                logger.info("Health monitoring started")

        except Exception as e:
            logger.error(f"Failed to start health monitoring: {e}")

    async def _stop_health_monitoring(self):
        """Stop health monitoring"""
        try:
            success, error = await self.api_client.stop_health_monitoring()
            if error:
                logger.error(f"Failed to stop health monitoring: {error}")
            else:
                logger.info("Health monitoring stopped")

        except Exception as e:
            logger.error(f"Failed to stop health monitoring: {e}")

    async def _start_auto_scaling(self):
        """Start auto-scaling"""
        try:
            success, error = await self.api_client.start_auto_scaling()
            if error:
                logger.error(f"Failed to start auto-scaling: {error}")
            else:
                logger.info("Auto-scaling started")

        except Exception as e:
            logger.error(f"Failed to start auto-scaling: {e}")

    async def _stop_auto_scaling(self):
        """Stop auto-scaling"""
        try:
            success, error = await self.api_client.stop_auto_scaling()
            if error:
                logger.error(f"Failed to stop auto-scaling: {error}")
            else:
                logger.info("Auto-scaling stopped")

        except Exception as e:
            logger.error(f"Failed to stop auto-scaling: {e}")

    def get_help_text(self) -> str:
        """Get help text for controls"""
        return self.help_text

    def get_selected_instance_index(self) -> int:
        """Get currently selected instance index"""
        return self.selected_instance_index

    def is_help_visible(self) -> bool:
        """Check if help is currently visible"""
        return self.show_help

    def stop(self):
        """Stop the controls"""
        self.running = False