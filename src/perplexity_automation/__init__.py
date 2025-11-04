"""
Perplexity APK Automation System

This package provides autonomous interaction with the Perplexity APK
for sending prompts and extracting responses using ADB automation,
computer vision, and OCR.
"""

from .perplexity_automation import (
    PerplexityAutomationEngine, AutomationTask, AutomationConfig,
    AutomationStatus, TaskStatus, create_automation_engine,
    submit_prompt_to_perplexity
)
from .adb_queue import ADBCommandQueue, ADBCommand, ADBResult, DeviceStatus
from .vision_processor import VisionProcessor, UIElement, ScreenCapture
from .response_parser import ResponseParser, PerplexityResponse, SourceInfo
from .model_selector import (
    ModelSelector, ModelConfig, ModelProvider, TaskType,
    ModelSelectionRequest, ModelInfo, model_selector,
    detect_task_type, select_best_model, get_models_for_task
)

__version__ = "1.0.0"
__all__ = [
    "PerplexityAutomationEngine",
    "AutomationTask",
    "AutomationConfig",
    "AutomationStatus",
    "TaskStatus",
    "create_automation_engine",
    "submit_prompt_to_perplexity",
    "ADBCommandQueue",
    "ADBCommand",
    "ADBResult",
    "DeviceStatus",
    "VisionProcessor",
    "UIElement",
    "ScreenCapture",
    "ResponseParser",
    "PerplexityResponse",
    "SourceInfo"
]