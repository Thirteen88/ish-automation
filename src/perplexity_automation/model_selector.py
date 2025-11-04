"""
Model Selector for Perplexity Automation

This module extends the automation system to support multiple AI models
and providers, integrating with the 88 3ee AI platform's model ecosystem.
"""

import logging
from typing import Dict, List, Optional, Any
from enum import Enum
from dataclasses import dataclass
import asyncio

logger = logging.getLogger(__name__)


class ModelProvider(Enum):
    """AI model providers"""
    PERPLEXITY_APP = "perplexity_app"
    OPENAI_API = "openai_api"
    ANTHROPIC_API = "anthropic_api"
    ZAI_API = "zai_api"
    LOCAL_LLAMA = "local_llama"
    CUSTOM_API = "custom_api"


class TaskType(Enum):
    """Types of tasks for model selection"""
    GENERAL_QA = "general_qa"
    RESEARCH = "research"
    CODING = "coding"
    CREATIVE = "creative"
    ANALYSIS = "analysis"
    TRANSLATION = "translation"
    MATH = "math"
    REASONING = "reasoning"


@dataclass
class ModelConfig:
    """Model configuration"""
    provider: ModelProvider
    model_name: str
    display_name: str
    max_tokens: int
    supports_sources: bool
    supports_images: bool
    cost_per_1k_tokens: float
    average_latency_ms: int
    capabilities: List[str]
    priority: int = 5
    available: bool = True


@dataclass
class ModelSelectionRequest:
    """Model selection request"""
    task_type: TaskType
    prompt: str
    require_sources: bool = False
    require_images: bool = False
    max_latency_ms: Optional[int] = None
    max_cost: Optional[float] = None
    preferred_provider: Optional[ModelProvider] = None
    exclude_providers: List[ModelProvider] = None


class ModelSelector:
    """
    Intelligent model selection system for the 88 3ee AI platform
    """

    def __init__(self):
        """Initialize model selector with available models"""
        self.models = self._initialize_models()
        self.task_model_mapping = self._initialize_task_mapping()
        self.provider_capabilities = self._initialize_provider_capabilities()

    def _initialize_models(self) -> Dict[str, ModelConfig]:
        """Initialize available model configurations"""
        return {
            # Perplexity App Models
            "perplexity_default": ModelConfig(
                provider=ModelProvider.PERPLEXITY_APP,
                model_name="perplexity_default",
                display_name="Perplexity (App)",
                max_tokens=4000,
                supports_sources=True,
                supports_images=False,
                cost_per_1k_tokens=0.0,
                average_latency_ms=15000,
                capabilities=["web_search", "real_time_info", "citation"],
                priority=9
            ),

            # OpenAI Models
            "gpt-4o": ModelConfig(
                provider=ModelProvider.OPENAI_API,
                model_name="gpt-4o",
                display_name="GPT-4o",
                max_tokens=4000,
                supports_sources=False,
                supports_images=True,
                cost_per_1k_tokens=0.015,
                average_latency_ms=2000,
                capabilities=["reasoning", "analysis", "coding", "creative"],
                priority=8
            ),

            "gpt-4o-mini": ModelConfig(
                provider=ModelProvider.OPENAI_API,
                model_name="gpt-4o-mini",
                display_name="GPT-4o Mini",
                max_tokens=4000,
                supports_sources=False,
                supports_images=True,
                cost_per_1k_tokens=0.0005,
                average_latency_ms=1000,
                capabilities=["reasoning", "analysis", "coding", "translation"],
                priority=7
            ),

            # Anthropic Models
            "claude-3-5-sonnet-20241022": ModelConfig(
                provider=ModelProvider.ANTHROPIC_API,
                model_name="claude-3-5-sonnet-20241022",
                display_name="Claude 3.5 Sonnet",
                max_tokens=4000,
                supports_sources=False,
                supports_images=True,
                cost_per_1k_tokens=0.015,
                average_latency_ms=2500,
                capabilities=["analysis", "coding", "creative", "reasoning"],
                priority=9
            ),

            "claude-3-haiku-20240307": ModelConfig(
                provider=ModelProvider.ANTHROPIC_API,
                model_name="claude-3-haiku-20240307",
                display_name="Claude 3 Haiku",
                max_tokens=4000,
                supports_sources=False,
                supports_images=True,
                cost_per_1k_tokens=0.00125,
                average_latency_ms=800,
                capabilities=["quick_tasks", "translation", "classification"],
                priority=6
            ),

            # ZAI Models
            "zai-glm-4": ModelConfig(
                provider=ModelProvider.ZAI_API,
                model_name="zai-glm-4",
                display_name="ZAI GLM-4",
                max_tokens=4000,
                supports_sources=False,
                supports_images=False,
                cost_per_1k_tokens=0.01,
                average_latency_ms=3000,
                capabilities=["chinese_tasks", "reasoning", "analysis"],
                priority=7
            ),

            # Local Models
            "llama-3.1-8b": ModelConfig(
                provider=ModelProvider.LOCAL_LLAMA,
                model_name="llama-3.1-8b",
                display_name="Llama 3.1 8B (Local)",
                max_tokens=4000,
                supports_sources=False,
                supports_images=False,
                cost_per_1k_tokens=0.0,
                average_latency_ms=5000,
                capabilities=["general_qa", "reasoning", "offline"],
                priority=5
            ),
        }

    def _initialize_task_mapping(self) -> Dict[TaskType, List[str]]:
        """Initialize task-to-model mapping"""
        return {
            TaskType.GENERAL_QA: ["perplexity_default", "gpt-4o-mini", "claude-3-haiku-20240307", "llama-3.1-8b"],
            TaskType.RESEARCH: ["perplexity_default", "gpt-4o", "claude-3-5-sonnet-20241022"],
            TaskType.CODING: ["gpt-4o", "claude-3-5-sonnet-20241022", "gpt-4o-mini"],
            TaskType.CREATIVE: ["claude-3-5-sonnet-20241022", "gpt-4o"],
            TaskType.ANALYSIS: ["gpt-4o", "claude-3-5-sonnet-20241022", "zai-glm-4"],
            TaskType.TRANSLATION: ["gpt-4o-mini", "claude-3-haiku-20240307"],
            TaskType.MATH: ["gpt-4o", "claude-3-5-sonnet-20241022"],
            TaskType.REASONING: ["gpt-4o", "claude-3-5-sonnet-20241022", "llama-3.1-8b"],
        }

    def _initialize_provider_capabilities(self) -> Dict[ModelProvider, List[str]]:
        """Initialize provider-specific capabilities"""
        return {
            ModelProvider.PERPLEXITY_APP: ["web_search", "real_time_info", "citation", "mobile_automation"],
            ModelProvider.OPENAI_API: ["api_access", "function_calling", "structured_output"],
            ModelProvider.ANTHROPIC_API: ["api_access", "long_context", "safety_filtering"],
            ModelProvider.ZAI_API: ["api_access", "chinese_optimization", "local_compliance"],
            ModelProvider.LOCAL_LLAMA: ["offline_processing", "data_privacy", "cost_efficiency"],
            ModelProvider.CUSTOM_API: ["custom_integration", "specialized_capabilities"],
        }

    def get_available_models(self, provider: Optional[ModelProvider] = None) -> List[ModelConfig]:
        """
        Get list of available models

        Args:
            provider: Optional provider filter

        Returns:
            List of available model configurations
        """
        models = list(self.models.values())

        if provider:
            models = [m for m in models if m.provider == provider]

        # Filter only available models
        models = [m for m in models if m.available]

        # Sort by priority (highest first)
        models.sort(key=lambda m: m.priority, reverse=True)

        return models

    def select_model(self, request: ModelSelectionRequest) -> Optional[ModelConfig]:
        """
        Select the best model for a given request

        Args:
            request: Model selection request

        Returns:
            Best matching model configuration
        """
        # Get candidate models for task type
        candidate_models = self.task_model_mapping.get(request.task_type, [])
        candidate_configs = [self.models[model_id] for model_id in candidate_models if model_id in self.models]

        # Apply filters
        filtered_models = []

        for model in candidate_configs:
            # Check availability
            if not model.available:
                continue

            # Check provider exclusions
            if request.exclude_providers and model.provider in request.exclude_providers:
                continue

            # Check requirements
            if request.require_sources and not model.supports_sources:
                continue

            if request.require_images and not model.supports_images:
                continue

            # Check latency constraints
            if request.max_latency_ms and model.average_latency_ms > request.max_latency_ms:
                continue

            # Check cost constraints
            if request.max_cost and model.cost_per_1k_tokens > request.max_cost:
                continue

            # Preferred provider bonus
            if request.preferred_provider and model.provider == request.preferred_provider:
                model.priority += 2

            filtered_models.append(model)

        # If no models passed filters, try with relaxed constraints
        if not filtered_models:
            logger.warning(f"No models passed filters for task {request.task_type}, trying relaxed constraints")
            filtered_models = [m for m in candidate_configs if m.available]

        # Sort by priority and return best match
        if filtered_models:
            filtered_models.sort(key=lambda m: m.priority, reverse=True)
            return filtered_models[0]

        # Fallback to any available model
        available_models = [m for m in self.models.values() if m.available]
        if available_models:
            available_models.sort(key=lambda m: m.priority, reverse=True)
            return available_models[0]

        return None

    def get_model_by_id(self, model_id: str) -> Optional[ModelConfig]:
        """Get model configuration by ID"""
        return self.models.get(model_id)

    def update_model_availability(self, model_id: str, available: bool):
        """Update model availability status"""
        if model_id in self.models:
            self.models[model_id].available = available
            logger.info(f"Updated model {model_id} availability to {available}")

    def add_custom_model(self, model_config: ModelConfig):
        """Add a custom model configuration"""
        self.models[model_config.model_name] = model_config
        logger.info(f"Added custom model: {model_config.display_name}")

    def get_provider_stats(self) -> Dict[str, Any]:
        """Get statistics by provider"""
        stats = {}
        for provider in ModelProvider:
            provider_models = [m for m in self.models.values() if m.provider == provider]
            stats[provider.value] = {
                "total_models": len(provider_models),
                "available_models": len([m for m in provider_models if m.available]),
                "supports_sources": len([m for m in provider_models if m.supports_sources]),
                "supports_images": len([m for m in provider_models if m.supports_images]),
                "avg_cost_per_1k": sum(m.cost_per_1k_tokens for m in provider_models) / len(provider_models) if provider_models else 0,
                "avg_latency_ms": sum(m.average_latency_ms for m in provider_models) / len(provider_models) if provider_models else 0,
            }
        return stats


# Global model selector instance
model_selector = ModelSelector()


# Convenience functions
def select_best_model(task_type: TaskType, prompt: str, **kwargs) -> Optional[ModelConfig]:
    """Convenience function for model selection"""
    request = ModelSelectionRequest(
        task_type=task_type,
        prompt=prompt,
        **kwargs
    )
    return model_selector.select_model(request)


def get_models_for_task(task_type: TaskType) -> List[ModelConfig]:
    """Get all models suitable for a task type"""
    model_ids = model_selector.task_model_mapping.get(task_type, [])
    return [model_selector.models[model_id] for model_id in model_ids if model_id in model_selector.models]


def detect_task_type(prompt: str) -> TaskType:
    """
    Detect task type from prompt content

    Args:
        prompt: Input prompt

    Returns:
        Detected task type
    """
    prompt_lower = prompt.lower()

    # Research indicators
    if any(word in prompt_lower for word in ["research", "find information", "look up", "investigate", "current events", "latest"]):
        return TaskType.RESEARCH

    # Coding indicators
    if any(word in prompt_lower for word in ["code", "programming", "function", "algorithm", "debug", "implement"]):
        return TaskType.CODING

    # Creative indicators
    if any(word in prompt_lower for word in ["creative", "write", "story", "poem", "imagine", "design"]):
        return TaskType.CREATIVE

    # Math indicators
    if any(word in prompt_lower for word in ["calculate", "solve", "equation", "math", "formula", "compute"]):
        return TaskType.MATH

    # Translation indicators
    if any(word in prompt_lower for word in ["translate", "translation", "in english", "in spanish", "in french"]):
        return TaskType.TRANSLATION

    # Analysis indicators
    if any(word in prompt_lower for word in ["analyze", "analysis", "compare", "evaluate", "assess"]):
        return TaskType.ANALYSIS

    # Reasoning indicators
    if any(word in prompt_lower for word in ["reason", "explain why", "how does", "what causes", "logical"]):
        return TaskType.REASONING

    # Default to general QA
    return TaskType.GENERAL_QA


if __name__ == "__main__":
    # Test model selector
    selector = ModelSelector()

    print("🤖 Model Selector Test")
    print("=" * 40)

    # Test task type detection
    test_prompts = [
        "What is the latest news about AI?",
        "Write a Python function to sort a list",
        "Translate 'hello world' to Spanish",
        "Explain quantum computing",
    ]

    for prompt in test_prompts:
        task_type = detect_task_type(prompt)
        model = select_best_model(task_type, prompt)
        print(f"Prompt: {prompt[:50]}...")
        print(f"  Task Type: {task_type.value}")
        print(f"  Selected Model: {model.display_name if model else 'None'}")
        print()