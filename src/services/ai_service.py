"""
AI service integration for multiple providers
"""
import os
import httpx
import logging
from typing import Dict, Any, List, Optional
from abc import ABC, abstractmethod

logger = logging.getLogger(__name__)

class AIProvider(ABC):
    """Abstract base class for AI providers"""

    def __init__(self, api_key: str, model: str):
        self.api_key = api_key
        self.model = model

    @abstractmethod
    async def generate_response(self, prompt: str, system_prompt: str = None) -> str:
        """Generate response from AI model"""
        pass

class OpenAIProvider(AIProvider):
    """OpenAI API provider"""

    def __init__(self, api_key: str, model: str = "gpt-4", base_url: str = None):
        super().__init__(api_key, model)
        self.base_url = base_url or "https://api.openai.com/v1"

    async def generate_response(self, prompt: str, system_prompt: str = None) -> str:
        headers = {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json"
        }

        messages = []
        if system_prompt:
            messages.append({"role": "system", "content": system_prompt})
        messages.append({"role": "user", "content": prompt})

        data = {
            "model": self.model,
            "messages": messages,
            "temperature": 0.7,
            "max_tokens": 1000
        }

        try:
            async with httpx.AsyncClient(timeout=30) as client:
                response = await client.post(f"{self.base_url}/chat/completions", headers=headers, json=data)
                response.raise_for_status()
                result = response.json()
                return result["choices"][0]["message"]["content"]
        except Exception as e:
            logger.error(f"OpenAI API error: {e}")
            return f"Error calling OpenAI API: {str(e)}"

class ZAIProvider(AIProvider):
    """ZAI (智谱AI) provider"""

    def __init__(self, api_key: str, model: str = "glm-4", base_url: str = "https://open.bigmodel.cn/api/paas/v4"):
        super().__init__(api_key, model)
        self.base_url = base_url

    async def generate_response(self, prompt: str, system_prompt: str = None) -> str:
        headers = {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json"
        }

        messages = []
        if system_prompt:
            messages.append({"role": "system", "content": system_prompt})
        messages.append({"role": "user", "content": prompt})

        data = {
            "model": self.model,
            "messages": messages,
            "temperature": 0.7,
            "max_tokens": 1000
        }

        try:
            async with httpx.AsyncClient(timeout=30) as client:
                response = await client.post(f"{self.base_url}/chat/completions", headers=headers, json=data)
                response.raise_for_status()
                result = response.json()
                return result["choices"][0]["message"]["content"]
        except Exception as e:
            logger.error(f"ZAI API error: {e}")
            return f"Error calling ZAI API: {str(e)}"

class AnthropicProvider(AIProvider):
    """Anthropic Claude provider"""

    def __init__(self, api_key: str, model: str = "claude-3-sonnet-20240229"):
        super().__init__(api_key, model)
        self.base_url = "https://api.anthropic.com/v1"

    async def generate_response(self, prompt: str, system_prompt: str = None) -> str:
        headers = {
            "x-api-key": self.api_key,
            "Content-Type": "application/json",
            "anthropic-version": "2023-06-01"
        }

        messages = []
        if system_prompt:
            messages.append({"role": "user", "content": f"System: {system_prompt}\n\nUser: {prompt}"})
        else:
            messages.append({"role": "user", "content": prompt})

        data = {
            "model": self.model,
            "messages": messages,
            "max_tokens": 1000,
            "temperature": 0.7
        }

        try:
            async with httpx.AsyncClient(timeout=30) as client:
                response = await client.post(f"{self.base_url}/messages", headers=headers, json=data)
                response.raise_for_status()
                result = response.json()
                return result["content"][0]["text"]
        except Exception as e:
            logger.error(f"Anthropic API error: {e}")
            return f"Error calling Anthropic API: {str(e)}"

class AIService:
    """Main AI service that manages multiple providers"""

    def __init__(self):
        self.providers = {}
        self._initialize_providers()

    def _initialize_providers(self):
        """Initialize AI providers from environment variables"""
        # ZAI Configuration
        zai_key = os.getenv("ZAI_API_KEY")
        if zai_key:
            zai_url = os.getenv("ZAI_API_URL", "https://open.bigmodel.cn/api/paas/v4")
            zai_model = os.getenv("ZAI_MODEL", "glm-4")
            self.providers["zai"] = ZAIProvider(zai_key, zai_model, zai_url)
            logger.info("ZAI provider initialized")

        # OpenAI Configuration
        openai_key = os.getenv("OPENAI_API_KEY")
        if openai_key:
            openai_model = os.getenv("OPENAI_MODEL", "gpt-4")
            openai_url = os.getenv("OPENAI_API_BASE")
            self.providers["openai"] = OpenAIProvider(openai_key, openai_model, openai_url)
            logger.info("OpenAI provider initialized")

        # Anthropic Configuration
        anthropic_key = os.getenv("ANTHROPIC_API_KEY")
        if anthropic_key:
            anthropic_model = os.getenv("ANTHROPIC_MODEL", "claude-3-sonnet-20240229")
            self.providers["anthropic"] = AnthropicProvider(anthropic_key, anthropic_model)
            logger.info("Anthropic provider initialized")

    def get_available_providers(self) -> List[str]:
        """Get list of available provider names"""
        return list(self.providers.keys())

    def has_provider(self, provider_name: str) -> bool:
        """Check if provider is available"""
        return provider_name in self.providers

    async def generate_response(
        self,
        prompt: str,
        provider_name: str = None,
        system_prompt: str = "You are an AI assistant helping with Android automation."
    ) -> Dict[str, Any]:
        """Generate response using specified or default provider"""

        if not self.providers:
            return {
                "success": False,
                "error": "No AI providers configured",
                "response": None
            }

        # Use specified provider or first available
        if provider_name and provider_name in self.providers:
            provider = self.providers[provider_name]
        else:
            provider = list(self.providers.values())[0]
            provider_name = list(self.providers.keys())[0]

        try:
            response = await provider.generate_response(prompt, system_prompt)
            return {
                "success": True,
                "provider": provider_name,
                "model": provider.model,
                "response": response
            }
        except Exception as e:
            logger.error(f"AI generation error: {e}")
            return {
                "success": False,
                "provider": provider_name,
                "error": str(e),
                "response": None
            }

    async def analyze_screenshot(self, image_path: str, query: str = None) -> Dict[str, Any]:
        """Analyze screenshot for UI elements or text"""
        # This is a placeholder for future OCR/vision capabilities
        default_query = query or "Describe what you see in this screenshot and identify any UI elements, buttons, or interactive components."

        return await self.generate_response(
            prompt=f"Analyze this screenshot at {image_path}: {default_query}",
            system_prompt="You are a computer vision expert analyzing mobile app screenshots."
        )

    async def suggest_automation_steps(self, goal: str, current_state: str = None) -> Dict[str, Any]:
        """Suggest automation steps to achieve a goal"""
        prompt = f"""
        Goal: {goal}
        Current state: {current_state or 'Unknown'}

        Please suggest specific ADB commands and automation steps to achieve this goal.
        Include tap coordinates, swipe gestures, and any necessary timing.
        Format your response as a numbered list of actionable steps.
        """

        return await self.generate_response(
            prompt=prompt,
            system_prompt="You are an Android automation expert. Provide specific, actionable ADB commands and coordinates."
        )