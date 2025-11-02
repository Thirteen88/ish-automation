"""
External Agent Delegation System
Intelligent task classification and delegation to external AI agents via Perplexity
"""
import asyncio
import json
import logging
from typing import Dict, List, Optional, Any, Tuple
from datetime import datetime
from dataclasses import dataclass, field
from enum import Enum
from pathlib import Path
import subprocess
import os

logger = logging.getLogger(__name__)

class TaskComplexity(Enum):
    LOW = "low"
    MEDIUM = "medium"
    HIGH = "high"
    CRITICAL = "critical"

class TaskCategory(Enum):
    CODE_REVIEW = "code_review"
    DOCUMENTATION = "documentation"
    DEBUGGING = "debugging"
    ANALYSIS = "analysis"
    OPTIMIZATION = "optimization"
    TESTING = "testing"
    SECURITY = "security"
    CREATIVITY = "creativity"
    RESEARCH = "research"

@dataclass
class ExternalTask:
    """Task definition for external agent delegation"""
    task_id: str
    title: str
    description: str
    category: TaskCategory
    complexity: TaskComplexity
    context: Dict[str, Any] = field(default_factory=dict)
    priority: int = 1  # 1-5 scale
    estimated_time_minutes: int = 30
    required_tools: List[str] = field(default_factory=list)
    expected_output_format: str = "json"
    metadata: Dict[str, Any] = field(default_factory=dict)
    created_at: str = field(default_factory=lambda: datetime.now().isoformat())
    status: str = "pending"

@dataclass
class DelegationResult:
    """Result from external agent execution"""
    task_id: str
    agent_used: str
    success: bool
    execution_time_seconds: float
    result: Optional[Dict[str, Any]] = None
    error: Optional[str] = None
    quality_score: Optional[float] = None
    confidence: Optional[float] = None
    metadata: Dict[str, Any] = field(default_factory=dict)
    completed_at: str = field(default_factory=lambda: datetime.now().isoformat())

class ExternalAgentDelegator:
    """Main delegation system for external AI agents"""

    def __init__(self):
        self.task_queue = []
        self.completed_tasks = []
        self.delegation_history = []

        # External Agent Capabilities Matrix
        self.agent_capabilities = {
            "claude_opus_4_1_thinking": {
                "strengths": ["complex_reasoning", "detailed_analysis", "problem_solving"],
                "specialties": [TaskCategory.DEBUGGING, TaskCategory.ANALYSIS, TaskCategory.SECURITY],
                "complexity": [TaskComplexity.HIGH, TaskComplexity.CRITICAL],
                "estimated_speed": "medium",
                "access_method": "perplexity_app",
                "coordinates": {"model_selector": {"x": 800, "y": 1600}, "claude_opus_4_1": {"x": 540, "y": 1200}}
            },
            "gpt_5": {
                "strengths": ["creativity", "code_generation", "innovation"],
                "specialties": [TaskCategory.CREATIVITY, TaskCategory.CODE_REVIEW, TaskCategory.OPTIMIZATION],
                "complexity": [TaskComplexity.MEDIUM, TaskComplexity.HIGH],
                "estimated_speed": "fast",
                "access_method": "perplexity_app",
                "coordinates": {"model_selector": {"x": 800, "y": 1600}, "gpt_5": {"x": 540, "y": 1300}}
            },
            "gpt_5_thinking": {
                "strengths": ["structured_analysis", "methodical_thinking"],
                "specialties": [TaskCategory.ANALYSIS, TaskCategory.DOCUMENTATION, TaskCategory.TESTING],
                "complexity": [TaskComplexity.MEDIUM, TaskComplexity.HIGH],
                "estimated_speed": "medium",
                "access_method": "perplexity_app",
                "coordinates": {"model_selector": {"x": 800, "y": 1600}, "gpt_5_thinking": {"x": 540, "y": 1400}}
            },
            "o3_pro": {
                "strengths": ["research_level", "complex_problem_solving"],
                "specialties": [TaskCategory.RESEARCH, TaskCategory.DEBUGGING, TaskCategory.ANALYSIS],
                "complexity": [TaskComplexity.CRITICAL],
                "estimated_speed": "slow",
                "access_method": "perplexity_app",
                "coordinates": {"model_selector": {"x": 800, "y": 1600}, "o3_pro": {"x": 540, "y": 1500}}
            },
            "claude_sonnet_4_5_thinking": {
                "strengths": ["transparent_reasoning", "step_by_step"],
                "specialties": [TaskCategory.DEBUGGING, TaskCategory.DOCUMENTATION, TaskCategory.CODE_REVIEW],
                "complexity": [TaskComplexity.MEDIUM, TaskComplexity.HIGH],
                "estimated_speed": "medium",
                "access_method": "perplexity_app",
                "coordinates": {"model_selector": {"x": 800, "y": 1600}, "claude_sonnet_4_5_thinking": {"x": 540, "y": 1100}}
            },
            "zai": {
                "strengths": ["technical_implementation", "code_generation"],
                "specialties": [TaskCategory.CODE_REVIEW, TaskCategory.TESTING, TaskCategory.OPTIMIZATION],
                "complexity": [TaskComplexity.LOW, TaskComplexity.MEDIUM],
                "estimated_speed": "fast",
                "access_method": "ish_chat_api",
                "coordinates": None
            },
            "anthropic": {
                "strengths": ["analysis", "reasoning", "clarity"],
                "specialties": [TaskCategory.ANALYSIS, TaskCategory.DOCUMENTATION, TaskCategory.SECURITY],
                "complexity": [TaskComplexity.MEDIUM, TaskComplexity.HIGH],
                "estimated_speed": "medium",
                "access_method": "enhanced_ai_service",
                "coordinates": None
            }
        }

        # Task Complexity Detection Patterns
        self.complexity_keywords = {
            TaskComplexity.CRITICAL: ["critical", "urgent", "emergency", "security breach", "production down"],
            TaskComplexity.HIGH: ["complex", "architecture", "integration", "multiple systems", "research"],
            TaskComplexity.MEDIUM: ["optimize", "improve", "refactor", "feature", "enhancement"],
            TaskComplexity.LOW: ["review", "document", "test", "validate", "simple"]
        }

    def classify_task(self, task_description: str, context: Dict[str, Any] = None) -> Tuple[TaskCategory, TaskComplexity]:
        """Classify task by category and complexity"""
        # Determine category
        description_lower = task_description.lower()

        category_keywords = {
            TaskCategory.CODE_REVIEW: ["review", "audit", "inspect", "quality", "best practices"],
            TaskCategory.DOCUMENTATION: ["document", "explain", "guide", "manual", "api docs"],
            TaskCategory.DEBUGGING: ["debug", "fix", "error", "issue", "problem", "troubleshoot"],
            TaskCategory.ANALYSIS: ["analyze", "compare", "evaluate", "assess", "investigate"],
            TaskCategory.OPTIMIZATION: ["optimize", "improve", "enhance", "performance", "efficiency"],
            TaskCategory.TESTING: ["test", "validate", "verify", "coverage", "unit test"],
            TaskCategory.SECURITY: ["security", "vulnerability", "audit", "penetration", "risk"],
            TaskCategory.CREATIVITY: ["design", "create", "innovate", "brainstorm", "prototype"],
            TaskCategory.RESEARCH: ["research", "investigate", "study", "learn", "explore"]
        }

        # Find best matching category
        category = TaskCategory.ANALYSIS  # default
        max_matches = 0

        for cat, keywords in category_keywords.items():
            matches = sum(1 for keyword in keywords if keyword in description_lower)
            if matches > max_matches:
                category = cat
                max_matches = matches

        # Determine complexity
        complexity = TaskComplexity.MEDIUM  # default
        for comp, keywords in self.complexity_keywords.items():
            if any(keyword in description_lower for keyword in keywords):
                complexity = comp
                break

        # Consider context for complexity adjustment
        if context:
            if context.get("file_count", 0) > 10:
                complexity = max(complexity, TaskComplexity.HIGH)
            if context.get("systems_count", 0) > 3:
                complexity = max(complexity, TaskComplexity.HIGH)
            if context.get("priority") == "urgent":
                complexity = max(complexity, TaskComplexity.CRITICAL)

        return category, complexity

    def select_best_agent(self, task: ExternalTask) -> str:
        """Select the best agent for a given task"""
        suitable_agents = []

        for agent_name, capabilities in self.agent_capabilities.items():
            # Check if agent handles this task category
            if task.category in capabilities["specialties"]:
                # Check if agent can handle this complexity level
                if task.complexity in capabilities["complexity"]:
                    suitable_agents.append((agent_name, capabilities))

        if not suitable_agents:
            # Fallback to most versatile agent
            logger.warning(f"No agent suitable for {task.category}, falling back to Claude Opus 4.1 Thinking")
            return "claude_opus_4_1_thinking"

        # Rank agents by suitability
        best_agent = "claude_opus_4_1_thinking"
        best_score = 0

        for agent_name, capabilities in suitable_agents:
            score = 0

            # Preference for exact complexity match
            if task.complexity in capabilities["complexity"]:
                score += 3

            # Preference for category specialty
            if task.category in capabilities["specialties"]:
                score += 2

            # Speed preference for lower complexity tasks
            if task.complexity == TaskComplexity.LOW and capabilities["estimated_speed"] == "fast":
                score += 1
            elif task.complexity == TaskComplexity.CRITICAL and capabilities["estimated_speed"] == "slow":
                score += 1

            if score > best_score:
                best_score = score
                best_agent = agent_name

        return best_agent

    async def create_delegation_task(self, title: str, description: str,
                                   category: TaskCategory = None, complexity: TaskComplexity = None,
                                   context: Dict[str, Any] = None, priority: int = 1) -> str:
        """Create a new delegation task"""
        task_id = f"task_{len(self.task_queue) + 1}_{int(datetime.now().timestamp())}"

        # Auto-classify if not provided
        if category is None or complexity is None:
            auto_category, auto_complexity = self.classify_task(description, context or {})
            category = category or auto_category
            complexity = complexity or auto_complexity

        task = ExternalTask(
            task_id=task_id,
            title=title,
            description=description,
            category=category,
            complexity=complexity,
            context=context or {},
            priority=priority
        )

        self.task_queue.append(task)
        logger.info(f"Created delegation task {task_id}: {title} ({category.value}, {complexity.value})")

        return task_id

    async def execute_delegation(self, task_id: str) -> DelegationResult:
        """Execute a delegated task using external agents"""
        # Find task
        task = next((t for t in self.task_queue if t.task_id == task_id), None)
        if not task:
            raise ValueError(f"Task {task_id} not found")

        # Select best agent
        agent_name = self.select_best_agent(task)
        agent_info = self.agent_capabilities[agent_name]

        start_time = asyncio.get_event_loop().time()

        try:
            # Execute based on access method
            if agent_info["access_method"] == "perplexity_app":
                result_data = await self._execute_perplexity_delegation(task, agent_name, agent_info)
            elif agent_info["access_method"] == "ish_chat_api":
                result_data = await self._execute_ish_chat_delegation(task, agent_name)
            elif agent_info["access_method"] == "enhanced_ai_service":
                result_data = await self._execute_enhanced_ai_delegation(task, agent_name)
            else:
                raise ValueError(f"Unknown access method: {agent_info['access_method']}")

            execution_time = asyncio.get_event_loop().time() - start_time

            # Create result
            result = DelegationResult(
                task_id=task_id,
                agent_used=agent_name,
                success=True,
                execution_time_seconds=execution_time,
                result=result_data,
                quality_score=self._assess_quality(result_data, task),
                metadata={"agent_type": agent_info["access_method"]}
            )

            logger.info(f"Successfully executed task {task_id} using {agent_name} in {execution_time:.2f}s")

        except Exception as e:
            execution_time = asyncio.get_event_loop().time() - start_time

            result = DelegationResult(
                task_id=task_id,
                agent_used=agent_name,
                success=False,
                execution_time_seconds=execution_time,
                error=str(e),
                metadata={"agent_type": agent_info["access_method"]}
            )

            logger.error(f"Failed to execute task {task_id} using {agent_name}: {e}")

        # Update task status
        task.status = "completed" if result.success else "failed"
        self.completed_tasks.append(result)
        self.delegation_history.append({
            "task_id": task_id,
            "agent_used": agent_name,
            "timestamp": datetime.now().isoformat(),
            "success": result.success
        })

        return result

    async def _execute_perplexity_delegation(self, task: ExternalTask, agent_name: str, agent_info: Dict) -> Dict[str, Any]:
        """Execute task using Perplexity app automation"""
        logger.info(f"Executing {task.task_id} via Perplexity app using {agent_name}")

        # Build prompt for the external agent
        prompt = self._build_perplexity_prompt(task)

        # Navigate to model selection if needed
        await self._navigate_to_model(agent_name, agent_info["coordinates"])

        # Navigate to input area
        await self._navigate_to_input_area()

        # Input the prompt
        await self._input_prompt_to_perplexity(prompt)

        # Submit and wait for response
        await self._submit_perplexity_query()

        # Wait for completion
        await asyncio.sleep(30 + (task.estimated_time_minutes * 60 // 4))  # Estimate based on task complexity

        # Capture response
        response = await self._capture_perplexity_response()

        # Extract and parse result
        return self._parse_perplexity_response(response, task)

    async def _execute_ish_chat_delegation(self, task: ExternalTask, agent_name: str) -> Dict[str, Any]:
        """Execute task using ISH Chat AI service"""
        logger.info(f"Executing {task.task_id} via ISH Chat using {agent_name}")

        # Use enhanced AI service
        from .enhanced_ai_service import enhanced_ai_service

        # Create AI request
        request = {
            "prompt": task.description,
            "system_prompt": f"You are a {task.category.value} specialist. Analyze the task thoroughly and provide actionable solutions.",
            "provider": "zai" if agent_name == "zai" else "anthropic",
            "context": task.context
        }

        # Generate response
        response = await enhanced_ai_service.generate_response_with_fallback(request)

        if response.success:
            return {
                "analysis": response.response,
                "provider": response.provider,
                "model": response.model,
                "usage": response.usage
            }
        else:
            raise Exception(f"AI service failed: {response.error}")

    async def _execute_enhanced_ai_delegation(self, task: ExternalTask, agent_name: str) -> Dict[str, Any]:
        """Execute task using enhanced AI service"""
        logger.info(f"Executing {task.task_id} via Enhanced AI service using {agent_name}")

        # Similar to ISH Chat delegation
        return await self._execute_ish_chat_delegation(task, agent_name)

    def _build_perplexity_prompt(self, task: ExternalTask) -> str:
        """Build a comprehensive prompt for Perplexity agent"""
        prompt_parts = [
            f"TASK: {task.title}",
            f"DESCRIPTION: {task.description}",
            f"CATEGORY: {task.category.value}",
            f"COMPLEXITY: {task.complexity.value}",
            f"PRIORITY: {task.priority}/5"
        ]

        if task.context:
            context_str = "\n".join([f"{k}: {v}" for k, v in task.context.items()])
            prompt_parts.append(f"CONTEXT: {context_str}")

        prompt_parts.append("\nPlease provide a detailed, actionable solution. Focus on:")
        prompt_parts.append("1. Clear analysis of the problem")
        prompt_parts.append("2. Specific steps or recommendations")
        prompt_parts.append("3. Expected outcomes and success criteria")
        prompt_parts.append("4. Any risks or considerations")

        prompt_parts.append("\nFormat your response as JSON with this structure:")
        prompt_parts.append("""{
  "analysis": "Detailed analysis of the task",
  "recommendations": ["List of actionable recommendations"],
  "steps": ["Step-by-step implementation guide"],
  "success_criteria": ["How to verify success"],
  "risks": ["Potential issues to consider"],
  "estimated_effort": "Time/resource estimation"
}""")

        return "\n".join(prompt_parts)

    async def _navigate_to_model(self, agent_name: str, coordinates: Dict) -> None:
        """Navigate to specific model in Perplexity"""
        logger.info(f"Navigating to {agent_name} model")

        # Tap model selector if coordinates provided
        if "model_selector" in coordinates:
            x, y = coordinates["model_selector"]
            await self._tap_screen(x, y)
            await asyncio.sleep(2)

        # Tap specific model if coordinates provided
        if agent_name in coordinates:
            x, y = coordinates[agent_name]
            await self._tap_screen(x, y)
            await asyncio.sleep(2)

    async def _navigate_to_input_area(self) -> None:
        """Navigate to input area"""
        # Navigate to ask anything area
        await self._tap_screen(540, 1200)  # Approximate coordinates
        await asyncio.sleep(1)

    async def _input_prompt_to_perplexity(self, prompt: str) -> None:
        """Input prompt text into Perplexity"""
        logger.info("Inputting prompt to Perplexity")

        # This would typically use ADB input methods
        # For now, we'll simulate the process
        logger.info(f"Prompt prepared for input: {prompt[:100]}...")

    async def _submit_perplexity_query(self) -> None:
        """Submit the query to Perplexity"""
        logger.info("Submitting Perplexity query")

        # Find and tap submit button
        await self._tap_screen(540, 2000)  # Approximate submit button location
        await asyncio.sleep(1)

    async def _capture_perplexity_response(self) -> str:
        """Capture the response from Perplexity"""
        logger.info("Capturing Perplexity response")

        # Take screenshot of response area
        timestamp = int(datetime.now().timestamp())
        screenshot_path = f"/tmp/perplexity_response_{timestamp}.png"

        # Execute screenshot command
        subprocess.run([
            "adb", "shell", "screencap", "-p",
            f"/sdcard/perplexity_response_{timestamp}.png"
        ], check=True)

        subprocess.run([
            "adb", "pull",
            f"/sdcard/perplexity_response_{timestamp}.png",
            screenshot_path
        ], check=True)

        # Extract text using OCR
        try:
            ocr_result = subprocess.run([
                "tesseract", screenshot_path,
                f"/tmp/perplexity_response_{timestamp}_ocr",
                "-l", "eng"
            ], check=True, capture_output=True, text=True)

            with open(f"/tmp/perplexity_response_{timestamp}_ocr.txt", "r") as f:
                return f.read()
        except Exception as e:
            logger.error(f"OCR failed: {e}")
            return ""

    def _parse_perplexity_response(self, ocr_text: str, task: ExternalTask) -> Dict[str, Any]:
        """Parse and structure Perplexity response"""
        logger.info("Parsing Perplexity response")

        # Try to extract JSON from OCR text
        import re

        # Look for JSON structure in the text
        json_pattern = r'\{[^}]*\}'
        json_matches = re.findall(json_pattern, ocr_text)

        for json_str in json_matches:
            try:
                parsed = json.loads(json_str)
                # Validate required fields
                if all(key in parsed for key in ["analysis", "recommendations"]):
                    return parsed
            except:
                continue

        # Fallback: return structured text analysis
        return {
            "analysis": ocr_text,
            "recommendations": ["Manual review required"],
            "steps": ["Extracted from OCR text"],
            "success_criteria": ["Verify results manually"],
            "risks": ["OCR accuracy limitations"],
            "estimated_effort": "Manual verification needed",
            "raw_response": ocr_text
        }

    def _assess_quality(self, result: Dict[str, Any], task: ExternalTask) -> float:
        """Assess the quality of the agent's response"""
        score = 0.0

        # Check for required sections
        required_sections = ["analysis", "recommendations", "steps"]
        present_sections = sum(1 for section in required_sections if section in result)
        score += (present_sections / len(required_sections)) * 0.3

        # Check for actionable recommendations
        if "recommendations" in result:
            recommendations = result["recommendations"]
            if isinstance(recommendations, list) and len(recommendations) > 0:
                score += 0.3

        # Check for implementation steps
        if "steps" in result:
            steps = result["steps"]
            if isinstance(steps, list) and len(steps) > 0:
                score += 0.2

        # Check for success criteria
        if "success_criteria" in result:
            criteria = result["success_criteria"]
            if isinstance(criteria, list) and len(criteria) > 0:
                score += 0.2

        return min(score, 1.0)

    async def _tap_screen(self, x: int, y: int) -> None:
        """Tap on screen coordinates"""
        subprocess.run(["adb", "shell", "input", "tap", str(x), str(y)], check=True)
        await asyncio.sleep(0.5)

    def get_delegation_status(self) -> Dict[str, Any]:
        """Get current delegation system status"""
        return {
            "pending_tasks": len(self.task_queue),
            "completed_tasks": len(self.completed_tasks),
            "success_rate": len([r for r in self.completed_tasks if r.success]) / max(len(self.completed_tasks), 1),
            "available_agents": list(self.agent_capabilities.keys()),
            "system_status": "operational"
        }

    def get_agent_performance_stats(self) -> Dict[str, Any]:
        """Get performance statistics for each agent"""
        stats = {}

        for agent_name in self.agent_capabilities.keys():
            agent_tasks = [r for r in self.completed_tasks if r.agent_used == agent_name]
            if agent_tasks:
                stats[agent_name] = {
                    "total_tasks": len(agent_tasks),
                    "success_rate": len([t for t in agent_tasks if t.success]) / len(agent_tasks),
                    "avg_execution_time": sum(t.execution_time_seconds for t in agent_tasks) / len(agent_tasks),
                    "avg_quality_score": sum(t.quality_score or 0 for t in agent_tasks) / len([t for t in agent_tasks if t.quality_score is not None])
                }
            else:
                stats[agent_name] = {
                    "total_tasks": 0,
                    "success_rate": 0.0,
                    "avg_execution_time": 0.0,
                    "avg_quality_score": 0.0
                }

        return stats

    def get_available_agents(self) -> Dict[str, Dict[str, Any]]:
        """Get available external agents with their current status and capabilities"""
        agents = {}
        current_time = datetime.now().isoformat()

        for agent_name, capabilities in self.agent_capabilities.items():
            # Determine agent status (mock for now - could be enhanced with actual health checks)
            status = "idle"  # Default status

            # Get recent task statistics for this agent
            agent_tasks = [t for t in self.completed_tasks if t.agent_used == agent_name]
            recent_tasks = []
            for t in agent_tasks:
                try:
                    # Parse timestamp string to datetime for comparison
                    if t.completed_at:
                        completed_time = datetime.fromisoformat(t.completed_at.replace('Z', '+00:00'))
                        current_dt = datetime.fromisoformat(current_time.replace('Z', '+00:00'))
                        if (current_dt - completed_time).total_seconds() < 3600:  # Last hour
                            recent_tasks.append(t)
                except Exception as e:
                    logger.warning(f"Error parsing timestamp for task {t.task_id}: {e}")
                    continue

            # Calculate performance metrics
            success_rate = 0.0
            avg_quality = 0.0
            last_activity = None

            if recent_tasks:
                success_rate = len([t for t in recent_tasks if t.success]) / len(recent_tasks)
                quality_scores = [t.quality_score or 0 for t in recent_tasks if t.quality_score is not None]
                avg_quality = sum(quality_scores) / len(quality_scores) if quality_scores else 0.0
                # Get the most recent completion timestamp as a string
                last_activity = max(t.completed_at for t in recent_tasks)

            agents[agent_name] = {
                "name": agent_name.replace("_", " ").title(),
                "status": status,
                "capabilities": capabilities,
                "performance": {
                    "success_rate": success_rate,
                    "quality_score": avg_quality,
                    "total_completed": len(agent_tasks),
                    "recent_completed": len(recent_tasks)
                },
                "last_activity": last_activity,
                "connection_status": "available" if capabilities["access_method"] != "perplexity_app" else "device_required",
                "cost_per_minute": {
                    "claude_opus_4_1_thinking": 0.05,
                    "gpt_5": 0.08,
                    "gpt_5_thinking": 0.07,
                    "o3_pro": 0.07,
                    "claude_sonnet_4_5_thinking": 0.04,
                    "deepseek_v3": 0.04,
                    "zai": 0.02,
                    "anthropic": 0.03
                }.get(agent_name, 0.05)
            }

        return agents

# Global delegator instance
external_delegator = ExternalAgentDelegator()