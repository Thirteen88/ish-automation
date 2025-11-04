"""
Perplexity APK Automation Engine

This module provides the main automation engine that orchestrates
ADB commands, vision processing, and response parsing for autonomous
interaction with the Perplexity APK.
"""

import asyncio
import logging
import uuid
import time
import os
from typing import Optional, Dict, Any, List, Callable
from dataclasses import dataclass, field
from datetime import datetime
from enum import Enum
import json

from .adb_queue import (
    ADBCommandQueue, ADBCommand, ADBResult, DeviceStatus,
    launch_perplexity, take_screenshot, check_device_booted
)
from .vision_processor import VisionProcessor, UIElement, ScreenCapture
from .response_parser import ResponseParser, PerplexityResponse, SourceInfo

# Set up logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)


class AutomationStatus(Enum):
    """Automation system status"""
    IDLE = "idle"
    INITIALIZING = "initializing"
    READY = "ready"
    PROCESSING_PROMPT = "processing_prompt"
    WAITING_FOR_RESPONSE = "waiting_for_response"
    CAPTURING_RESPONSE = "capturing_response"
    ERROR = "error"
    SHUTDOWN = "shutdown"


class TaskStatus(Enum):
    """Individual task status"""
    PENDING = "pending"
    IN_PROGRESS = "in_progress"
    COMPLETED = "completed"
    FAILED = "failed"
    TIMEOUT = "timeout"


@dataclass
class AutomationTask:
    """Automation task structure"""
    task_id: str
    prompt: str
    status: TaskStatus = TaskStatus.PENDING
    created_at: datetime = field(default_factory=datetime.now)
    started_at: Optional[datetime] = None
    completed_at: Optional[datetime] = None
    response: Optional[PerplexityResponse] = None
    error_message: Optional[str] = None
    retry_count: int = 0
    max_retries: int = 3
    timeout_seconds: int = 120
    metadata: Dict[str, Any] = field(default_factory=dict)


@dataclass
class AutomationConfig:
    """Configuration for automation engine"""
    device_id: str = "emulator-5554"
    screenshot_dir: str = "./screenshots"
    max_concurrent_tasks: int = 1
    default_timeout: int = 120
    response_wait_time: int = 30
    screenshot_interval: int = 2
    confidence_threshold: float = 0.7
    auto_retry_failed_tasks: bool = True
    enable_screenshot_logging: bool = True
    vision_confidence_threshold: float = 0.8

    def __post_init__(self):
        # Ensure screenshot directory exists
        os.makedirs(self.screenshot_dir, exist_ok=True)


class PerplexityAutomationEngine:
    """
    Main Automation Engine for Perplexity APK

    Orchestrates ADB commands, vision processing, and response parsing
    to provide autonomous interaction with the Perplexity application.
    """

    def __init__(self, config: Optional[AutomationConfig] = None):
        """
        Initialize the automation engine

        Args:
            config: Automation configuration
        """
        self.config = config or AutomationConfig()
        self.status = AutomationStatus.IDLE
        self.task_queue = asyncio.Queue()
        self.active_tasks: Dict[str, AutomationTask] = {}
        self.completed_tasks: List[AutomationTask] = []

        # Initialize components
        self.adb_queue = ADBCommandQueue([self.config.device_id])
        self.vision_processor = VisionProcessor()
        self.response_parser = ResponseParser()

        # Statistics
        self.stats = {
            "tasks_processed": 0,
            "tasks_completed": 0,
            "tasks_failed": 0,
            "total_response_time": 0.0,
            "average_confidence": 0.0,
            "screenshots_taken": 0,
            "errors_encountered": 0
        }

        # Event callbacks
        self.on_task_started: Optional[Callable[[AutomationTask], None]] = None
        self.on_task_completed: Optional[Callable[[AutomationTask], None]] = None
        self.on_task_failed: Optional[Callable[[AutomationTask], None]] = None
        self.on_status_changed: Optional[Callable[[AutomationStatus], None]] = None

        logger.info("PerplexityAutomationEngine initialized")

    async def start(self) -> bool:
        """
        Start the automation engine

        Returns:
            bool: True if started successfully
        """
        try:
            await self._set_status(AutomationStatus.INITIALIZING)

            # Start ADB queue
            await self.adb_queue.start()
            logger.info("ADB queue started")

            # Wait for device connection
            device_status = self.adb_queue.get_device_status(self.config.device_id)
            if device_status != DeviceStatus.CONNECTED:
                logger.warning(f"Device {self.config.device_id} not connected, waiting...")
                await asyncio.sleep(5)
                device_status = self.adb_queue.get_device_status(self.config.device_id)

            if device_status != DeviceStatus.CONNECTED:
                raise RuntimeError(f"Device {self.config.device_id} not connected")

            # Start task processor
            asyncio.create_task(self._process_tasks())

            # Start device monitor
            asyncio.create_task(self._monitor_device())

            await self._set_status(AutomationStatus.READY)
            logger.info("PerplexityAutomationEngine started successfully")
            return True

        except Exception as e:
            logger.error(f"Failed to start automation engine: {e}")
            await self._set_status(AutomationStatus.ERROR)
            return False

    async def stop(self):
        """Stop the automation engine"""
        await self._set_status(AutomationStatus.SHUTDOWN)

        # Stop ADB queue
        await self.adb_queue.stop()

        logger.info("PerplexityAutomationEngine stopped")

    async def submit_prompt(self, prompt: str, timeout: Optional[int] = None) -> str:
        """
        Submit a prompt for processing

        Args:
            prompt: The prompt to send to Perplexity
            timeout: Optional timeout in seconds

        Returns:
            str: Task ID
        """
        task = AutomationTask(
            task_id=str(uuid.uuid4()),
            prompt=prompt,
            timeout_seconds=timeout or self.config.default_timeout
        )

        await self.task_queue.put(task)
        self.active_tasks[task.task_id] = task

        logger.info(f"Prompt submitted: {task.task_id}")
        return task.task_id

    async def get_task_status(self, task_id: str) -> Optional[AutomationTask]:
        """
        Get status of a specific task

        Args:
            task_id: Task ID to check

        Returns:
            AutomationTask: Current task state or None if not found
        """
        return self.active_tasks.get(task_id)

    async def wait_for_task(self, task_id: str, timeout: Optional[int] = None) -> Optional[PerplexityResponse]:
        """
        Wait for a task to complete

        Args:
            task_id: Task ID to wait for
            timeout: Maximum wait time in seconds

        Returns:
            PerplexityResponse: Response if completed, None otherwise
        """
        start_time = time.time()
        timeout = timeout or self.config.default_timeout

        while time.time() - start_time < timeout:
            task = self.active_tasks.get(task_id)
            if task and task.status == TaskStatus.COMPLETED:
                return task.response
            elif task and task.status == TaskStatus.FAILED:
                return None

            await asyncio.sleep(0.5)

        return None

    async def _process_tasks(self):
        """Process tasks from the queue"""
        while self.status != AutomationStatus.SHUTDOWN:
            try:
                # Get next task with timeout
                task = await asyncio.wait_for(
                    self.task_queue.get(),
                    timeout=1.0
                )

                # Process task
                asyncio.create_task(self._execute_task(task))

            except asyncio.TimeoutError:
                continue
            except Exception as e:
                logger.error(f"Error processing task: {e}")
                self.stats["errors_encountered"] += 1

    async def _execute_task(self, task: AutomationTask):
        """
        Execute a single automation task

        Args:
            task: Task to execute
        """
        try:
            task.status = TaskStatus.IN_PROGRESS
            task.started_at = datetime.now()

            if self.on_task_started:
                self.on_task_started(task)

            logger.info(f"Executing task: {task.task_id}")

            # Step 1: Ensure Perplexity is running
            await self._ensure_perplexity_running()

            # Step 2: Take initial screenshot
            initial_screenshot = await self._take_screenshot(f"initial_{task.task_id}")

            # Step 3: Locate input field and send prompt
            await self._send_prompt_to_perplexity(task.prompt)

            # Step 4: Wait for response
            await self._wait_for_response_completion()

            # Step 5: Capture response screenshot
            response_screenshot = await self._take_screenshot(f"response_{task.task_id}")

            # Step 6: Process response with vision and OCR
            response = await self._process_response_screenshot(response_screenshot, task)

            # Step 7: Validate response quality
            if response and response.confidence_score >= self.config.confidence_threshold:
                task.response = response
                task.status = TaskStatus.COMPLETED
                task.completed_at = datetime.now()

                self.stats["tasks_completed"] += 1
                self.stats["total_response_time"] += (task.completed_at - task.started_at).total_seconds()

                if self.on_task_completed:
                    self.on_task_completed(task)

                logger.info(f"Task completed: {task.task_id}")

            else:
                raise ValueError(f"Response confidence too low: {response.confidence_score if response else 'No response'}")

        except Exception as e:
            task.error_message = str(e)
            task.status = TaskStatus.FAILED
            task.completed_at = datetime.now()

            self.stats["tasks_failed"] += 1
            self.stats["errors_encountered"] += 1

            if self.on_task_failed:
                self.on_task_failed(task)

            logger.error(f"Task failed: {task.task_id} - {e}")

            # Auto-retry if enabled
            if self.config.auto_retry_failed_tasks and task.retry_count < task.max_retries:
                task.retry_count += 1
                task.status = TaskStatus.PENDING
                await self.task_queue.put(task)
                logger.info(f"Task queued for retry: {task.task_id} (attempt {task.retry_count})")

        finally:
            # Move to completed tasks
            if task.task_id in self.active_tasks:
                del self.active_tasks[task.task_id]
            self.completed_tasks.append(task)
            self.stats["tasks_processed"] += 1

    async def _ensure_perplexity_running(self) -> bool:
        """Ensure Perplexity app is running and ready"""
        logger.info("Ensuring Perplexity app is running")

        # Try to launch Perplexity
        success = await launch_perplexity(self.config.device_id)
        if not success:
            raise RuntimeError("Failed to launch Perplexity app")

        # Wait for app to load
        await asyncio.sleep(3)

        # Take screenshot to verify
        screenshot = await self._take_screenshot("app_check")
        if not screenshot:
            raise RuntimeError("Failed to capture screenshot for app verification")

        return True

    async def _send_prompt_to_perplexity(self, prompt: str):
        """
        Send prompt to Perplexity input field

        Args:
            prompt: Text prompt to send
        """
        logger.info(f"Sending prompt to Perplexity: {prompt[:50]}...")

        # Take screenshot to find input field
        screenshot = await self._take_screenshot("before_input")

        # Process screenshot to find UI elements
        capture = ScreenCapture(
            image_path=screenshot.image_path,
            timestamp=screenshot.timestamp,
            device_id=self.config.device_id
        )

        ui_elements = await self.vision_processor.process_screenshot(capture)

        # Find input field
        input_elements = [elem for elem in ui_elements if elem.element_type == "input_field"]
        if not input_elements:
            raise RuntimeError("Input field not found")

        input_element = input_elements[0]

        # Click on input field
        click_command = ADBCommand(
            command=f"shell input tap {input_element.center_x} {input_element.center_y}",
            device_id=self.config.device_id,
            priority=8
        )

        await self.adb_queue.enqueue_command(click_command)
        await asyncio.sleep(1)

        # Type the prompt
        text_command = ADBCommand(
            command=f"shell input text '{prompt.replace(' ', '%s')}'",
            device_id=self.config.device_id,
            priority=8
        )

        await self.adb_queue.enqueue_command(text_command)
        await asyncio.sleep(1)

        # Find and click send button
        send_elements = [elem for elem in ui_elements if elem.element_type == "send_button"]
        if send_elements:
            send_element = send_elements[0]
            send_command = ADBCommand(
                command=f"shell input tap {send_element.center_x} {send_element.center_y}",
                device_id=self.config.device_id,
                priority=9
            )

            await self.adb_queue.enqueue_command(send_command)
            logger.info("Prompt sent successfully")
        else:
            # Try pressing Enter as fallback
            enter_command = ADBCommand(
                command="shell input keyevent 66",
                device_id=self.config.device_id,
                priority=8
            )

            await self.adb_queue.enqueue_command(enter_command)
            logger.info("Prompt sent with Enter key")

    async def _wait_for_response_completion(self):
        """Wait for Perplexity to complete its response"""
        logger.info("Waiting for response completion")

        start_time = time.time()
        response_stable = False
        last_response_hash = None
        stable_count = 0

        while not response_stable and (time.time() - start_time) < self.config.response_wait_time:
            await asyncio.sleep(self.config.screenshot_interval)

            # Take screenshot to check response
            screenshot = await self._take_screenshot("response_check")
            if not screenshot:
                continue

            # Process for response content
            capture = ScreenCapture(
                image_path=screenshot.image_path,
                timestamp=screenshot.timestamp,
                device_id=self.config.device_id
            )

            ui_elements = await self.vision_processor.process_screenshot(capture)
            response_elements = [elem for elem in ui_elements if elem.element_type == "response_area"]

            if response_elements:
                # Calculate hash of response area to detect changes
                response_element = response_elements[0]
                current_hash = hash((response_element.x, response_element.y, response_element.width, response_element.height))

                if current_hash == last_response_hash:
                    stable_count += 1
                    if stable_count >= 3:  # Response stable for 3 checks
                        response_stable = True
                else:
                    stable_count = 0
                    last_response_hash = current_hash
            else:
                # No response area yet, continue waiting
                stable_count = 0

        if not response_stable:
            logger.warning("Response completion timeout - proceeding anyway")
        else:
            logger.info("Response completion detected")

    async def _take_screenshot(self, name_prefix: str) -> Optional[ScreenCapture]:
        """
        Take a screenshot of the device

        Args:
            name_prefix: Prefix for screenshot filename

        Returns:
            ScreenCapture: Screenshot capture info
        """
        timestamp = int(time.time())
        filename = f"{name_prefix}_{timestamp}.png"
        filepath = os.path.join(self.config.screenshot_dir, filename)

        # Take screenshot with ADB
        success = await take_screenshot(self.config.device_id, filename)
        if not success:
            logger.error(f"Failed to take screenshot: {filename}")
            return None

        self.stats["screenshots_taken"] += 1

        capture = ScreenCapture(
            image_path=filepath,
            timestamp=datetime.fromtimestamp(timestamp),
            device_id=self.config.device_id
        )

        if self.config.enable_screenshot_logging:
            logger.debug(f"Screenshot taken: {filepath}")

        return capture

    async def _process_response_screenshot(self, screenshot: ScreenCapture, task: AutomationTask) -> Optional[PerplexityResponse]:
        """
        Process response screenshot to extract text and parse response

        Args:
            screenshot: Response screenshot
            task: Associated task

        Returns:
            PerplexityResponse: Parsed response
        """
        logger.info(f"Processing response screenshot for task: {task.task_id}")

        try:
            # Process screenshot with vision processor
            ui_elements = await self.vision_processor.process_screenshot(screenshot)

            # Find response area
            response_elements = [elem for elem in ui_elements if elem.element_type == "response_area"]
            if not response_elements:
                raise ValueError("No response area found in screenshot")

            response_element = response_elements[0]

            # Extract text from response area
            response_text = await self.vision_processor.extract_text_from_region(
                screenshot.image_path,
                response_element
            )

            if not response_text or len(response_text.strip()) < 10:
                raise ValueError("No meaningful text extracted from response")

            # Parse response with ResponseParser
            parsed_response = await self.response_parser.parse_response(
                response_text,
                screenshot.image_path,
                task.prompt,
                task.task_id
            )

            # Update average confidence
            if parsed_response:
                total_confidence = self.stats["average_confidence"] * self.stats["tasks_completed"]
                total_confidence += parsed_response.confidence_score
                self.stats["average_confidence"] = total_confidence / (self.stats["tasks_completed"] + 1)

            logger.info(f"Response processed with confidence: {parsed_response.confidence_score if parsed_response else 0}")
            return parsed_response

        except Exception as e:
            logger.error(f"Failed to process response screenshot: {e}")
            return None

    async def _monitor_device(self):
        """Monitor device connection status"""
        while self.status != AutomationStatus.SHUTDOWN:
            try:
                device_status = self.adb_queue.get_device_status(self.config.device_id)
                if device_status != DeviceStatus.CONNECTED and self.status == AutomationStatus.READY:
                    logger.warning(f"Device disconnected: {self.config.device_id}")
                    await self._set_status(AutomationStatus.ERROR)
                elif device_status == DeviceStatus.CONNECTED and self.status == AutomationStatus.ERROR:
                    logger.info(f"Device reconnected: {self.config.device_id}")
                    await self._set_status(AutomationStatus.READY)

                await asyncio.sleep(5)

            except Exception as e:
                logger.error(f"Error monitoring device: {e}")
                await asyncio.sleep(5)

    async def _set_status(self, new_status: AutomationStatus):
        """Set engine status and trigger callback"""
        old_status = self.status
        self.status = new_status

        if old_status != new_status and self.on_status_changed:
            self.on_status_changed(new_status)

        logger.info(f"Engine status changed: {old_status.value} -> {new_status.value}")

    def get_stats(self) -> Dict[str, Any]:
        """Get engine statistics"""
        return {
            **self.stats,
            "current_status": self.status.value,
            "active_tasks": len(self.active_tasks),
            "queued_tasks": self.task_queue.qsize(),
            "completed_tasks": len(self.completed_tasks),
            "success_rate": (
                self.stats["tasks_completed"] / max(1, self.stats["tasks_processed"]) * 100
            )
        }

    def get_recent_tasks(self, count: int = 10) -> List[Dict[str, Any]]:
        """
        Get recent completed tasks

        Args:
            count: Number of tasks to return

        Returns:
            List of task summaries
        """
        recent_tasks = sorted(
            self.completed_tasks[-count:],
            key=lambda t: t.completed_at or t.created_at,
            reverse=True
        )

        return [
            {
                "task_id": task.task_id,
                "prompt": task.prompt[:100] + "..." if len(task.prompt) > 100 else task.prompt,
                "status": task.status.value,
                "created_at": task.created_at.isoformat(),
                "started_at": task.started_at.isoformat() if task.started_at else None,
                "completed_at": task.completed_at.isoformat() if task.completed_at else None,
                "confidence_score": task.response.confidence_score if task.response else None,
                "response_length": len(task.response.answer) if task.response and task.response.answer else 0,
                "sources_found": len(task.response.sources) if task.response and task.response.sources else 0,
                "error_message": task.error_message,
                "retry_count": task.retry_count
            }
            for task in recent_tasks
        ]


# Convenience functions for standalone usage
async def create_automation_engine(device_id: str = "emulator-5554", **kwargs) -> PerplexityAutomationEngine:
    """
    Create and start a Perplexity automation engine

    Args:
        device_id: Device ID to use
        **kwargs: Additional configuration options

    Returns:
        PerplexityAutomationEngine: Started automation engine
    """
    config = AutomationConfig(device_id=device_id, **kwargs)
    engine = PerplexityAutomationEngine(config)

    success = await engine.start()
    if not success:
        raise RuntimeError("Failed to start automation engine")

    return engine


async def submit_prompt_to_perplexity(prompt: str, device_id: str = "emulator-5554", timeout: int = 120) -> Optional[PerplexityResponse]:
    """
    Simple function to submit a prompt and get response

    Args:
        prompt: Prompt to submit
        device_id: Device ID to use
        timeout: Timeout in seconds

    Returns:
        PerplexityResponse: Response if successful
    """
    engine = await create_automation_engine(device_id=device_id)

    try:
        task_id = await engine.submit_prompt(prompt, timeout=timeout)
        response = await engine.wait_for_task(task_id, timeout=timeout)
        return response
    finally:
        await engine.stop()


if __name__ == "__main__":
    # Test basic functionality
    async def test_automation_engine():
        print("🚀 Testing Perplexity Automation Engine")
        print("=" * 50)

        # Create engine
        engine = await create_automation_engine()

        # Submit test prompt
        test_prompt = "What is artificial intelligence?"
        print(f"Submitting test prompt: {test_prompt}")

        task_id = await engine.submit_prompt(test_prompt, timeout=60)
        print(f"Task submitted with ID: {task_id}")

        # Wait for completion
        print("Waiting for response...")
        response = await engine.wait_for_task(task_id, timeout=90)

        if response:
            print(f"✅ Response received!")
            print(f"Confidence: {response.confidence_score}")
            print(f"Answer length: {len(response.answer)} characters")
            print(f"Sources found: {len(response.sources)}")
            print(f"Preview: {response.answer[:200]}...")
        else:
            print("❌ No response received")

        # Show stats
        stats = engine.get_stats()
        print(f"\n📊 Engine Stats:")
        print(json.dumps(stats, indent=2))

        # Show recent tasks
        recent_tasks = engine.get_recent_tasks(5)
        print(f"\n📋 Recent Tasks:")
        for task in recent_tasks:
            print(f"  {task['task_id'][:8]}... - {task['status']} - Confidence: {task['confidence_score']}")

        await engine.stop()
        print("\n✅ Test completed")

    asyncio.run(test_automation_engine())