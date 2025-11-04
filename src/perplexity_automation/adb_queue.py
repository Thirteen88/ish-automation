"""
ADB Command Queue for Perplexity APK Automation

This module handles ADB command execution and device management
for the Perplexity automation system, focusing on virtual device (emulator-5554).
"""

import subprocess
import asyncio
import logging
from typing import List, Optional, Dict, Any
from dataclasses import dataclass
from enum import Enum
import json
import time

# Set up logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)


class DeviceStatus(Enum):
    """Device connection status"""
    CONNECTED = "connected"
    DISCONNECTED = "disconnected"
    BOOTING = "booting"
    ERROR = "error"


class CommandPriority(Enum):
    """Command priority levels"""
    LOW = 1
    NORMAL = 5
    HIGH = 8
    CRITICAL = 10


@dataclass
class ADBCommand:
    """ADB command structure"""
    command: str
    device_id: str
    priority: int = CommandPriority.NORMAL.value
    timeout: int = 30
    retry_count: int = 0
    max_retries: int = 3
    metadata: Dict[str, Any] = None

    def __post_init__(self):
        if self.metadata is None:
            self.metadata = {}


@dataclass
class ADBResult:
    """ADB command execution result"""
    success: bool
    output: str
    error: Optional[str] = None
    exit_code: int = 0
    execution_time: float = 0.0
    command: str = ""
    device_id: str = ""


class ADBCommandQueue:
    """
    ADB Command Queue for managing device interactions

    Handles command queuing, execution, and device health monitoring
    for both physical and virtual Android devices.
    """

    def __init__(self, device_pool: Optional[List[str]] = None):
        """
        Initialize ADB Command Queue

        Args:
            device_pool: List of available device IDs
        """
        self.device_pool = device_pool or ["emulator-5554"]  # Default to virtual device
        self.command_queue = asyncio.Queue()
        self.device_status = {device: DeviceStatus.DISCONNECTED for device in self.device_pool}
        self.running = False
        self.stats = {
            "commands_executed": 0,
            "commands_failed": 0,
            "total_execution_time": 0.0
        }

    async def start(self):
        """Start the command queue processor"""
        self.running = True
        logger.info("Starting ADB Command Queue...")

        # Start device monitoring
        asyncio.create_task(self._monitor_devices())

        # Start command processor
        asyncio.create_task(self._process_commands())

        logger.info("ADB Command Queue started successfully")

    async def stop(self):
        """Stop the command queue processor"""
        self.running = False
        logger.info("ADB Command Queue stopped")

    async def enqueue_command(self, command: ADBCommand) -> bool:
        """
        Add a command to the execution queue

        Args:
            command: ADBCommand to execute

        Returns:
            bool: True if command was queued successfully
        """
        try:
            await self.command_queue.put(command)
            logger.info(f"Command queued: {command.command} for device {command.device_id}")
            return True
        except Exception as e:
            logger.error(f"Failed to queue command: {e}")
            return False

    async def _process_commands(self):
        """Process commands from the queue"""
        while self.running:
            try:
                # Get next command with timeout
                command = await asyncio.wait_for(
                    self.command_queue.get(),
                    timeout=1.0
                )

                # Execute command
                result = await self._execute_command(command)

                # Log result
                if result.success:
                    self.stats["commands_executed"] += 1
                    logger.info(f"Command executed successfully: {command.command}")
                else:
                    self.stats["commands_failed"] += 1
                    logger.error(f"Command failed: {command.command} - {result.error}")

                self.stats["total_execution_time"] += result.execution_time

            except asyncio.TimeoutError:
                # No commands in queue, continue
                continue
            except Exception as e:
                logger.error(f"Error processing command: {e}")

    async def _execute_command(self, command: ADBCommand) -> ADBResult:
        """
        Execute a single ADB command

        Args:
            command: ADBCommand to execute

        Returns:
            ADBResult: Command execution result
        """
        start_time = time.time()

        # Check device status
        if self.device_status.get(command.device_id) != DeviceStatus.CONNECTED:
            return ADBResult(
                success=False,
                output="",
                error=f"Device {command.device_id} not connected",
                command=command.command,
                device_id=command.device_id
            )

        # Build full ADB command
        full_command = f"adb -s {command.device_id} {command.command}"

        try:
            # Execute command
            process = await asyncio.create_subprocess_shell(
                full_command,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE
            )

            # Wait for completion with timeout
            stdout, stderr = await asyncio.wait_for(
                process.communicate(),
                timeout=command.timeout
            )

            execution_time = time.time() - start_time

            # Parse result
            result = ADBResult(
                success=process.returncode == 0,
                output=stdout.decode('utf-8') if stdout else "",
                error=stderr.decode('utf-8') if stderr else None,
                exit_code=process.returncode,
                execution_time=execution_time,
                command=command.command,
                device_id=command.device_id
            )

            return result

        except asyncio.TimeoutError:
            return ADBResult(
                success=False,
                output="",
                error=f"Command timeout after {command.timeout} seconds",
                command=command.command,
                device_id=command.device_id
            )
        except Exception as e:
            execution_time = time.time() - start_time
            return ADBResult(
                success=False,
                output="",
                error=str(e),
                execution_time=execution_time,
                command=command.command,
                device_id=command.device_id
            )

    async def _monitor_devices(self):
        """Monitor device connection status"""
        while self.running:
            try:
                for device_id in self.device_pool:
                    await self._check_device_status(device_id)

                # Wait before next check
                await asyncio.sleep(5)

            except Exception as e:
                logger.error(f"Error monitoring devices: {e}")

    async def _check_device_status(self, device_id: str):
        """
        Check connection status of a specific device

        Args:
            device_id: Device ID to check
        """
        try:
            # Direct device check without going through command queue
            # This prevents circular dependency during startup
            start_time = time.time()
            full_command = f"adb -s {device_id} shell echo 'device_check'"

            process = await asyncio.create_subprocess_shell(
                full_command,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE
            )

            try:
                stdout, stderr = await asyncio.wait_for(
                    process.communicate(),
                    timeout=10
                )

                execution_time = time.time() - start_time

                if process.returncode == 0:
                    if self.device_status[device_id] != DeviceStatus.CONNECTED:
                        self.device_status[device_id] = DeviceStatus.CONNECTED
                        logger.info(f"Device {device_id} connected")
                else:
                    self.device_status[device_id] = DeviceStatus.DISCONNECTED
                    logger.warning(f"Device {device_id} disconnected")

            except asyncio.TimeoutError:
                process.kill()
                await process.wait()
                self.device_status[device_id] = DeviceStatus.DISCONNECTED
                logger.warning(f"Device {device_id} health check timeout")

        except Exception as e:
            logger.error(f"Error checking device {device_id}: {e}")
            self.device_status[device_id] = DeviceStatus.ERROR

    def get_device_status(self, device_id: str) -> DeviceStatus:
        """Get current status of a device"""
        return self.device_status.get(device_id, DeviceStatus.DISCONNECTED)

    def get_optimal_device(self) -> Optional[str]:
        """
        Get the best available device for command execution

        Returns:
            str: Device ID or None if no devices available
        """
        # Prefer virtual device for testing
        for device_id in self.device_pool:
            if self.device_status.get(device_id) == DeviceStatus.CONNECTED:
                return device_id

        return None

    def get_stats(self) -> Dict[str, Any]:
        """Get execution statistics"""
        return {
            **self.stats,
            "device_count": len(self.device_pool),
            "connected_devices": sum(
                1 for status in self.device_status.values()
                if status == DeviceStatus.CONNECTED
            ),
            "queue_size": self.command_queue.qsize()
        }


# Convenience functions for common operations
async def launch_perplexity(device_id: str = "emulator-5554") -> bool:
    """Launch Perplexity app on device"""
    command = ADBCommand(
        command="shell am start -n ai.perplexity.app.android/.ui.main.MainActivity",
        device_id=device_id,
        priority=CommandPriority.HIGH.value
    )

    queue = ADBCommandQueue([device_id])
    result = await queue._execute_command(command)
    return result.success


async def take_screenshot(device_id: str = "emulator-5554", filename: str = "screenshot.png") -> bool:
    """Take screenshot of device"""
    # Take screenshot
    screenshot_cmd = ADBCommand(
        command=f"shell screencap -p /sdcard/{filename}",
        device_id=device_id,
        priority=CommandPriority.NORMAL.value
    )

    queue = ADBCommandQueue([device_id])
    screenshot_result = await queue._execute_command(screenshot_cmd)

    if not screenshot_result.success:
        return False

    # Pull screenshot to local machine
    pull_cmd = ADBCommand(
        command=f"pull /sdcard/{filename} ./{filename}",
        device_id=device_id,
        priority=CommandPriority.NORMAL.value
    )

    pull_result = await queue._execute_command(pull_cmd)
    return pull_result.success


async def check_device_booted(device_id: str = "emulator-5554") -> bool:
    """Check if device is fully booted"""
    command = ADBCommand(
        command="shell getprop sys.boot_completed",
        device_id=device_id,
        priority=CommandPriority.HIGH.value
    )

    queue = ADBCommandQueue([device_id])
    result = await queue._execute_command(command)

    if result.success and "1" in result.output:
        return True
    return False


if __name__ == "__main__":
    # Test basic functionality
    async def test_queue():
        queue = ADBCommandQueue(["emulator-5554"])
        await queue.start()

        # Test device check
        status = queue.get_device_status("emulator-5554")
        print(f"Device status: {status}")

        # Test simple command
        cmd = ADBCommand(
            command="shell echo 'Hello from ADB Queue!'",
            device_id="emulator-5554"
        )

        success = await queue.enqueue_command(cmd)
        print(f"Command queued: {success}")

        # Wait a bit for execution
        await asyncio.sleep(3)

        # Show stats
        stats = queue.get_stats()
        print(f"Stats: {json.dumps(stats, indent=2)}")

        await queue.stop()

    asyncio.run(test_queue())