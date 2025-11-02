"""
Real-time AI Model and Task Status Monitor
Provides live status updates for external agents and active tasks
"""
import asyncio
import json
import time
import logging
from datetime import datetime, timedelta
from typing import Dict, List, Optional
from dataclasses import dataclass, asdict
import requests
from pathlib import Path

logger = logging.getLogger(__name__)

@dataclass
class ModelStatus:
    """Individual AI model status"""
    name: str
    status: str  # "active", "idle", "busy", "offline"
    current_task: Optional[str] = None
    last_activity: Optional[datetime] = None
    success_rate: float = 0.0
    response_time: float = 0.0
    quality_score: float = 0.0
    cost_per_minute: float = 0.0
    connection_status: str = "unknown"  # "connected", "disconnected", "error"

@dataclass
class TaskStatus:
    """Active task status"""
    task_id: str
    title: str
    agent_assigned: str
    status: str  # "pending", "in_progress", "completed", "failed"
    progress: float = 0.0  # 0-100
    start_time: Optional[datetime] = None
    estimated_completion: Optional[datetime] = None
    quality_score: float = 0.0
    priority: str = "medium"  # "low", "medium", "high", "critical"

class StatusMonitor:
    """Real-time status monitoring for AI models and tasks"""

    def __init__(self):
        self.models: Dict[str, ModelStatus] = {}
        self.active_tasks: Dict[str, TaskStatus] = {}
        self.external_agents_url = "http://localhost:8000/api/external-agent"
        self.android_status_url = "http://localhost:8000/api/android/status"
        self.health_url = "http://localhost:8000/health"
        self.status_file = Path("/tmp/ai_status_monitor.json")
        self.is_running = False

        # Initialize external agent models
        self._initialize_models()

    def _initialize_models(self):
        """Initialize all external AI agent models"""
        external_agents = {
            "claude_opus_41": ModelStatus(
                name="Claude Opus 4.1 Thinking",
                status="idle",
                cost_per_minute=0.05,
                connection_status="unknown"
            ),
            "gpt_5": ModelStatus(
                name="GPT-5",
                status="idle",
                cost_per_minute=0.08,
                connection_status="unknown"
            ),
            "o3_pro": ModelStatus(
                name="O3-Pro",
                status="idle",
                cost_per_minute=0.07,
                connection_status="unknown"
            ),
            "deepseek_v3": ModelStatus(
                name="DeepSeek-V3",
                status="idle",
                cost_per_minute=0.04,
                connection_status="unknown"
            ),
            "claude_35_sonnet": ModelStatus(
                name="Claude 3.5 Sonnet",
                status="idle",
                cost_per_minute=0.03,
                connection_status="unknown"
            ),
            "zai": ModelStatus(
                name="ZAI (ISH Chat)",
                status="idle",
                cost_per_minute=0.02,
                connection_status="unknown"
            ),
            "anthropic_claude": ModelStatus(
                name="Anthropic Claude",
                status="idle",
                cost_per_minute=0.03,
                connection_status="unknown"
            )
        }
        self.models.update(external_agents)

    async def check_external_agent_status(self) -> bool:
        """Check external agent delegation system status"""
        try:
            response = requests.get(f"{self.external_agents_url}/agents", timeout=5)
            if response.status_code == 200:
                agents_data = response.json()
                # Validate that agents_data is a dictionary
                if not isinstance(agents_data, dict):
                    logger.warning(f"Expected dict from agents API, got {type(agents_data)}: {agents_data}")
                    agents_data = {}
                
                # Update model statuses based on API response
                agents_list = agents_data.get("agents", [])
                if not isinstance(agents_list, list):
                    logger.warning(f"Expected list for agents, got {type(agents_list)}: {agents_list}")
                    agents_list = []
                
                for agent in agents_list:
                    # Validate agent is a dictionary
                    if not isinstance(agent, dict):
                        logger.warning(f"Expected dict for agent, got {type(agent)}: {agent}")
                        continue
                        
                    agent_name = agent.get("name", "")
                    if not isinstance(agent_name, str):
                        logger.warning(f"Expected string for agent name, got {type(agent_name)}: {agent_name}")
                        continue
                        
                    agent_name_processed = agent_name.lower().replace(" ", "_").replace(".", "_")
                    for model_key, model in self.models.items():
                        if agent_name_processed in model_key.lower() or model_key.lower() in agent_name_processed:
                            available = agent.get("available", False)
                            if not isinstance(available, bool):
                                logger.warning(f"Expected boolean for available status, got {type(available)}: {available}")
                                available = False
                            model.status = "idle" if available else "offline"
                            model.connection_status = "connected"
                            break
                return True
            else:
                logger.warning(f"External agents API returned status {response.status_code}")
                return False
        except json.JSONDecodeError as e:
            logger.error(f"Failed to decode JSON from agents API: {e}")
            # Mark all external agents as disconnected
            for model in self.models.values():
                if "claude" in model.name.lower() or "gpt" in model.name.lower() or "o3" in model.name.lower() or "deepseek" in model.name.lower():
                    model.connection_status = "disconnected"
            return False
        except Exception as e:
            logger.error(f"Failed to check external agent status: {e}")
            # Mark all external agents as disconnected
            for model in self.models.values():
                if "claude" in model.name.lower() or "gpt" in model.name.lower() or "o3" in model.name.lower() or "deepseek" in model.name.lower():
                    model.connection_status = "disconnected"
            return False

    async def check_android_device_status(self) -> Dict:
        """Check Android device connection status"""
        try:
            response = requests.get(self.android_status_url, timeout=5)
            if response.status_code == 200:
                return response.json()
            else:
                return {"connected": False, "error": f"Status {response.status_code}"}
        except Exception as e:
            logger.error(f"Failed to check Android status: {e}")
            return {"connected": False, "error": str(e)}

    async def check_ish_chat_health(self) -> bool:
        """Check ISH Chat server health"""
        try:
            response = requests.get(self.health_url, timeout=5)
            if response.status_code == 200:
                health_data = response.json()
                return health_data.get("status") == "healthy"
            else:
                return False
        except Exception as e:
            logger.error(f"Failed to check ISH Chat health: {e}")
            return False

    async def get_active_delegations(self) -> List[Dict]:
        """Get currently active delegations"""
        try:
            response = requests.get(f"{self.external_agents_url}/history?limit=10&status_filter=in_progress", timeout=5)
            if response.status_code == 200:
                data = response.json()
                # Validate that data is a dictionary
                if not isinstance(data, dict):
                    logger.warning(f"Expected dict from history API, got {type(data)}: {data}")
                    return []
                
                history = data.get("history", [])
                if not isinstance(history, list):
                    logger.warning(f"Expected list for history, got {type(history)}: {history}")
                    return []
                
                return history
            else:
                return []
        except json.JSONDecodeError as e:
            logger.error(f"Failed to decode JSON from history API: {e}")
            return []
        except Exception as e:
            logger.error(f"Failed to get active delegations: {e}")
            return []

    async def get_delegation_metrics(self) -> Dict:
        """Get delegation performance metrics"""
        try:
            response = requests.get(f"{self.external_agents_url}/metrics", timeout=5)
            if response.status_code == 200:
                data = response.json()
                # Validate that data is a dictionary
                if not isinstance(data, dict):
                    logger.warning(f"Expected dict from metrics API, got {type(data)}: {data}")
                    return {}
                return data
            else:
                return {}
        except json.JSONDecodeError as e:
            logger.error(f"Failed to decode JSON from metrics API: {e}")
            return {}
        except Exception as e:
            logger.error(f"Failed to get delegation metrics: {e}")
            return {}

    async def update_task_statuses(self):
        """Update active task statuses"""
        active_delegations = await self.get_active_delegations()
        metrics = await self.get_delegation_metrics()

        # Clear current tasks
        current_task_ids = set()

        for delegation in active_delegations:
            # Validate delegation is a dictionary
            if not isinstance(delegation, dict):
                logger.warning(f"Expected dict for delegation, got {type(delegation)}: {delegation}")
                continue
                
            task_id = delegation.get("session_id")
            if task_id and isinstance(task_id, str):
                current_task_ids.add(task_id)

                if task_id not in self.active_tasks:
                    # New task discovered
                    status = delegation.get("status", "pending")
                    if not isinstance(status, str):
                        logger.warning(f"Expected string for status, got {type(status)}: {status}")
                        status = "pending"
                    
                    created_at = delegation.get("created_at", datetime.utcnow().isoformat())
                    if not isinstance(created_at, str):
                        logger.warning(f"Expected string for created_at, got {type(created_at)}: {created_at}")
                        created_at = datetime.utcnow().isoformat()
                    
                    try:
                        start_time = datetime.fromisoformat(created_at)
                    except ValueError as e:
                        logger.warning(f"Invalid timestamp format {created_at}: {e}")
                        start_time = datetime.utcnow()
                    
                    self.active_tasks[task_id] = TaskStatus(
                        task_id=task_id,
                        title=f"Delegation Task {task_id[:8]}",
                        agent_assigned="External Agent",
                        status=status,
                        start_time=start_time,
                        priority="medium"
                    )

                # Update existing task
                task = self.active_tasks[task_id]
                task.status = delegation.get("status", "pending")
                if task.status == "completed":
                    task.progress = 100.0
                elif task.status == "in_progress":
                    task.progress = min(95.0, task.progress + 5.0)  # Simulate progress

        # Remove completed/cancelled tasks that are older than 5 minutes
        cutoff_time = datetime.utcnow() - timedelta(minutes=5)
        completed_tasks = [
            task_id for task_id, task in self.active_tasks.items()
            if task.status in ["completed", "failed"] and task.start_time and task.start_time < cutoff_time
        ]
        for task_id in completed_tasks:
            del self.active_tasks[task_id]

    async def update_model_performance(self):
        """Update model performance metrics"""
        metrics = await self.get_delegation_metrics()
        if metrics and isinstance(metrics, dict):
            # Update performance stats based on metrics
            total_delegations = metrics.get("total_delegations", 0)
            success_rate = metrics.get("success_rate", 0)
            
            # Validate types
            if not isinstance(total_delegations, (int, float)):
                logger.warning(f"Expected number for total_delegations, got {type(total_delegations)}: {total_delegations}")
                total_delegations = 0
            
            if not isinstance(success_rate, (int, float)):
                logger.warning(f"Expected number for success_rate, got {type(success_rate)}: {success_rate}")
                success_rate = 0
        else:
            total_delegations = 0
            success_rate = 0

            # Distribute performance metrics across active models
            for model in self.models.values():
                if model.connection_status == "connected":
                    model.success_rate = success_rate
                    model.response_time = 1.5 + (hash(model.name) % 100) / 100  # Simulated response time
                    model.quality_score = 85.0 + (hash(model.name) % 15)  # Simulated quality score

    async def generate_status_display(self) -> Dict:
        """Generate comprehensive status display"""
        ish_chat_healthy = await self.check_ish_chat_health()
        android_status = await self.check_android_device_status()
        external_agents_ok = await self.check_external_agent_status()

        await self.update_task_statuses()
        await self.update_model_performance()

        # Count model statuses
        model_counts = {
            "active": sum(1 for m in self.models.values() if m.status == "active"),
            "idle": sum(1 for m in self.models.values() if m.status == "idle"),
            "busy": sum(1 for m in self.models.values() if m.status == "busy"),
            "offline": sum(1 for m in self.models.values() if m.status == "offline")
        }

        # Count task statuses
        task_counts = {
            "pending": sum(1 for t in self.active_tasks.values() if t.status == "pending"),
            "in_progress": sum(1 for t in self.active_tasks.values() if t.status == "in_progress"),
            "completed": sum(1 for t in self.active_tasks.values() if t.status == "completed"),
            "failed": sum(1 for t in self.active_tasks.values() if t.status == "failed")
        }

        return {
            "timestamp": datetime.utcnow().isoformat(),
            "session_info": {
                "ish_chat_healthy": ish_chat_healthy,
                "external_agents_available": external_agents_ok,
                "android_connected": android_status.get("connected", False),
                "android_model": android_status.get("model", "Unknown"),
                "android_battery": android_status.get("battery", "Unknown")
            },
            "models": {
                "total": len(self.models),
                "active": model_counts["active"],
                "idle": model_counts["idle"],
                "busy": model_counts["busy"],
                "offline": model_counts["offline"],
                "details": [asdict(model) for model in self.models.values()]
            },
            "tasks": {
                "total": len(self.active_tasks),
                "pending": task_counts["pending"],
                "in_progress": task_counts["in_progress"],
                "completed": task_counts["completed"],
                "failed": task_counts["failed"],
                "active": [asdict(task) for task in self.active_tasks.values()]
            },
            "quick_links": {
                "ish_chat_api": "http://localhost:8000/docs",
                "external_agents": f"{self.external_agents_url}/agents",
                "delegate_task": f"{self.external_agents_url}/delegate",
                "android_control": f"{self.external_agents_url}/android/status"
            }
        }

    async def write_status_file(self):
        """Write status to JSON file for external display"""
        try:
            status_data = await self.generate_status_display()

            # Convert datetime objects to strings for JSON serialization
            def datetime_converter(obj):
                if isinstance(obj, datetime):
                    return obj.isoformat()
                raise TypeError(f"Object of type {type(obj)} is not JSON serializable")

            with open(self.status_file, 'w') as f:
                json.dump(status_data, f, indent=2, default=datetime_converter)

            return True
        except Exception as e:
            logger.error(f"Failed to write status file: {e}")
            return False

    async def monitor_loop(self):
        """Main monitoring loop"""
        logger.info("Starting AI Status Monitor loop")

        while self.is_running:
            try:
                await self.write_status_file()
                await asyncio.sleep(5)  # Update every 5 seconds
            except Exception as e:
                logger.error(f"Error in monitoring loop: {e}")
                await asyncio.sleep(10)  # Wait longer on error

    async def start_monitoring(self):
        """Start the status monitoring"""
        if self.is_running:
            logger.warning("Status monitor is already running")
            return

        self.is_running = True
        logger.info("Starting AI Status Monitor")

        # Run initial status check
        await self.write_status_file()

        # Start monitoring loop
        monitor_task = asyncio.create_task(self.monitor_loop())
        return monitor_task

    def stop_monitoring(self):
        """Stop the status monitoring"""
        self.is_running = False
        logger.info("Stopping AI Status Monitor")

        # Clean up status file
        if self.status_file.exists():
            try:
                self.status_file.unlink()
            except Exception as e:
                logger.error(f"Failed to remove status file: {e}")

# Global monitor instance
status_monitor = StatusMonitor()

# CLI interface for standalone usage
async def main():
    """Main function for standalone execution"""
    monitor_task = await status_monitor.start_monitoring()

    try:
        # Keep running until interrupted
        while status_monitor.is_running:
            await asyncio.sleep(1)
    except KeyboardInterrupt:
        print("\nStopping AI Status Monitor...")
        status_monitor.stop_monitoring()
        if monitor_task:
            monitor_task.cancel()
            try:
                await monitor_task
            except asyncio.CancelledError:
                pass

if __name__ == "__main__":
    asyncio.run(main())