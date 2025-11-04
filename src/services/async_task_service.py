"""
Advanced Async Processing and Background Task Queue Service for ISH Chat Backend
Provides high-performance async processing, task queues, and workflow orchestration
"""
import asyncio
import logging
import time
import json
import uuid
import pickle
import inspect
from datetime import datetime, timedelta
from typing import Any, Optional, Dict, List, Callable, Union, Awaitable
from dataclasses import dataclass, field, asdict
from functools import wraps
from concurrent.futures import ThreadPoolExecutor, ProcessPoolExecutor
from enum import Enum
import weakref
import threading
from collections import defaultdict, deque
import redis.asyncio as redis_async
from celery import Celery
from celery.result import AsyncResult
import psutil
import numpy as np

logger = logging.getLogger(__name__)

class TaskPriority(Enum):
    """Task priority levels"""
    LOW = 1
    NORMAL = 2
    HIGH = 3
    CRITICAL = 4

class TaskStatus(Enum):
    """Task status"""
    PENDING = "pending"
    RUNNING = "running"
    SUCCESS = "success"
    FAILURE = "failure"
    RETRY = "retry"
    CANCELLED = "cancelled"

@dataclass
class TaskDefinition:
    """Task definition"""
    task_id: str
    func: Callable
    args: tuple = field(default_factory=tuple)
    kwargs: dict = field(default_factory=dict)
    priority: TaskPriority = TaskPriority.NORMAL
    max_retries: int = 3
    retry_delay: float = 1.0
    timeout: Optional[float] = None
    queue: str = "default"
    created_at: float = field(default_factory=time.time)
    scheduled_at: Optional[float] = None
    metadata: Dict[str, Any] = field(default_factory=dict)

@dataclass
class TaskResult:
    """Task execution result"""
    task_id: str
    status: TaskStatus
    result: Any = None
    error: Optional[str] = None
    started_at: Optional[float] = None
    completed_at: Optional[float] = None
    execution_time: Optional[float] = None
    retry_count: int = 0
    worker_id: Optional[str] = None

class AsyncTaskQueue:
    """High-performance async task queue with priority support"""

    def __init__(
        self,
        max_workers: int = 100,
        max_queue_size: int = 10000,
        redis_client: Optional[redis_async.Redis] = None
    ):
        self.max_workers = max_workers
        self.max_queue_size = max_queue_size
        self.redis_client = redis_client

        # Priority queues
        self.queues = {
            priority: deque(maxlen=max_queue_size // 4)
            for priority in TaskPriority
        }

        # Task tracking
        self.tasks = {}
        self.results = {}
        self.running_tasks = set()
        self.completed_tasks = deque(maxlen=1000)

        # Worker management
        self.workers = []
        self.worker_semaphore = asyncio.Semaphore(max_workers)
        self.running = False
        self.worker_tasks = set()

        # Metrics
        self.metrics = {
            'tasks_submitted': 0,
            'tasks_completed': 0,
            'tasks_failed': 0,
            'tasks_cancelled': 0,
            'average_execution_time': 0.0,
            'queue_sizes': {priority.name: 0 for priority in TaskPriority}
        }

        self.lock = asyncio.Lock()

    async def start(self) -> None:
        """Start the task queue"""
        if self.running:
            return

        self.running = True

        # Start worker coroutines
        for i in range(self.max_workers):
            worker_task = asyncio.create_task(self._worker(f"worker-{i}"))
            self.worker_tasks.add(worker_task)
            worker_task.add_done_callback(self.worker_tasks.discard)

        logger.info(f"Started async task queue with {self.max_workers} workers")

    async def stop(self) -> None:
        """Stop the task queue"""
        self.running = False

        # Cancel all worker tasks
        for task in self.worker_tasks:
            task.cancel()

        # Wait for workers to finish
        if self.worker_tasks:
            await asyncio.gather(*self.worker_tasks, return_exceptions=True)

        logger.info("Stopped async task queue")

    async def submit(
        self,
        func: Callable,
        args: tuple = (),
        kwargs: dict = None,
        priority: TaskPriority = TaskPriority.NORMAL,
        max_retries: int = 3,
        retry_delay: float = 1.0,
        timeout: Optional[float] = None,
        queue: str = "default",
        scheduled_at: Optional[float] = None,
        metadata: Dict[str, Any] = None
    ) -> str:
        """Submit a task to the queue"""
        task_id = str(uuid.uuid4())
        kwargs = kwargs or {}
        metadata = metadata or {}

        task = TaskDefinition(
            task_id=task_id,
            func=func,
            args=args,
            kwargs=kwargs,
            priority=priority,
            max_retries=max_retries,
            retry_delay=retry_delay,
            timeout=timeout,
            queue=queue,
            scheduled_at=scheduled_at,
            metadata=metadata
        )

        async with self.lock:
            # Check queue size limits
            if len(self.queues[priority]) >= self.max_queue_size // 4:
                raise RuntimeError(f"Queue for priority {priority.name} is full")

            # Add task to appropriate queue
            self.queues[priority].append(task)
            self.tasks[task_id] = task
            self.metrics['tasks_submitted'] += 1
            self.metrics['queue_sizes'][priority.name] = len(self.queues[priority])

        logger.debug(f"Submitted task {task_id} with priority {priority.name}")

        # Persist to Redis if available
        if self.redis_client:
            await self._persist_task(task)

        return task_id

    async def get_task_result(self, task_id: str, timeout: Optional[float] = None) -> TaskResult:
        """Get task result, waiting if necessary"""
        start_time = time.time()

        while True:
            # Check if result is available
            if task_id in self.results:
                return self.results[task_id]

            # Check timeout
            if timeout and (time.time() - start_time) > timeout:
                raise TimeoutError(f"Task {task_id} did not complete within {timeout} seconds")

            # Check if task exists
            if task_id not in self.tasks:
                raise ValueError(f"Task {task_id} not found")

            await asyncio.sleep(0.1)

    async def cancel_task(self, task_id: str) -> bool:
        """Cancel a pending task"""
        async with self.lock:
            task = self.tasks.get(task_id)
            if not task:
                return False

            # Remove from queue if pending
            for queue in self.queues.values():
                try:
                    queue.remove(task)
                    self.metrics['tasks_cancelled'] += 1
                    logger.info(f"Cancelled task {task_id}")
                    return True
                except ValueError:
                    continue

            # Task is already running
            return False

    async def get_queue_status(self) -> Dict[str, Any]:
        """Get queue status and metrics"""
        async with self.lock:
            return {
                'running': self.running,
                'workers': len(self.worker_tasks),
                'queue_sizes': {
                    priority.name: len(queue)
                    for priority, queue in self.queues.items()
                },
                'running_tasks': len(self.running_tasks),
                'metrics': self.metrics.copy(),
                'pending_tasks': len(self.tasks) - len(self.running_tasks) - len(self.results)
            }

    async def _worker(self, worker_id: str) -> None:
        """Worker coroutine that processes tasks"""
        logger.info(f"Worker {worker_id} started")

        while self.running:
            try:
                # Get next task with priority ordering
                task = await self._get_next_task()
                if not task:
                    await asyncio.sleep(0.1)
                    continue

                # Execute task
                await self._execute_task(task, worker_id)

            except asyncio.CancelledError:
                break
            except Exception as e:
                logger.error(f"Worker {worker_id} error: {e}")
                await asyncio.sleep(1)

        logger.info(f"Worker {worker_id} stopped")

    async def _get_next_task(self) -> Optional[TaskDefinition]:
        """Get next task from queues (priority order)"""
        async with self.lock:
            # Check queues in priority order (CRITICAL -> LOW)
            for priority in sorted(TaskPriority, key=lambda x: x.value, reverse=True):
                queue = self.queues[priority]
                if queue:
                    task = queue.popleft()
                    self.metrics['queue_sizes'][priority.name] = len(queue)
                    return task

            return None

    async def _execute_task(self, task: TaskDefinition, worker_id: str) -> None:
        """Execute a task"""
        task_id = task.task_id
        start_time = time.time()

        # Mark as running
        self.running_tasks.add(task_id)

        result = TaskResult(
            task_id=task_id,
            status=TaskStatus.RUNNING,
            started_at=start_time,
            worker_id=worker_id
        )

        try:
            # Execute the function
            if inspect.iscoroutinefunction(task.func):
                # Async function
                task_result = await asyncio.wait_for(
                    task.func(*task.args, **task.kwargs),
                    timeout=task.timeout
                )
            else:
                # Sync function - run in thread pool
                loop = asyncio.get_event_loop()
                task_result = await asyncio.wait_for(
                    loop.run_in_executor(None, task.func, *task.args, **task.kwargs),
                    timeout=task.timeout
                )

            # Success
            result.status = TaskStatus.SUCCESS
            result.result = task_result
            result.completed_at = time.time()
            result.execution_time = result.completed_at - start_time

            self.metrics['tasks_completed'] += 1

            # Update average execution time
            total_completed = self.metrics['tasks_completed']
            current_avg = self.metrics['average_execution_time']
            self.metrics['average_execution_time'] = (
                (current_avg * (total_completed - 1) + result.execution_time) / total_completed
            )

            logger.debug(f"Task {task_id} completed successfully in {result.execution_time:.2f}s")

        except asyncio.TimeoutError:
            result.status = TaskStatus.FAILURE
            result.error = f"Task timed out after {task.timeout}s"
            result.completed_at = time.time()
            result.execution_time = result.completed_at - start_time
            self.metrics['tasks_failed'] += 1
            logger.warning(f"Task {task_id} timed out")

        except Exception as e:
            result.status = TaskStatus.FAILURE
            result.error = str(e)
            result.completed_at = time.time()
            result.execution_time = result.completed_at - start_time

            # Check if should retry
            if result.retry_count < task.max_retries:
                result.status = TaskStatus.RETRY
                result.retry_count += 1

                # Schedule retry
                retry_task = TaskDefinition(
                    task_id=task_id,
                    func=task.func,
                    args=task.args,
                    kwargs=task.kwargs,
                    priority=task.priority,
                    max_retries=task.max_retries,
                    retry_delay=task.retry_delay,
                    timeout=task.timeout,
                    queue=task.queue,
                    scheduled_at=time.time() + task.retry_delay,
                    metadata=task.metadata
                )

                # Re-queue for retry
                await asyncio.sleep(task.retry_delay)
                async with self.lock:
                    self.queues[task.priority].append(retry_task)
                    self.tasks[task_id] = retry_task

                logger.info(f"Task {task_id} scheduled for retry ({result.retry_count}/{task.max_retries})")
            else:
                self.metrics['tasks_failed'] += 1
                logger.error(f"Task {task_id} failed permanently: {e}")

        finally:
            # Clean up
            self.running_tasks.discard(task_id)
            self.results[task_id] = result
            self.completed_tasks.append(result)

            # Persist result to Redis
            if self.redis_client:
                await self._persist_result(result)

    async def _persist_task(self, task: TaskDefinition) -> None:
        """Persist task to Redis"""
        try:
            task_data = {
                'task_id': task.task_id,
                'func_name': task.func.__name__,
                'args': task.args,
                'kwargs': task.kwargs,
                'priority': task.priority.value,
                'max_retries': task.max_retries,
                'retry_delay': task.retry_delay,
                'timeout': task.timeout,
                'queue': task.queue,
                'created_at': task.created_at,
                'scheduled_at': task.scheduled_at,
                'metadata': task.metadata
            }

            await self.redis_client.setex(
                f"task:{task.task_id}",
                3600,  # 1 hour TTL
                json.dumps(task_data, default=str)
            )

        except Exception as e:
            logger.error(f"Failed to persist task {task.task_id}: {e}")

    async def _persist_result(self, result: TaskResult) -> None:
        """Persist result to Redis"""
        try:
            result_data = {
                'task_id': result.task_id,
                'status': result.status.value,
                'result': result.result,
                'error': result.error,
                'started_at': result.started_at,
                'completed_at': result.completed_at,
                'execution_time': result.execution_time,
                'retry_count': result.retry_count,
                'worker_id': result.worker_id
            }

            await self.redis_client.setex(
                f"result:{result.task_id}",
                3600,  # 1 hour TTL
                json.dumps(result_data, default=str)
            )

        except Exception as e:
            logger.error(f"Failed to persist result {result.task_id}: {e}")

class AsyncWorkflowEngine:
    """Async workflow orchestration engine"""

    def __init__(self, task_queue: AsyncTaskQueue):
        self.task_queue = task_queue
        self.workflows = {}
        self.workflow_dependencies = defaultdict(set)
        self.workflow_results = {}

    async def create_workflow(
        self,
        workflow_id: str,
        tasks: List[Dict[str, Any]],
        dependencies: Dict[str, List[str]] = None
    ) -> None:
        """Create a workflow with multiple tasks and dependencies"""
        dependencies = dependencies or {}

        # Store workflow definition
        self.workflows[workflow_id] = {
            'tasks': tasks,
            'dependencies': dependencies,
            'status': 'created',
            'created_at': time.time()
        }

        # Build dependency graph
        for task_id, deps in dependencies.items():
            self.workflow_dependencies[task_id] = set(deps)

        logger.info(f"Created workflow {workflow_id} with {len(tasks)} tasks")

    async def start_workflow(self, workflow_id: str) -> None:
        """Start workflow execution"""
        if workflow_id not in self.workflows:
            raise ValueError(f"Workflow {workflow_id} not found")

        workflow = self.workflows[workflow_id]
        workflow['status'] = 'running'
        workflow['started_at'] = time.time()

        # Submit tasks with no dependencies first
        for task_def in workflow['tasks']:
            task_id = task_def['task_id']

            if not self.workflow_dependencies[task_id]:
                await self._submit_workflow_task(workflow_id, task_def)

        logger.info(f"Started workflow {workflow_id}")

    async def _submit_workflow_task(self, workflow_id: str, task_def: Dict[str, Any]) -> str:
        """Submit a workflow task"""
        task_id = await self.task_queue.submit(
            func=task_def['func'],
            args=task_def.get('args', ()),
            kwargs=task_def.get('kwargs', {}),
            priority=task_def.get('priority', TaskPriority.NORMAL),
            metadata={'workflow_id': workflow_id, **task_def.get('metadata', {})}
        )

        # Monitor task completion
        asyncio.create_task(self._monitor_workflow_task(workflow_id, task_id))

        return task_id

    async def _monitor_workflow_task(self, workflow_id: str, task_id: str) -> None:
        """Monitor workflow task completion and trigger dependent tasks"""
        try:
            result = await self.task_queue.get_task_result(task_id)

            # Store result
            self.workflow_results[task_id] = result

            # Check for dependent tasks
            workflow = self.workflows[workflow_id]
            for task_def in workflow['tasks']:
                dependent_task_id = task_def['task_id']

                # Check if all dependencies are satisfied
                dependencies = self.workflow_dependencies[dependent_task_id]
                dependencies.discard(task_id)  # Remove completed task

                if not dependencies and dependent_task_id not in self.workflow_results:
                    # All dependencies satisfied, submit task
                    await self._submit_workflow_task(workflow_id, task_def)

        except Exception as e:
            logger.error(f"Error monitoring workflow task {task_id}: {e}")

    async def get_workflow_status(self, workflow_id: str) -> Dict[str, Any]:
        """Get workflow status"""
        if workflow_id not in self.workflows:
            raise ValueError(f"Workflow {workflow_id} not found")

        workflow = self.workflows[workflow_id]
        tasks = workflow['tasks']

        # Count task statuses
        completed_tasks = 0
        failed_tasks = 0
        running_tasks = 0

        for task_def in tasks:
            task_id = task_def['task_id']
            if task_id in self.workflow_results:
                result = self.workflow_results[task_id]
                if result.status == TaskStatus.SUCCESS:
                    completed_tasks += 1
                elif result.status == TaskStatus.FAILURE:
                    failed_tasks += 1
            elif task_id in self.task_queue.running_tasks:
                running_tasks += 1

        total_tasks = len(tasks)
        is_complete = (completed_tasks + failed_tasks) == total_tasks

        # Update workflow status
        if is_complete:
            workflow['status'] = 'completed' if failed_tasks == 0 else 'failed'
            workflow['completed_at'] = time.time()

        return {
            'workflow_id': workflow_id,
            'status': workflow['status'],
            'progress': {
                'total': total_tasks,
                'completed': completed_tasks,
                'failed': failed_tasks,
                'running': running_tasks,
                'pending': total_tasks - completed_tasks - failed_tasks - running_tasks
            },
            'created_at': workflow['created_at'],
            'started_at': workflow.get('started_at'),
            'completed_at': workflow.get('completed_at')
        }

class AsyncProcessingService:
    """Main async processing service"""

    def __init__(self, config: Dict[str, Any] = None):
        self.config = config or {}
        self.task_queue = AsyncTaskQueue(
            max_workers=self.config.get('max_workers', 100),
            max_queue_size=self.config.get('max_queue_size', 10000)
        )
        self.workflow_engine = AsyncWorkflowEngine(self.task_queue)
        self.thread_pool = ThreadPoolExecutor(
            max_workers=self.config.get('thread_pool_size', 50)
        )
        self.process_pool = ProcessPoolExecutor(
            max_workers=self.config.get('process_pool_size', 10)
        )
        self.running = False

    async def start(self, redis_client: Optional[redis_async.Redis] = None) -> None:
        """Start the async processing service"""
        if self.running:
            return

        self.running = True
        self.task_queue.redis_client = redis_client
        await self.task_queue.start()

        logger.info("Async processing service started")

    async def stop(self) -> None:
        """Stop the async processing service"""
        self.running = False

        await self.task_queue.stop()
        self.thread_pool.shutdown(wait=True)
        self.process_pool.shutdown(wait=True)

        logger.info("Async processing service stopped")

    async def submit_task(
        self,
        func: Callable,
        args: tuple = (),
        kwargs: dict = None,
        **task_kwargs
    ) -> str:
        """Submit a task for async execution"""
        return await self.task_queue.submit(func, args, kwargs, **task_kwargs)

    async def submit_batch_tasks(
        self,
        tasks: List[Dict[str, Any]]
    ) -> List[str]:
        """Submit multiple tasks in batch"""
        task_ids = []

        for task in tasks:
            task_id = await self.submit_task(**task)
            task_ids.append(task_id)

        return task_ids

    async def create_workflow(
        self,
        workflow_id: str,
        tasks: List[Dict[str, Any]],
        dependencies: Dict[str, List[str]] = None
    ) -> None:
        """Create a workflow"""
        await self.workflow_engine.create_workflow(workflow_id, tasks, dependencies)

    async def start_workflow(self, workflow_id: str) -> None:
        """Start a workflow"""
        await self.workflow_engine.start_workflow(workflow_id)

    async def get_service_status(self) -> Dict[str, Any]:
        """Get service status"""
        queue_status = await self.task_queue.get_queue_status()

        return {
            'running': self.running,
            'queue_status': queue_status,
            'thread_pool': {
                'workers': self.thread_pool._max_workers,
                'active_threads': threading.active_count()
            },
            'process_pool': {
                'workers': self.process_pool._max_workers
            },
            'system': {
                'cpu_usage': psutil.cpu_percent(),
                'memory_usage': psutil.virtual_memory().percent,
                'active_async_tasks': len(asyncio.all_tasks())
            }
        }

# Global instance
async_processing_service = AsyncProcessingService()

# Decorators for async task processing
def async_task(
    priority: TaskPriority = TaskPriority.NORMAL,
    max_retries: int = 3,
    retry_delay: float = 1.0,
    timeout: Optional[float] = None,
    queue: str = "default"
):
    """Decorator to make function async task compatible"""
    def decorator(func):
        @wraps(func)
        async def wrapper(*args, **kwargs):
            return await async_processing_service.submit_task(
                func=func,
                args=args,
                kwargs=kwargs,
                priority=priority,
                max_retries=max_retries,
                retry_delay=retry_delay,
                timeout=timeout,
                queue=queue
            )
        return wrapper
    return decorator

def background_task(
    priority: TaskPriority = TaskPriority.NORMAL,
    max_retries: int = 3,
    retry_delay: float = 1.0,
    timeout: Optional[float] = None
):
    """Decorator to execute function as background task"""
    def decorator(func):
        @wraps(func)
        async def wrapper(*args, **kwargs):
            # Submit to background queue but don't wait for result
            await async_processing_service.submit_task(
                func=func,
                args=args,
                kwargs=kwargs,
                priority=priority,
                max_retries=max_retries,
                retry_delay=retry_delay,
                timeout=timeout
            )
            return {"status": "submitted", "message": "Task submitted for background execution"}
        return wrapper
    return decorator

async def gather_with_concurrency(
    tasks: List[Awaitable],
    max_concurrency: int = 10
) -> List[Any]:
    """Gather tasks with concurrency limit"""
    semaphore = asyncio.Semaphore(max_concurrency)

    async def limited_task(task):
        async with semaphore:
            return await task

    return await asyncio.gather(
        *(limited_task(task) for task in tasks),
        return_exceptions=True
    )

class BatchProcessor:
    """Batch processor for handling large datasets"""

    def __init__(
        self,
        batch_size: int = 100,
        max_concurrency: int = 10,
        processing_func: Callable = None
    ):
        self.batch_size = batch_size
        self.max_concurrency = max_concurrency
        self.processing_func = processing_func

    async def process_batches(
        self,
        data: List[Any],
        processing_func: Callable = None,
        progress_callback: Callable = None
    ) -> List[Any]:
        """Process data in batches"""
        func = processing_func or self.processing_func
        if not func:
            raise ValueError("Processing function must be provided")

        # Create batches
        batches = [
            data[i:i + self.batch_size]
            for i in range(0, len(data), self.batch_size)
        ]

        results = []

        # Process batches with concurrency control
        semaphore = asyncio.Semaphore(self.max_concurrency)

        async def process_batch(batch):
            async with semaphore:
                result = await func(batch)
                if progress_callback:
                    await progress_callback(len(batch), len(data))
                return result

        batch_tasks = [process_batch(batch) for batch in batches]
        batch_results = await asyncio.gather(*batch_tasks, return_exceptions=True)

        # Flatten results
        for result in batch_results:
            if isinstance(result, Exception):
                logger.error(f"Batch processing error: {result}")
                results.append([])
            else:
                results.extend(result if isinstance(result, list) else [result])

        return results

class AsyncTaskScheduler:
    """Task scheduler for recurring and scheduled tasks"""

    def __init__(self):
        self.scheduled_tasks = {}
        self.running = False
        self.scheduler_task = None

    async def start(self) -> None:
        """Start the task scheduler"""
        if self.running:
            return

        self.running = True
        self.scheduler_task = asyncio.create_task(self._scheduler_loop())
        logger.info("Task scheduler started")

    async def stop(self) -> None:
        """Stop the task scheduler"""
        self.running = False
        if self.scheduler_task:
            self.scheduler_task.cancel()
            try:
                await self.scheduler_task
            except asyncio.CancelledError:
                pass
        logger.info("Task scheduler stopped")

    def schedule_task(
        self,
        task_id: str,
        func: Callable,
        schedule: str,  # cron expression or interval in seconds
        args: tuple = (),
        kwargs: dict = None
    ) -> None:
        """Schedule a recurring task"""
        kwargs = kwargs or {}

        self.scheduled_tasks[task_id] = {
            'func': func,
            'schedule': schedule,
            'args': args,
            'kwargs': kwargs,
            'last_run': 0,
            'next_run': self._calculate_next_run(schedule)
        }

        logger.info(f"Scheduled task {task_id} with schedule: {schedule}")

    def _calculate_next_run(self, schedule: Union[str, int, float]) -> float:
        """Calculate next run time"""
        if isinstance(schedule, (int, float)):
            # Interval in seconds
            return time.time() + schedule
        else:
            # TODO: Implement cron expression parsing
            return time.time() + 60  # Default to 1 minute

    async def _scheduler_loop(self) -> None:
        """Main scheduler loop"""
        while self.running:
            try:
                current_time = time.time()

                for task_id, task_info in self.scheduled_tasks.items():
                    if current_time >= task_info['next_run']:
                        # Run task
                        try:
                            if inspect.iscoroutinefunction(task_info['func']):
                                await task_info['func'](*task_info['args'], **task_info['kwargs'])
                            else:
                                task_info['func'](*task_info['args'], **task_info['kwargs'])

                            # Update schedule
                            task_info['last_run'] = current_time
                            task_info['next_run'] = self._calculate_next_run(task_info['schedule'])

                            logger.debug(f"Executed scheduled task {task_id}")

                        except Exception as e:
                            logger.error(f"Error executing scheduled task {task_id}: {e}")

                await asyncio.sleep(1)  # Check every second

            except asyncio.CancelledError:
                break
            except Exception as e:
                logger.error(f"Scheduler loop error: {e}")
                await asyncio.sleep(5)

# Global scheduler instance
task_scheduler = AsyncTaskScheduler()