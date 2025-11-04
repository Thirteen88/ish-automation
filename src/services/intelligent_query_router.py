"""
Intelligent Query Router for ISH Chat System

This service provides intelligent routing of AI queries based on:
- Query complexity and type analysis
- Model specialization matching
- Performance-based routing
- Cost optimization
- Real-time failover and circuit breaker patterns
"""

import asyncio
import json
import logging
import re
import hashlib
import time
from datetime import datetime, timedelta
from typing import Dict, Any, List, Optional, Tuple, Set, Union
from dataclasses import dataclass, field, asdict
from enum import Enum
from abc import ABC, abstractmethod
import statistics
import math

from ..models.instance_manager import (
    AIInstance, ProviderType, InstanceStatus, RequestLog
)
from ..database.database import get_db
from .instance_manager_service import InstanceManagerService, LoadBalancingStrategy

logger = logging.getLogger(__name__)

class QueryType(Enum):
    """Query classification types"""
    SIMPLE_QA = "simple_qa"           # Basic Q&A, single-turn
    COMPLEX_REASONING = "complex_reasoning"  # Multi-step reasoning, analysis
    CODE_GENERATION = "code_generation"      # Programming tasks
    CREATIVE_WRITING = "creative_writing"    # Creative content
    DATA_ANALYSIS = "data_analysis"          # Data processing, math
    TRANSLATION = "translation"              # Language translation
    SUMMARIZATION = "summarization"          # Text summarization
    RESEARCH = "research"                    # Research queries
    CHINESE_CONTENT = "chinese_content"      # Chinese language content
    MULTIMODAL = "multimodal"               # Image/document analysis
    AUTOMATION = "automation"                # Android automation tasks
    GENERAL = "general"                      # General purpose

class QueryComplexity(Enum):
    """Query complexity levels"""
    VERY_LOW = 1    # Simple factual questions
    LOW = 2         # Basic reasoning
    MEDIUM = 3      # Multi-step reasoning
    HIGH = 4        # Complex analysis
    VERY_HIGH = 5   # Advanced reasoning, research

class RoutingStrategy(Enum):
    """Routing strategies"""
    PERFORMANCE = "performance"      # Route based on performance metrics
    COST = "cost"                   # Route based on cost efficiency
    SPECIALIZATION = "specialization" # Route based on model specialization
    BALANCED = "balanced"           # Balance performance, cost, specialization
    ROUND_ROBIN = "round_robin"     # Simple round-robin
    PREDICTIVE = "predictive"       # ML-based prediction (future)

@dataclass
class QueryAnalysis:
    """Result of query analysis"""
    query_id: str
    original_query: str
    query_type: QueryType
    complexity: QueryComplexity
    estimated_tokens: int
    language: str
    requires_code: bool = False
    requires_reasoning: bool = False
    requires_creativity: bool = False
    requires_data_analysis: bool = False
    requires_automation: bool = False
    confidence_score: float = 0.0
    processing_time_ms: float = 0.0
    metadata: Dict[str, Any] = field(default_factory=dict)

@dataclass
class RoutingDecision:
    """Routing decision result"""
    query_analysis: QueryAnalysis
    selected_instance: AIInstance
    routing_strategy: RoutingStrategy
    decision_reason: str
    confidence_score: float
    alternative_instances: List[AIInstance]
    estimated_cost: float
    estimated_response_time: float
    routing_time_ms: float = 0.0
    metadata: Dict[str, Any] = field(default_factory=dict)

@dataclass
class ModelSpecialization:
    """Model specialization information"""
    provider_type: ProviderType
    model_name: str
    strengths: List[QueryType]
    weaknesses: List[QueryType]
    cost_per_1k_tokens: float
    average_response_time: float
    quality_score: float
    max_tokens: int
    supports_streaming: bool
    supports_functions: bool

@dataclass
class PerformanceMetrics:
    """Performance metrics for routing decisions"""
    total_requests: int = 0
    successful_requests: int = 0
    average_response_time: float = 0.0
    average_cost: float = 0.0
    user_satisfaction: float = 0.0
    error_rate: float = 0.0
    timeout_rate: float = 0.0
    last_updated: datetime = field(default_factory=datetime.utcnow)

class CircuitBreakerState(Enum):
    """Circuit breaker states"""
    CLOSED = "closed"       # Normal operation
    OPEN = "open"          # Circuit is open, failing fast
    HALF_OPEN = "half_open" # Testing if service has recovered

@dataclass
class CircuitBreaker:
    """Circuit breaker for instance failure management"""
    state: CircuitBreakerState = CircuitBreakerState.CLOSED
    failure_count: int = 0
    last_failure_time: datetime = field(default_factory=datetime.utcnow)
    success_count: int = 0
    timeout: int = 60  # seconds to wait before trying again
    failure_threshold: int = 5
    success_threshold: int = 3

class QueryClassifier:
    """Analyzes queries to determine type and complexity"""
    
    def __init__(self):
        self.indicators = {
            QueryType.CODE_GENERATION: [
                r'\b(code|program|function|script|algorithm|debug)\b',
                r'\b(python|java|javascript|cpp|html|css)\b',
                r'\b(for|while|if.*else|def|class|import)\b',
                r'\b(write.*code|create.*function|implement)\b'
            ],
            QueryType.CHINESE_CONTENT: [
                r'[\u4e00-\u9fff]',  # Chinese characters
                r'\b中文|汉语|汉字\b'
            ],
            QueryType.TRANSLATION: [
                r'\b(translate|translation|翻译|译成)\b',
                r'\b(from.*to|in.*language)\b'
            ],
            QueryType.DATA_ANALYSIS: [
                r'\b(analyze|calculate|compute|statistics|graph)\b',
                r'\b(data|numbers|percentage|average)\b',
                r'\b(chart|plot|visualize)\b'
            ],
            QueryType.CREATIVE_WRITING: [
                r'\b(write|create|story|poem|creative)\b',
                r'\b(imagine|design|compose|draft)\b'
            ],
            QueryType.SUMMARIZATION: [
                r'\b(summarize|summary|brief|concise)\b',
                r'\b(in.*short|key.*points|overview)\b'
            ],
            QueryType.RESEARCH: [
                r'\b(research|study|investigate|find.*information)\b',
                r'\b(recent|latest|current.*state|survey)\b'
            ],
            QueryType.AUTOMATION: [
                r'\b(automation|adb|android|app.*test)\b',
                r'\b(tap|swipe|click|scroll|screenshot)\b',
                r'\b(ish\.chat|mobile.*automation)\b'
            ]
        }
        
        self.complexity_indicators = {
            QueryComplexity.VERY_LOW: [
                r'^\w+$',  # Single word
                r'\b(what|who|where|when|why|how)\b.+?\?',  # Simple questions
                r'^.{1,20}$'  # Very short queries
            ],
            QueryComplexity.LOW: [
                r'\b(explain|describe|define)\b',
                r'^.{21,100}$'  # Short to medium queries
            ],
            QueryComplexity.MEDIUM: [
                r'\b(compare|contrast|difference)\b',
                r'\b(steps|process|how.*to)\b',
                r'^.{101,300}$'  # Medium queries
            ],
            QueryComplexity.HIGH: [
                r'\b(analyze|evaluate|synthesize)\b',
                r'\b(multiple|several|various)\b',
                r'^.{301,600}$'  # Long queries
            ],
            QueryComplexity.VERY_HIGH: [
                r'\b(comprehensive|thorough|detailed)\b',
                r'\b(research.*paper|technical.*analysis)\b',
                r'^.{600,}$'  # Very long queries
            ]
        }

    async def analyze_query(self, query: str, metadata: Dict[str, Any] = None) -> QueryAnalysis:
        """Analyze query and return classification"""
        start_time = time.time()
        
        query_id = hashlib.md5(f"{query}{time.time()}".encode()).hexdigest()[:16]
        
        # Basic preprocessing
        cleaned_query = query.strip().lower()
        
        # Determine query type
        query_type = self._classify_query_type(query, cleaned_query)
        
        # Determine complexity
        complexity = self._classify_complexity(query, cleaned_query)
        
        # Estimate tokens
        estimated_tokens = self._estimate_tokens(query)
        
        # Detect language
        language = self._detect_language(query)
        
        # Check for specific requirements
        requires_code = self._requires_code(query, query_type)
        requires_reasoning = self._requires_reasoning(query, query_type, complexity)
        requires_creativity = self._requires_creativity(query, query_type)
        requires_data_analysis = self._requires_data_analysis(query, query_type)
        requires_automation = self._requires_automation(query, query_type)
        
        # Calculate confidence score
        confidence_score = self._calculate_confidence(query_type, complexity, query)
        
        processing_time = (time.time() - start_time) * 1000
        
        return QueryAnalysis(
            query_id=query_id,
            original_query=query,
            query_type=query_type,
            complexity=complexity,
            estimated_tokens=estimated_tokens,
            language=language,
            requires_code=requires_code,
            requires_reasoning=requires_reasoning,
            requires_creativity=requires_creativity,
            requires_data_analysis=requires_data_analysis,
            requires_automation=requires_automation,
            confidence_score=confidence_score,
            processing_time_ms=processing_time,
            metadata=metadata or {}
        )

    def _classify_query_type(self, original: str, cleaned: str) -> QueryType:
        """Classify query type based on patterns"""
        scores = {}
        
        for query_type, patterns in self.indicators.items():
            score = 0
            for pattern in patterns:
                matches = re.findall(pattern, original, re.IGNORECASE)
                score += len(matches)
            scores[query_type] = score
        
        # Special case: Chinese content detection
        if re.search(r'[\u4e00-\u9fff]', original):
            scores[QueryType.CHINESE_CONTENT] = scores.get(QueryType.CHINESE_CONTENT, 0) + 2
        
        # Get the type with highest score
        if scores and max(scores.values()) > 0:
            best_type = max(scores, key=scores.get)
            # Add a threshold to avoid over-classification
            if scores[best_type] >= 1:
                return best_type
        
        return QueryType.GENERAL

    def _classify_complexity(self, original: str, cleaned: str) -> QueryComplexity:
        """Classify query complexity"""
        scores = {}
        
        for complexity, patterns in self.complexity_indicators.items():
            score = 0
            for pattern in patterns:
                if re.search(pattern, original, re.IGNORECASE):
                    score += 1
            scores[complexity] = score
        
        # Length-based complexity
        length = len(original)
        if length <= 20:
            scores[QueryComplexity.VERY_LOW] = scores.get(QueryComplexity.VERY_LOW, 0) + 1
        elif length <= 100:
            scores[QueryComplexity.LOW] = scores.get(QueryComplexity.LOW, 0) + 1
        elif length <= 300:
            scores[QueryComplexity.MEDIUM] = scores.get(QueryComplexity.MEDIUM, 0) + 1
        elif length <= 600:
            scores[QueryComplexity.HIGH] = scores.get(QueryComplexity.HIGH, 0) + 1
        else:
            scores[QueryComplexity.VERY_HIGH] = scores.get(QueryComplexity.VERY_HIGH, 0) + 1
        
        # Question-based complexity
        if re.search(r'\b(why|how)\b', original, re.IGNORECASE):
            scores[QueryComplexity.MEDIUM] = scores.get(QueryComplexity.MEDIUM, 0) + 1
        
        if re.search(r'\b(analyze|evaluate|compare|synthesize)\b', original, re.IGNORECASE):
            scores[QueryComplexity.HIGH] = scores.get(QueryComplexity.HIGH, 0) + 2
        
        if scores:
            return max(scores, key=scores.get)
        
        return QueryComplexity.MEDIUM

    def _estimate_tokens(self, query: str) -> int:
        """Estimate token count for a query"""
        # Rough estimation: ~4 characters per token for English, ~1.5 for Chinese
        chinese_chars = len(re.findall(r'[\u4e00-\u9fff]', query))
        english_chars = len(query) - chinese_chars
        
        estimated_tokens = math.ceil(english_chars / 4 + chinese_chars / 1.5)
        
        # Add buffer for response (usually 2-3x input)
        estimated_tokens = int(estimated_tokens * 2.5)
        
        return max(50, estimated_tokens)  # Minimum 50 tokens

    def _detect_language(self, query: str) -> str:
        """Detect primary language of query"""
        chinese_chars = len(re.findall(r'[\u4e00-\u9fff]', query))
        total_chars = len(query.replace(' ', ''))
        
        if chinese_chars / max(total_chars, 1) > 0.3:
            return "chinese"
        
        # Add more language detection as needed
        return "english"

    def _requires_code(self, query: str, query_type: QueryType) -> bool:
        """Check if query requires code generation"""
        return (query_type == QueryType.CODE_GENERATION or
                bool(re.search(r'\b(code|program|function|script)\b', query, re.IGNORECASE)))

    def _requires_reasoning(self, query: str, query_type: QueryType, complexity: QueryComplexity) -> bool:
        """Check if query requires complex reasoning"""
        return (complexity in [QueryComplexity.MEDIUM, QueryComplexity.HIGH, QueryComplexity.VERY_HIGH] or
                query_type in [QueryType.COMPLEX_REASONING, QueryType.RESEARCH] or
                bool(re.search(r'\b(analyze|evaluate|compare|why|how)\b', query, re.IGNORECASE)))

    def _requires_creativity(self, query: str, query_type: QueryType) -> bool:
        """Check if query requires creative response"""
        return (query_type == QueryType.CREATIVE_WRITING or
                bool(re.search(r'\b(create|design|imagine|story|poem)\b', query, re.IGNORECASE)))

    def _requires_data_analysis(self, query: str, query_type: QueryType) -> bool:
        """Check if query requires data analysis"""
        return (query_type == QueryType.DATA_ANALYSIS or
                bool(re.search(r'\b(analyze|calculate|statistics|data)\b', query, re.IGNORECASE)))

    def _requires_automation(self, query: str, query_type: QueryType) -> bool:
        """Check if query relates to automation"""
        return (query_type == QueryType.AUTOMATION or
                bool(re.search(r'\b(automation|adb|android|tap|swipe|ish\.chat)\b', query, re.IGNORECASE)))

    def _calculate_confidence(self, query_type: QueryType, complexity: QueryComplexity, query: str) -> float:
        """Calculate confidence score for classification"""
        base_confidence = 0.7
        
        # Increase confidence for clear patterns
        if query_type != QueryType.GENERAL:
            base_confidence += 0.2
        
        # Length-based confidence
        if len(query) > 50:
            base_confidence += 0.1
        
        return min(1.0, base_confidence)

class ModelSpecializationRegistry:
    """Registry for model specializations and capabilities"""
    
    def __init__(self):
        self.specializations = self._initialize_specializations()

    def _initialize_specializations(self) -> Dict[str, ModelSpecialization]:
        """Initialize model specializations"""
        return {
            # ZAI (智谱AI) - Strong in Chinese content
            "zai_glm4": ModelSpecialization(
                provider_type=ProviderType.ZAI,
                model_name="glm-4",
                strengths=[QueryType.CHINESE_CONTENT, QueryType.GENERAL, QueryType.SIMPLE_QA],
                weaknesses=[QueryType.CODE_GENERATION, QueryType.MULTIMODAL],
                cost_per_1k_tokens=0.01,
                average_response_time=800,
                quality_score=0.85,
                max_tokens=8000,
                supports_streaming=True,
                supports_functions=False
            ),
            
            # OpenAI GPT-4 - Strong general purpose and reasoning
            "openai_gpt4": ModelSpecialization(
                provider_type=ProviderType.OPENAI,
                model_name="gpt-4",
                strengths=[QueryType.COMPLEX_REASONING, QueryType.CODE_GENERATION, 
                          QueryType.DATA_ANALYSIS, QueryType.RESEARCH],
                weaknesses=[QueryType.CHINESE_CONTENT],  # Not as strong as ZAI for Chinese
                cost_per_1k_tokens=0.03,
                average_response_time=1200,
                quality_score=0.95,
                max_tokens=8000,
                supports_streaming=True,
                supports_functions=True
            ),
            
            # OpenAI GPT-3.5 - Cost-effective for simple tasks
            "openai_gpt35": ModelSpecialization(
                provider_type=ProviderType.OPENAI,
                model_name="gpt-3.5-turbo",
                strengths=[QueryType.SIMPLE_QA, QueryType.TRANSLATION, QueryType.SUMMARIZATION],
                weaknesses=[QueryType.COMPLEX_REASONING, QueryType.CODE_GENERATION],
                cost_per_1k_tokens=0.002,
                average_response_time=600,
                quality_score=0.80,
                max_tokens=4000,
                supports_streaming=True,
                supports_functions=True
            ),
            
            # Anthropic Claude - Strong in analysis and creative writing
            "anthropic_claude": ModelSpecialization(
                provider_type=ProviderType.ANTHROPIC,
                model_name="claude-3-sonnet-20240229",
                strengths=[QueryType.COMPLEX_REASONING, QueryType.CREATIVE_WRITING, 
                          QueryType.DATA_ANALYSIS, QueryType.RESEARCH],
                weaknesses=[QueryType.CHINESE_CONTENT],
                cost_per_1k_tokens=0.015,
                average_response_time=1000,
                quality_score=0.92,
                max_tokens=4000,
                supports_streaming=False,
                supports_functions=True
            ),
            
            # Perplexity - Strong in research and current information
            "perplexity": ModelSpecialization(
                provider_type=ProviderType.PERPLEXITY,
                model_name="perplexity-online",
                strengths=[QueryType.RESEARCH, QueryType.DATA_ANALYSIS],
                weaknesses=[QueryType.CODE_GENERATION, QueryType.AUTOMATION],
                cost_per_1k_tokens=0.02,
                average_response_time=2000,
                quality_score=0.88,
                max_tokens=4000,
                supports_streaming=False,
                supports_functions=False
            )
        }

    def get_specialization(self, provider_type: ProviderType, model_name: str) -> Optional[ModelSpecialization]:
        """Get model specialization"""
        key = f"{provider_type.value}_{model_name}"
        return self.specializations.get(key)

    def get_best_models_for_query_type(self, query_type: QueryType) -> List[ModelSpecialization]:
        """Get best models for a specific query type"""
        suitable_models = []
        
        for spec in self.specializations.values():
            if query_type in spec.strengths:
                suitable_models.append(spec)
        
        # Sort by quality score and cost efficiency
        suitable_models.sort(key=lambda x: (x.quality_score, -x.cost_per_1k_tokens), reverse=True)
        
        return suitable_models

class IntelligentQueryRouter:
    """Main intelligent query routing service"""
    
    def __init__(self, instance_manager: InstanceManagerService, redis_client=None):
        self.instance_manager = instance_manager
        self.classifier = QueryClassifier()
        self.specialization_registry = ModelSpecializationRegistry()
        self.redis_client = redis_client
        
        # Circuit breakers for each instance
        self.circuit_breakers: Dict[str, CircuitBreaker] = {}
        
        # Performance metrics for routing optimization
        self.routing_metrics: Dict[str, PerformanceMetrics] = {}
        
        # Routing configuration
        self.default_strategy = RoutingStrategy.BALANCED
        self.max_alternatives = 3
        self.routing_timeout = 100  # ms
        
        # Cache for recent routing decisions
        self.routing_cache: Dict[str, RoutingDecision] = {}
        self.cache_ttl = 300  # 5 minutes

    async def route_query(
        self,
        query: str,
        preferred_provider: Optional[str] = None,
        strategy: Optional[RoutingStrategy] = None,
        metadata: Dict[str, Any] = None
    ) -> RoutingDecision:
        """Route a query to the optimal AI instance"""
        start_time = time.time()
        
        try:
            # Analyze the query
            query_analysis = await self.classifier.analyze_query(query, metadata)
            
            # Check cache first
            cache_key = self._generate_cache_key(query_analysis, strategy)
            if cache_key in self.routing_cache:
                cached_decision = self.routing_cache[cache_key]
                if time.time() - cached_decision.routing_time_ms / 1000 < self.cache_ttl:
                    logger.info(f"Using cached routing decision for query {query_analysis.query_id}")
                    return cached_decision
            
            # Get routing strategy
            routing_strategy = strategy or self.default_strategy
            
            # Select optimal instance
            routing_decision = await self._select_optimal_instance(
                query_analysis, routing_strategy, preferred_provider
            )
            
            # Update routing time
            routing_decision.routing_time_ms = (time.time() - start_time) * 1000
            
            # Cache the decision
            self.routing_cache[cache_key] = routing_decision
            
            # Log the routing decision
            await self._log_routing_decision(routing_decision)
            
            return routing_decision
            
        except Exception as e:
            logger.error(f"Error routing query: {str(e)}")
            # Fallback to simple round-robin
            return await self._fallback_routing(query, str(e))

    async def _select_optimal_instance(
        self,
        query_analysis: QueryAnalysis,
        strategy: RoutingStrategy,
        preferred_provider: Optional[str] = None
    ) -> RoutingDecision:
        """Select the optimal instance based on strategy"""
        
        # Get available instances
        available_instances = await self._get_available_instances(
            query_analysis, preferred_provider
        )
        
        if not available_instances:
            raise ValueError("No available instances for routing")
        
        # Apply routing strategy
        if strategy == RoutingStrategy.PERFORMANCE:
            selected_instance, reason = await self._route_by_performance(
                available_instances, query_analysis
            )
        elif strategy == RoutingStrategy.COST:
            selected_instance, reason = await self._route_by_cost(
                available_instances, query_analysis
            )
        elif strategy == RoutingStrategy.SPECIALIZATION:
            selected_instance, reason = await self._route_by_specialization(
                available_instances, query_analysis
            )
        elif strategy == RoutingStrategy.BALANCED:
            selected_instance, reason = await self._route_balanced(
                available_instances, query_analysis
            )
        else:  # ROUND_ROBIN or default
            selected_instance, reason = await self._route_round_robin(
                available_instances, query_analysis
            )
        
        # Get alternative instances
        alternatives = [inst for inst in available_instances 
                       if inst.instance_id != selected_instance.instance_id][:self.max_alternatives]
        
        # Calculate estimated cost and response time
        estimated_cost = self._estimate_cost(selected_instance, query_analysis)
        estimated_response_time = self._estimate_response_time(selected_instance, query_analysis)
        
        # Calculate confidence score
        confidence_score = self._calculate_routing_confidence(
            selected_instance, query_analysis, strategy
        )
        
        return RoutingDecision(
            query_analysis=query_analysis,
            selected_instance=selected_instance,
            routing_strategy=strategy,
            decision_reason=reason,
            confidence_score=confidence_score,
            alternative_instances=alternatives,
            estimated_cost=estimated_cost,
            estimated_response_time=estimated_response_time,
            metadata={"strategy": strategy.value}
        )

    async def _get_available_instances(
        self,
        query_analysis: QueryAnalysis,
        preferred_provider: Optional[str] = None
    ) -> List[AIInstance]:
        """Get list of available instances filtered by circuit breakers"""
        
        # Get database session
        db = next(get_db())
        
        try:
            # Build criteria for instance selection
            from .instance_manager_service import InstanceSelectionCriteria
            
            criteria = InstanceSelectionCriteria(
                provider_type=preferred_provider,
                min_health_score=0.5,  # Lower threshold for more options
                require_active=True,
                exclude_maintenance=True
            )
            
            # Get instances from instance manager
            load_balancing_result = await self.instance_manager.select_instance_for_request(
                db, criteria, LoadBalancingStrategy.HEALTH_BASED
            )
            
            # Filter by circuit breaker status
            available_instances = []
            for instance in [load_balancing_result.selected_instance] + load_balancing_result.alternative_instances:
                if self._is_instance_available(instance):
                    available_instances.append(instance)
            
            return available_instances
            
        finally:
            db.close()

    def _is_instance_available(self, instance: AIInstance) -> bool:
        """Check if instance is available (not circuit broken)"""
        circuit_breaker = self.circuit_breakers.get(instance.instance_id)
        
        if not circuit_breaker:
            return True
        
        # Check circuit breaker state
        if circuit_breaker.state == CircuitBreakerState.OPEN:
            # Check if timeout has passed
            if time.time() - circuit_breaker.last_failure_time.timestamp() > circuit_breaker.timeout:
                circuit_breaker.state = CircuitBreakerState.HALF_OPEN
                logger.info(f"Circuit breaker for {instance.instance_id} moved to HALF_OPEN")
                return True
            return False
        
        return True

    async def _route_by_performance(
        self,
        instances: List[AIInstance],
        query_analysis: QueryAnalysis
    ) -> Tuple[AIInstance, str]:
        """Route based on performance metrics"""
        
        best_instance = None
        best_score = -1
        
        for instance in instances:
            # Calculate performance score
            score = 0
            
            # Success rate (40% weight)
            score += (instance.success_rate / 100) * 0.4
            
            # Response time (30% weight) - lower is better
            if instance.average_response_time > 0:
                rt_score = max(0, 1 - (instance.average_response_time / 5000))
                score += rt_score * 0.3
            
            # Current load (20% weight) - lower is better
            if instance.max_concurrent_requests > 0:
                load_score = max(0, 1 - (instance.current_load / instance.max_concurrent_requests))
                score += load_score * 0.2
            
            # Health status (10% weight)
            if instance.is_healthy:
                score += 0.1
            
            if score > best_score:
                best_score = score
                best_instance = instance
        
        reason = f"Performance-based routing (score: {best_score:.3f})"
        return best_instance, reason

    async def _route_by_cost(
        self,
        instances: List[AIInstance],
        query_analysis: QueryAnalysis
    ) -> Tuple[AIInstance, str]:
        """Route based on cost efficiency"""
        
        best_instance = None
        best_cost = float('inf')
        
        for instance in instances:
            specialization = self.specialization_registry.get_specialization(
                instance.provider_type, instance.model_name
            )
            
            if specialization:
                estimated_cost = self._estimate_cost(instance, query_analysis)
                if estimated_cost < best_cost:
                    best_cost = estimated_cost
                    best_instance = instance
        
        if not best_instance:
            # Fallback to first instance
            best_instance = instances[0]
            best_cost = self._estimate_cost(best_instance, query_analysis)
        
        reason = f"Cost-based routing (estimated cost: ${best_cost:.4f})"
        return best_instance, reason

    async def _route_by_specialization(
        self,
        instances: List[AIInstance],
        query_analysis: QueryAnalysis
    ) -> Tuple[AIInstance, str]:
        """Route based on model specialization"""
        
        # Get best models for this query type
        suitable_models = self.specialization_registry.get_best_models_for_query_type(
            query_analysis.query_type
        )
        
        # Find instances matching suitable models
        for model_spec in suitable_models:
            for instance in instances:
                if (instance.provider_type == model_spec.provider_type and 
                    instance.model_name == model_spec.model_name):
                    reason = f"Specialization-based routing (model: {instance.model_name} excels at {query_analysis.query_type.value})"
                    return instance, reason
        
        # Fallback to performance routing
        return await self._route_by_performance(instances, query_analysis)

    async def _route_balanced(
        self,
        instances: List[AIInstance],
        query_analysis: QueryAnalysis
    ) -> Tuple[AIInstance, str]:
        """Balance performance, cost, and specialization"""
        
        best_instance = None
        best_score = -1
        
        for instance in instances:
            score = 0
            
            # Specialization score (40% weight)
            specialization = self.specialization_registry.get_specialization(
                instance.provider_type, instance.model_name
            )
            if specialization:
                if query_analysis.query_type in specialization.strengths:
                    score += specialization.quality_score * 0.4
                elif query_analysis.query_type in specialization.weaknesses:
                    score -= 0.2  # Penalty for weak areas
            
            # Performance score (30% weight)
            score += (instance.success_rate / 100) * 0.3
            
            # Cost score (20% weight) - lower cost is better
            if specialization:
                cost_score = max(0, 1 - (specialization.cost_per_1k_tokens / 0.05))
                score += cost_score * 0.2
            
            # Load score (10% weight)
            if instance.max_concurrent_requests > 0:
                load_score = max(0, 1 - (instance.current_load / instance.max_concurrent_requests))
                score += load_score * 0.1
            
            if score > best_score:
                best_score = score
                best_instance = instance
        
        reason = f"Balanced routing (score: {best_score:.3f})"
        return best_instance, reason

    async def _route_round_robin(
        self,
        instances: List[AIInstance],
        query_analysis: QueryAnalysis
    ) -> Tuple[AIInstance, str]:
        """Simple round-robin routing"""
        
        # Simple round-robin based on hash of query ID
        index = hash(query_analysis.query_id) % len(instances)
        selected_instance = instances[index]
        
        reason = f"Round-robin routing (index: {index})"
        return selected_instance, reason

    def _estimate_cost(self, instance: AIInstance, query_analysis: QueryAnalysis) -> float:
        """Estimate cost for the query"""
        specialization = self.specialization_registry.get_specialization(
            instance.provider_type, instance.model_name
        )
        
        if not specialization:
            return 0.01  # Default cost
        
        estimated_tokens = query_analysis.estimated_tokens
        cost = (estimated_tokens / 1000) * specialization.cost_per_1k_tokens
        
        return cost

    def _estimate_response_time(self, instance: AIInstance, query_analysis: QueryAnalysis) -> float:
        """Estimate response time for the query"""
        specialization = self.specialization_registry.get_specialization(
            instance.provider_type, instance.model_name
        )
        
        if specialization:
            base_time = specialization.average_response_time
            
            # Adjust based on query complexity
            complexity_multiplier = 1.0 + (query_analysis.complexity.value - 1) * 0.2
            
            # Adjust based on instance current load
            load_multiplier = 1.0 + (instance.current_load / max(instance.max_concurrent_requests, 1)) * 0.5
            
            return base_time * complexity_multiplier * load_multiplier
        
        # Fallback to instance's average response time
        return instance.average_response_time or 1000

    def _calculate_routing_confidence(
        self,
        instance: AIInstance,
        query_analysis: QueryAnalysis,
        strategy: RoutingStrategy
    ) -> float:
        """Calculate confidence score for routing decision"""
        
        base_confidence = 0.7
        
        # Boost confidence for specialized matches
        specialization = self.specialization_registry.get_specialization(
            instance.provider_type, instance.model_name
        )
        if specialization and query_analysis.query_type in specialization.strengths:
            base_confidence += 0.2
        
        # Boost confidence for healthy instances
        if instance.is_healthy and instance.success_rate > 80:
            base_confidence += 0.1
        
        return min(1.0, base_confidence)

    def _generate_cache_key(self, query_analysis: QueryAnalysis, strategy: Optional[RoutingStrategy]) -> str:
        """Generate cache key for routing decision"""
        key_parts = [
            query_analysis.query_type.value,
            str(query_analysis.complexity.value),
            query_analysis.language,
            str(strategy.value if strategy else self.default_strategy.value)
        ]
        return hashlib.md5("|".join(key_parts).encode()).hexdigest()[:16]

    async def _log_routing_decision(self, decision: RoutingDecision):
        """Log routing decision for analytics"""
        if self.redis_client:
            log_entry = {
                "timestamp": datetime.utcnow().isoformat(),
                "query_id": decision.query_analysis.query_id,
                "query_type": decision.query_analysis.query_type.value,
                "complexity": decision.query_analysis.complexity.value,
                "selected_instance": decision.selected_instance.instance_id,
                "provider": decision.selected_instance.provider_type,
                "model": decision.selected_instance.model_name,
                "strategy": decision.routing_strategy.value,
                "confidence": decision.confidence_score,
                "estimated_cost": decision.estimated_cost,
                "routing_time_ms": decision.routing_time_ms
            }
            
            # Store in Redis for analytics
            await self.redis_client.lpush(
                "routing_decisions",
                json.dumps(log_entry)
            )
            
            # Keep only last 1000 entries
            await self.redis_client.ltrim("routing_decisions", 0, 999)

    async def _fallback_routing(self, query: str, error: str) -> RoutingDecision:
        """Fallback routing when main routing fails"""
        
        # Create a basic query analysis
        query_analysis = QueryAnalysis(
            query_id=hashlib.md5(f"fallback_{query}{time.time()}".encode()).hexdigest()[:16],
            original_query=query,
            query_type=QueryType.GENERAL,
            complexity=QueryComplexity.MEDIUM,
            estimated_tokens=100,
            language="english",
            confidence_score=0.5,
            metadata={"fallback": True, "error": error}
        )
        
        # Get any available instance
        db = next(get_db())
        try:
            instances = await self.instance_manager.list_instances(db, is_healthy=True)
            if instances:
                selected_instance = instances[0]
            else:
                # Create a dummy instance for error case
                selected_instance = AIInstance(
                    instance_id="fallback",
                    provider_type=ProviderType.OPENAI,
                    model_name="gpt-3.5-turbo",
                    instance_name="Fallback Instance",
                    endpoint_url="https://api.openai.com/v1"
                )
        finally:
            db.close()
        
        return RoutingDecision(
            query_analysis=query_analysis,
            selected_instance=selected_instance,
            routing_strategy=RoutingStrategy.ROUND_ROBIN,
            decision_reason=f"Fallback routing due to error: {error}",
            confidence_score=0.3,
            alternative_instances=[],
            estimated_cost=0.01,
            estimated_response_time=1000,
            metadata={"fallback": True, "error": error}
        )

    async def update_routing_metrics(self, instance_id: str, success: bool, response_time: float, cost: float):
        """Update routing metrics based on actual request results"""
        
        if instance_id not in self.routing_metrics:
            self.routing_metrics[instance_id] = PerformanceMetrics()
        
        metrics = self.routing_metrics[instance_id]
        metrics.total_requests += 1
        
        if success:
            metrics.successful_requests += 1
        
        # Update average response time
        if metrics.total_requests == 1:
            metrics.average_response_time = response_time
        else:
            metrics.average_response_time = (
                (metrics.average_response_time * (metrics.total_requests - 1) + response_time) /
                metrics.total_requests
            )
        
        # Update average cost
        if metrics.total_requests == 1:
            metrics.average_cost = cost
        else:
            metrics.average_cost = (
                (metrics.average_cost * (metrics.total_requests - 1) + cost) /
                metrics.total_requests
            )
        
        # Update error rate
        metrics.error_rate = ((metrics.total_requests - metrics.successful_requests) / 
                             metrics.total_requests) * 100
        
        metrics.last_updated = datetime.utcnow()
        
        # Update circuit breaker
        await self._update_circuit_breaker(instance_id, success)

    async def _update_circuit_breaker(self, instance_id: str, success: bool):
        """Update circuit breaker state based on request result"""
        
        if instance_id not in self.circuit_breakers:
            self.circuit_breakers[instance_id] = CircuitBreaker()
        
        circuit_breaker = self.circuit_breakers[instance_id]
        
        if success:
            circuit_breaker.failure_count = 0
            if circuit_breaker.state == CircuitBreakerState.HALF_OPEN:
                circuit_breaker.success_count += 1
                if circuit_breaker.success_count >= circuit_breaker.success_threshold:
                    circuit_breaker.state = CircuitBreakerState.CLOSED
                    logger.info(f"Circuit breaker for {instance_id} closed - service recovered")
        else:
            circuit_breaker.failure_count += 1
            circuit_breaker.last_failure_time = datetime.utcnow()
            
            if (circuit_breaker.state == CircuitBreakerState.CLOSED and 
                circuit_breaker.failure_count >= circuit_breaker.failure_threshold):
                circuit_breaker.state = CircuitBreakerState.OPEN
                logger.warning(f"Circuit breaker for {instance_id} opened - too many failures")

    async def get_routing_statistics(self) -> Dict[str, Any]:
        """Get routing statistics for monitoring"""
        
        total_decisions = len(self.routing_cache)
        strategy_counts = {}
        query_type_counts = {}
        
        for decision in self.routing_cache.values():
            # Count strategies
            strategy = decision.routing_strategy.value
            strategy_counts[strategy] = strategy_counts.get(strategy, 0) + 1
            
            # Count query types
            qtype = decision.query_analysis.query_type.value
            query_type_counts[qtype] = query_type_counts.get(qtype, 0) + 1
        
        # Circuit breaker status
        circuit_status = {}
        for instance_id, cb in self.circuit_breakers.items():
            circuit_status[instance_id] = {
                "state": cb.state.value,
                "failure_count": cb.failure_count,
                "last_failure": cb.last_failure_time.isoformat()
            }
        
        return {
            "total_routing_decisions": total_decisions,
            "strategy_distribution": strategy_counts,
            "query_type_distribution": query_type_counts,
            "circuit_breakers": circuit_status,
            "active_instances": len(self.routing_metrics),
            "cache_size": len(self.routing_cache)
        }

# Global router instance
intelligent_query_router = None

def get_intelligent_query_router(instance_manager: InstanceManagerService, redis_client=None) -> IntelligentQueryRouter:
    """Get or create global intelligent query router instance"""
    global intelligent_query_router
    if intelligent_query_router is None:
        intelligent_query_router = IntelligentQueryRouter(instance_manager, redis_client)
    return intelligent_query_router