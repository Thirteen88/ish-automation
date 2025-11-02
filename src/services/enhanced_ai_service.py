"""
Enhanced AI service with advanced multi-provider support,
context management, and specialized automation capabilities
"""
import os
import httpx
import json
import logging
import asyncio
from typing import Dict, Any, List, Optional, Union, Callable
from abc import ABC, abstractmethod
from datetime import datetime
from dataclasses import dataclass, field
from enum import Enum
import hashlib

logger = logging.getLogger(__name__)

class ProviderType(Enum):
    """AI provider types"""
    OPENAI = "openai"
    ANTHROPIC = "anthropic"
    ZAI = "zai"
    OLLAMA = "ollama"
    HUGGINGFACE = "huggingface"
    CUSTOM = "custom"

class ResponseFormat(Enum):
    """Response format types"""
    TEXT = "text"
    JSON = "json"
    CODE = "code"
    MARKDOWN = "markdown"

@dataclass
class AIRequest:
    """AI request configuration"""
    prompt: str
    system_prompt: Optional[str] = None
    provider: Optional[str] = None
    model: Optional[str] = None
    temperature: float = 0.7
    max_tokens: int = 1000
    response_format: ResponseFormat = ResponseFormat.TEXT
    context: Optional[Dict[str, Any]] = None
    metadata: Optional[Dict[str, Any]] = field(default_factory=dict)

@dataclass
class AIResponse:
    """AI response data"""
    success: bool
    provider: str
    model: str
    response: Optional[str] = None
    error: Optional[str] = None
    usage: Optional[Dict[str, Any]] = None
    execution_time: float = 0.0
    context: Optional[Dict[str, Any]] = None
    metadata: Optional[Dict[str, Any]] = field(default_factory=dict)
    timestamp: str = field(default_factory=lambda: datetime.utcnow().isoformat())

@dataclass
class ConversationContext:
    """Conversation context for maintaining chat history"""
    conversation_id: str
    messages: List[Dict[str, str]] = field(default_factory=list)
    context_data: Dict[str, Any] = field(default_factory=dict)
    provider: Optional[str] = None
    model: Optional[str] = None
    created_at: str = field(default_factory=lambda: datetime.utcnow().isoformat())
    last_updated: str = field(default_factory=lambda: datetime.utcnow().isoformat())

class EnhancedAIProvider(ABC):
    """Enhanced abstract base class for AI providers"""

    def __init__(self, api_key: str, model: str, **kwargs):
        self.api_key = api_key
        self.model = model
        self.provider_name = kwargs.get('provider_name', self.__class__.__name__)
        self.config = kwargs
        self.supports_streaming = kwargs.get('supports_streaming', False)
        self.supports_functions = kwargs.get('supports_functions', False)

    @abstractmethod
    async def generate_response(self, request: AIRequest) -> AIResponse:
        """Generate response from AI model"""
        pass

    async def health_check(self) -> Dict[str, Any]:
        """Check provider health and availability"""
        try:
            test_request = AIRequest(
                prompt="Hello, this is a health check.",
                max_tokens=10
            )
            response = await self.generate_response(test_request)
            return {
                "provider": self.provider_name,
                "model": self.model,
                "healthy": response.success,
                "error": response.error
            }
        except Exception as e:
            return {
                "provider": self.provider_name,
                "model": self.model,
                "healthy": False,
                "error": str(e)
            }

class EnhancedOpenAIProvider(EnhancedAIProvider):
    """Enhanced OpenAI provider with advanced features"""

    def __init__(self, api_key: str, model: str = "gpt-4", base_url: str = None, **kwargs):
        super().__init__(api_key, model, provider_name="openai", **kwargs)
        self.base_url = base_url or "https://api.openai.com/v1"
        self.supports_streaming = True
        self.supports_functions = True

    async def generate_response(self, request: AIRequest) -> AIResponse:
        start_time = asyncio.get_event_loop().time()

        headers = {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json"
        }

        messages = []
        if request.system_prompt:
            messages.append({"role": "system", "content": request.system_prompt})

        # Add context messages if provided
        if request.context and request.context.get('conversation_history'):
            messages.extend(request.context['conversation_history'])

        messages.append({"role": "user", "content": request.prompt})

        data = {
            "model": request.model or self.model,
            "messages": messages,
            "temperature": request.temperature,
            "max_tokens": request.max_tokens
        }

        # Add response format if specified
        if request.response_format == ResponseFormat.JSON:
            data["response_format"] = {"type": "json_object"}

        # Add function calling if supported
        if request.metadata.get('functions'):
            data["functions"] = request.metadata['functions']
            if request.metadata.get('function_call'):
                data["function_call"] = request.metadata['function_call']

        try:
            async with httpx.AsyncClient(timeout=30) as client:
                response = await client.post(f"{self.base_url}/chat/completions", headers=headers, json=data)
                response.raise_for_status()
                result = response.json()

                execution_time = asyncio.get_event_loop().time() - start_time

                return AIResponse(
                    success=True,
                    provider=self.provider_name,
                    model=result["model"],
                    response=result["choices"][0]["message"]["content"],
                    usage=result.get("usage"),
                    execution_time=execution_time,
                    context=request.context,
                    metadata=request.metadata
                )

        except Exception as e:
            execution_time = asyncio.get_event_loop().time() - start_time
            logger.error(f"OpenAI API error: {e}")
            return AIResponse(
                success=False,
                provider=self.provider_name,
                model=request.model or self.model,
                error=str(e),
                execution_time=execution_time,
                context=request.context,
                metadata=request.metadata
            )

class EnhancedAnthropicProvider(EnhancedAIProvider):
    """Enhanced Anthropic Claude provider"""

    def __init__(self, api_key: str, model: str = "claude-3-sonnet-20240229", **kwargs):
        super().__init__(api_key, model, provider_name="anthropic", **kwargs)
        self.base_url = "https://api.anthropic.com/v1"

    async def generate_response(self, request: AIRequest) -> AIResponse:
        start_time = asyncio.get_event_loop().time()

        headers = {
            "x-api-key": self.api_key,
            "Content-Type": "application/json",
            "anthropic-version": "2023-06-01"
        }

        messages = []
        if request.system_prompt:
            messages.append({"role": "user", "content": f"System: {request.system_prompt}\n\nUser: {request.prompt}"})
        else:
            messages.append({"role": "user", "content": request.prompt})

        data = {
            "model": request.model or self.model,
            "messages": messages,
            "max_tokens": request.max_tokens,
            "temperature": request.temperature
        }

        try:
            async with httpx.AsyncClient(timeout=30) as client:
                response = await client.post(f"{self.base_url}/messages", headers=headers, json=data)
                response.raise_for_status()
                result = response.json()

                execution_time = asyncio.get_event_loop().time() - start_time

                return AIResponse(
                    success=True,
                    provider=self.provider_name,
                    model=result["model"],
                    response=result["content"][0]["text"],
                    usage=result.get("usage"),
                    execution_time=execution_time,
                    context=request.context,
                    metadata=request.metadata
                )

        except Exception as e:
            execution_time = asyncio.get_event_loop().time() - start_time
            logger.error(f"Anthropic API error: {e}")
            return AIResponse(
                success=False,
                provider=self.provider_name,
                model=request.model or self.model,
                error=str(e),
                execution_time=execution_time,
                context=request.context,
                metadata=request.metadata
            )

class EnhancedZAIProvider(EnhancedAIProvider):
    """Enhanced ZAI (智谱AI) provider"""

    def __init__(self, api_key: str, model: str = "glm-4", base_url: str = "https://open.bigmodel.cn/api/paas/v4", **kwargs):
        super().__init__(api_key, model, provider_name="zai", **kwargs)
        self.base_url = base_url

    async def generate_response(self, request: AIRequest) -> AIResponse:
        start_time = asyncio.get_event_loop().time()

        headers = {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json"
        }

        # ZAI API uses a different format - combine system prompt and user prompt
        full_prompt = request.prompt
        if request.system_prompt:
            full_prompt = f"{request.system_prompt}\n\n{request.prompt}"

        # Add context if provided
        if request.context and request.context.get('conversation_history'):
            context_text = "\n".join([
                f"{msg['role']}: {msg['content']}"
                for msg in request.context['conversation_history']
            ])
            full_prompt = f"{context_text}\n\n{full_prompt}"

        # ZAI API expects prompt-based format, not messages format
        data = {
            "prompt": full_prompt,
            "model": request.model or self.model,
            "temperature": request.temperature,
            "max_tokens": request.max_tokens
        }

        try:
            async with httpx.AsyncClient(timeout=30) as client:
                response = await client.post(f"{self.base_url}/chat/completions", headers=headers, json=data)

                # Log response for debugging
                logger.info(f"ZAI API response status: {response.status_code}")
                logger.info(f"ZAI API response: {response.text[:200]}...")

                if response.status_code != 200:
                    # Try to get error details
                    try:
                        error_data = response.json()
                        error_msg = error_data.get('error', {}).get('message', f'HTTP {response.status_code}')
                        logger.error(f"ZAI API error: {error_msg}")
                    except:
                        error_msg = f"HTTP {response.status_code}: {response.text[:100]}"

                    return AIResponse(
                        success=False,
                        provider=self.provider_name,
                        model=request.model or self.model,
                        error=error_msg,
                        execution_time=asyncio.get_event_loop().time() - start_time,
                        context=request.context,
                        metadata=request.metadata
                    )

                result = response.json()
                execution_time = asyncio.get_event_loop().time() - start_time

                # Handle different response formats
                if 'error' in result:
                    error_code = result.get('error', {}).get('code', 'Unknown')
                    error_msg = result.get('error', {}).get('message', f'Error code {error_code}')
                    return AIResponse(
                        success=False,
                        provider=self.provider_name,
                        model=request.model or self.model,
                        error=f"ZAI API error: {error_msg} (code: {error_code})",
                        execution_time=execution_time,
                        context=request.context,
                        metadata=request.metadata
                    )

                # Try to extract response from different possible formats
                response_text = None
                if 'choices' in result and result['choices']:
                    response_text = result['choices'][0].get('message', {}).get('content')
                elif 'response' in result:
                    response_text = result['response']
                elif 'data' in result:
                    response_text = result['data']
                else:
                    response_text = str(result)[:500]  # Fallback to string representation

                return AIResponse(
                    success=True,
                    provider=self.provider_name,
                    model=result.get("model", request.model or self.model),
                    response=response_text,
                    usage=result.get("usage"),
                    execution_time=execution_time,
                    context=request.context,
                    metadata=request.metadata
                )

        except Exception as e:
            execution_time = asyncio.get_event_loop().time() - start_time
            logger.error(f"ZAI API error: {e}")
            return AIResponse(
                success=False,
                provider=self.provider_name,
                model=request.model or self.model,
                error=str(e),
                execution_time=execution_time,
                context=request.context,
                metadata=request.metadata
            )

class OllamaProvider(EnhancedAIProvider):
    """Ollama provider for local models"""

    def __init__(self, base_url: str = "http://localhost:11434", model: str = "llama2", **kwargs):
        super().__init__("", model, provider_name="ollama", **kwargs)
        self.base_url = base_url
        self.supports_streaming = True

    async def generate_response(self, request: AIRequest) -> AIResponse:
        start_time = asyncio.get_event_loop().time()

        data = {
            "model": request.model or self.model,
            "prompt": request.prompt,
            "system": request.system_prompt,
            "temperature": request.temperature,
            "options": {
                "num_predict": request.max_tokens
            }
        }

        if request.context and request.context.get('conversation_history'):
            # Ollama doesn't support complex context, but we can add it as part of the prompt
            context_str = "\n".join([f"{msg['role']}: {msg['content']}" for msg in request.context['conversation_history']])
            data["prompt"] = f"{context_str}\n\n{request.prompt}"

        try:
            async with httpx.AsyncClient(timeout=60) as client:
                response = await client.post(f"{self.base_url}/api/generate", json=data)
                response.raise_for_status()
                result = response.json()

                execution_time = asyncio.get_event_loop().time() - start_time

                return AIResponse(
                    success=True,
                    provider=self.provider_name,
                    model=result.get("model", request.model or self.model),
                    response=result.get("response", ""),
                    usage=result.get("usage"),
                    execution_time=execution_time,
                    context=request.context,
                    metadata=request.metadata
                )

        except Exception as e:
            execution_time = asyncio.get_event_loop().time() - start_time
            logger.error(f"Ollama API error: {e}")
            return AIResponse(
                success=False,
                provider=self.provider_name,
                model=request.model or self.model,
                error=str(e),
                execution_time=execution_time,
                context=request.context,
                metadata=request.metadata
            )

    async def health_check(self) -> Dict[str, Any]:
        """Check Ollama server status"""
        try:
            async with httpx.AsyncClient(timeout=5) as client:
                response = await client.get(f"{self.base_url}/api/tags")
                if response.status_code == 200:
                    models = response.json().get('models', [])
                    return {
                        "provider": self.provider_name,
                        "model": self.model,
                        "healthy": True,
                        "available_models": [model['name'] for model in models],
                        "server_running": True
                    }
        except Exception as e:
            return {
                "provider": self.provider_name,
                "model": self.model,
                "healthy": False,
                "error": str(e),
                "server_running": False
            }

class ProviderComparator:
    """Compare responses from multiple providers"""

    def __init__(self):
        self.comparison_metrics = [
            'response_length',
            'execution_time',
            'provider_preference'
        ]

    async def compare_responses(self, responses: List[AIResponse], criteria: str = "quality") -> AIResponse:
        """Compare multiple responses and select the best one"""
        successful_responses = [r for r in responses if r.success]

        if not successful_responses:
            # Return first response with error
            return responses[0] if responses else AIResponse(
                success=False, provider="none", model="none", error="No responses"
            )

        if criteria == "speed":
            # Select fastest response
            return min(successful_responses, key=lambda r: r.execution_time)
        elif criteria == "length":
            # Select longest response
            return max(successful_responses, key=lambda r: len(r.response or ""))
        else:
            # Default to first successful response
            return successful_responses[0]

class EnhancedAIService:
    """Enhanced AI service with advanced multi-provider support and context management"""

    def __init__(self):
        self.providers = {}
        self.contexts = {}  # conversation_id -> ConversationContext
        self.comparator = ProviderComparator()
        self._initialize_providers()

    def _initialize_providers(self):
        """Initialize AI providers from environment variables"""
        # ZAI Configuration
        zai_key = os.getenv("ZAI_API_KEY")
        if zai_key:
            zai_url = os.getenv("ZAI_API_URL", "https://open.bigmodel.cn/api/paas/v4")
            zai_model = os.getenv("ZAI_MODEL", "glm-4")
            self.providers["zai"] = EnhancedZAIProvider(zai_key, zai_model, zai_url)
            logger.info("ZAI provider initialized")

        # OpenAI Configuration
        openai_key = os.getenv("OPENAI_API_KEY")
        if openai_key:
            openai_model = os.getenv("OPENAI_MODEL", "gpt-4")
            openai_url = os.getenv("OPENAI_API_BASE")
            self.providers["openai"] = EnhancedOpenAIProvider(openai_key, openai_model, openai_url)
            logger.info("OpenAI provider initialized")

        # Anthropic Configuration
        anthropic_key = os.getenv("ANTHROPIC_API_KEY")
        if anthropic_key:
            anthropic_model = os.getenv("ANTHROPIC_MODEL", "claude-3-sonnet-20240229")
            self.providers["anthropic"] = EnhancedAnthropicProvider(anthropic_key, anthropic_model)
            logger.info("Anthropic provider initialized")

        # Ollama Configuration (local models)
        ollama_url = os.getenv("OLLAMA_BASE_URL", "http://localhost:11434")
        ollama_model = os.getenv("OLLAMA_MODEL", "llama2")
        if os.getenv("ENABLE_OLLAMA", "false").lower() == "true":
            self.providers["ollama"] = OllamaProvider(ollama_url, ollama_model)
            logger.info("Ollama provider initialized")

    def get_available_providers(self) -> List[str]:
        """Get list of available provider names"""
        return list(self.providers.keys())

    def get_provider_info(self) -> Dict[str, Dict[str, Any]]:
        """Get detailed information about providers"""
        info = {}
        for name, provider in self.providers.items():
            info[name] = {
                "name": provider.provider_name,
                "model": provider.model,
                "supports_streaming": provider.supports_streaming,
                "supports_functions": provider.supports_functions
            }
        return info

    async def health_check_all(self) -> Dict[str, Any]:
        """Check health of all providers"""
        health_status = {}
        for name, provider in self.providers.items():
            health_status[name] = await provider.health_check()
        return health_status

    def create_conversation(self, conversation_id: str = None, provider: str = None) -> str:
        """Create or get conversation context"""
        if conversation_id is None:
            conversation_id = hashlib.md5(f"{datetime.utcnow()}{os.urandom(16)}".encode()).hexdigest()

        if conversation_id not in self.contexts:
            self.contexts[conversation_id] = ConversationContext(
                conversation_id=conversation_id,
                provider=provider
            )

        return conversation_id

    async def generate_response(self, request: AIRequest) -> AIResponse:
        """Generate response using specified or default provider"""

        if not self.providers:
            return AIResponse(
                success=False,
                provider="none",
                model="none",
                error="No AI providers configured"
            )

        # Use specified provider or first available
        if request.provider and request.provider in self.providers:
            provider = self.providers[request.provider]
        else:
            provider = list(self.providers.values())[0]
            request.provider = list(self.providers.keys())[0]

        try:
            return await provider.generate_response(request)
        except Exception as e:
            logger.error(f"AI generation error: {e}")
            return AIResponse(
                success=False,
                provider=request.provider,
                model=request.model or provider.model,
                error=str(e),
                context=request.context
            )

    async def generate_response_with_fallback(
        self,
        request: AIRequest,
        fallback_providers: List[str] = None
    ) -> AIResponse:
        """Generate response with fallback to other providers if primary fails"""

        if not self.providers:
            return AIResponse(
                success=False,
                provider="none",
                model="none",
                error="No AI providers configured"
            )

        # Determine provider order
        providers_to_try = []
        if request.provider and request.provider in self.providers:
            providers_to_try.append(request.provider)

        if fallback_providers:
            providers_to_try.extend([p for p in fallback_providers if p in self.providers])
        else:
            # Add all other providers as fallbacks
            providers_to_try.extend([p for p in self.providers.keys() if p != request.provider])

        # Remove duplicates
        providers_to_try = list(dict.fromkeys(providers_to_try))

        last_error = None
        for provider_name in providers_to_try:
            provider = self.providers[provider_name]
            modified_request = AIRequest(
                prompt=request.prompt,
                system_prompt=request.system_prompt,
                provider=provider_name,
                model=request.model,
                temperature=request.temperature,
                max_tokens=request.max_tokens,
                response_format=request.response_format,
                context=request.context,
                metadata=request.metadata
            )

            try:
                response = await provider.generate_response(modified_request)
                if response.success:
                    return response
                else:
                    last_error = response.error
                    logger.warning(f"Provider {provider_name} failed: {last_error}")
            except Exception as e:
                last_error = str(e)
                logger.error(f"Provider {provider_name} error: {last_error}")

        # All providers failed
        return AIResponse(
            success=False,
            provider=request.provider,
            model=request.model,
            error=f"All providers failed. Last error: {last_error}"
        )

    async def compare_provider_responses(
        self,
        prompt: str,
        providers: List[str] = None,
        system_prompt: str = None,
        criteria: str = "quality"
    ) -> Dict[str, Any]:
        """Generate responses from multiple providers and compare them"""

        if providers is None:
            providers = list(self.providers.keys())

        if not providers:
            return {"error": "No providers available for comparison"}

        request = AIRequest(
            prompt=prompt,
            system_prompt=system_prompt,
            temperature=0.7,
            max_tokens=1000
        )

        tasks = []
        for provider_name in providers:
            if provider_name in self.providers:
                modified_request = AIRequest(
                    prompt=prompt,
                    system_prompt=system_prompt,
                    provider=provider_name,
                    temperature=0.7,
                    max_tokens=1000
                )
                tasks.append(self.providers[provider_name].generate_response(modified_request))

        # Execute all requests concurrently
        responses = await asyncio.gather(*tasks, return_exceptions=True)

        # Filter successful responses
        successful_responses = []
        for i, response in enumerate(responses):
            if isinstance(response, Exception):
                logger.error(f"Provider {providers[i]} failed: {response}")
            elif isinstance(response, AIResponse):
                successful_responses.append(response)

        # Compare and select best response
        best_response = await self.comparator.compare_responses(successful_responses, criteria)

        return {
            "comparison_criteria": criteria,
            "responses": [
                {
                    "provider": r.provider,
                    "model": r.model,
                    "success": r.success,
                    "response": r.response[:200] + "..." if r.response and len(r.response) > 200 else r.response,
                    "execution_time": r.execution_time,
                    "error": r.error
                }
                for r in responses if isinstance(r, AIResponse)
            ],
            "best_response": {
                "provider": best_response.provider,
                "model": best_response.model,
                "response": best_response.response,
                "execution_time": best_response.execution_time
            }
        }

    async def chat_with_context(
        self,
        conversation_id: str,
        message: str,
        system_prompt: str = None,
        provider: str = None
    ) -> Dict[str, Any]:
        """Continue conversation with context management"""

        # Get or create conversation context
        if conversation_id not in self.contexts:
            self.create_conversation(conversation_id, provider)

        context = self.contexts[conversation_id]

        # Add user message to context
        context.messages.append({"role": "user", "content": message})
        context.last_updated = datetime.utcnow().isoformat()

        # Generate response
        request = AIRequest(
            prompt=message,
            system_prompt=system_prompt,
            provider=provider or context.provider,
            context={"conversation_history": context.messages[:-1]},  # Exclude current message
            metadata={"conversation_id": conversation_id}
        )

        response = await self.generate_response(request)

        # Add assistant response to context
        if response.success:
            context.messages.append({"role": "assistant", "content": response.response})
            context.last_updated = datetime.utcnow().isoformat()

        return {
            "conversation_id": conversation_id,
            "response": response,
            "context": {
                "message_count": len(context.messages),
                "last_updated": context.last_updated
            }
        }

    async def analyze_screenshot_with_ocr(
        self,
        image_path: str,
        ocr_text: str = None,
        query: str = None
    ) -> AIResponse:
        """Analyze screenshot with OCR text integration"""

        # Import OCR service here to avoid circular imports
        from .ocr_service import ocr_service

        # Get OCR text if not provided
        if ocr_text is None:
            ocr_result = await ocr_service.extract_text(image_path)
            if not ocr_result.get("error"):
                ocr_text = ocr_result.get("text", "")
            else:
                ocr_text = ""

        default_query = query or f"Analyze this screenshot with the following extracted text: '{ocr_text}'. Describe the UI elements, identify any buttons or interactive components, and suggest what automation actions might be possible."

        request = AIRequest(
            prompt=default_query,
            system_prompt="You are a computer vision and mobile automation expert. Analyze screenshots and provide actionable automation suggestions.",
            metadata={"image_path": image_path, "ocr_text": ocr_text}
        )

        return await self.generate_response(request)

    async def suggest_automation_enhanced(
        self,
        goal: str,
        current_state: str = None,
        screenshot_path: str = None,
        available_tools: List[str] = None
    ) -> AIResponse:
        """Enhanced automation step suggestions with visual analysis"""

        prompt_parts = [f"Goal: {goal}"]

        if current_state:
            prompt_parts.append(f"Current state: {current_state}")

        if available_tools:
            prompt_parts.append(f"Available tools: {', '.join(available_tools)}")

        prompt = "\n\n".join(prompt_parts) + """

Please suggest specific automation steps to achieve this goal. Include:
1. ADB commands with exact coordinates when possible
2. Timing considerations and delays
3. Verification steps
4. Alternative approaches if the primary method fails

Format your response as JSON with this structure:
{
  "steps": [
    {
      "action": "description",
      "command": "adb command if applicable",
      "coordinates": {"x": 0, "y": 0},
      "delay": 0.5,
      "verification": "how to verify success"
    }
  ],
  "alternatives": ["alternative approaches"],
  "risks": ["potential issues"]
}
"""

        metadata = {
            "goal": goal,
            "current_state": current_state,
            "screenshot_path": screenshot_path,
            "available_tools": available_tools or []
        }

        request = AIRequest(
            prompt=prompt,
            system_prompt="You are an Android automation expert. Provide structured, actionable automation plans.",
            response_format=ResponseFormat.JSON,
            metadata=metadata
        )

        return await self.generate_response_with_fallback(request)

# Global enhanced AI service instance
enhanced_ai_service = EnhancedAIService()