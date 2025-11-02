"""
Analytics Service for performance metrics and usage analytics
Provides comprehensive analytics for the ISH Chat integration system
"""
import os
import json
import sqlite3
import logging
from typing import Dict, List, Optional, Any, Tuple
from datetime import datetime, timedelta
from dataclasses import dataclass, field, asdict
from statistics import mean, median
import asyncio

from database.connection import get_db

logger = logging.getLogger(__name__)

@dataclass
class MetricEvent:
    """Analytics event data structure"""
    event_id: str
    event_type: str
    timestamp: datetime
    user_id: str
    device_id: str
    session_id: str
    data: Dict[str, Any] = field(default_factory=dict)
    duration_ms: Optional[int] = None
    success: bool = True
    error_message: Optional[str] = None

@dataclass
class PerformanceMetrics:
    """Performance metrics data structure"""
    total_requests: int
    successful_requests: int
    failed_requests: int
    average_response_time: float
    median_response_time: float
    p95_response_time: float
    requests_per_minute: float
    error_rate: float
    uptime_percentage: float

@dataclass
class UsageMetrics:
    """Usage metrics data structure"""
    active_users: int
    total_sessions: int
    average_session_duration: float
    most_used_features: List[Dict[str, Any]]
    voice_command_usage: Dict[str, int]
    ocr_usage: Dict[str, int]
    ai_provider_usage: Dict[str, int]

@dataclass
class DeviceMetrics:
    """Device-specific metrics"""
    device_id: str
    device_name: str
    connection_count: int
    total_commands: int
    successful_commands: int
    average_response_time: float
    battery_usage: Dict[str, Any]
    app_usage: Dict[str, int]
    last_seen: datetime

@dataclass
class SystemMetrics:
    """System-wide metrics"""
    cpu_usage: float
    memory_usage: float
    disk_usage: float
    network_throughput: Dict[str, float]
    active_connections: int
    database_size_mb: float
    log_size_mb: float

class AnalyticsService:
    """Comprehensive analytics service for ISH Chat integration"""

    def __init__(self):
        self.metrics_cache = {}
        self.cache_ttl = 300  # 5 minutes
        self.last_cache_update = {}

    async def track_event(self,
                         event_type: str,
                         user_id: str,
                         device_id: str,
                         session_id: str,
                         data: Dict[str, Any] = None,
                         duration_ms: int = None,
                         success: bool = True,
                         error_message: str = None) -> str:
        """Track an analytics event"""
        try:
            import uuid
            event_id = str(uuid.uuid4())

            event = MetricEvent(
                event_id=event_id,
                event_type=event_type,
                timestamp=datetime.utcnow(),
                user_id=user_id,
                device_id=device_id,
                session_id=session_id,
                data=data or {},
                duration_ms=duration_ms,
                success=success,
                error_message=error_message
            )

            # Store in database
            await self._store_event(event)

            # Update cache if needed
            await self._invalidate_cache(event_type)

            return event_id

        except Exception as e:
            logger.error(f"Failed to track event: {e}")
            return None

    async def _store_event(self, event: MetricEvent):
        """Store analytics event in database"""
        try:
            db = next(get_db())
            from sqlalchemy import text

            # Check if analytics_events table exists
            table_check = text("""
                SELECT name FROM sqlite_master
                WHERE type='table' AND name='analytics_events'
            """)
            result = db.execute(table_check).fetchone()

            if not result:
                await self._create_analytics_tables(db)

            # Insert event
            insert_query = text("""
                INSERT INTO analytics_events
                (event_id, event_type, timestamp, user_id, device_id, session_id,
                 data, duration_ms, success, error_message)
                VALUES (:event_id, :event_type, :timestamp, :user_id, :device_id, :session_id,
                        :data, :duration_ms, :success, :error_message)
            """)

            db.execute(insert_query, {
                'event_id': event.event_id,
                'event_type': event.event_type,
                'timestamp': event.timestamp,
                'user_id': event.user_id,
                'device_id': event.device_id,
                'session_id': event.session_id,
                'data': json.dumps(event.data),
                'duration_ms': event.duration_ms,
                'success': event.success,
                'error_message': event.error_message
            })
            db.commit()

        except Exception as e:
            logger.error(f"Failed to store analytics event: {e}")

    async def _create_analytics_tables(self, db):
        """Create analytics database tables"""
        from sqlalchemy import text

        # Events table
        events_table = text("""
            CREATE TABLE IF NOT EXISTS analytics_events (
                event_id TEXT PRIMARY KEY,
                event_type TEXT NOT NULL,
                timestamp DATETIME NOT NULL,
                user_id TEXT NOT NULL,
                device_id TEXT NOT NULL,
                session_id TEXT NOT NULL,
                data TEXT,
                duration_ms INTEGER,
                success BOOLEAN,
                error_message TEXT,
                INDEX idx_event_type (event_type),
                INDEX idx_timestamp (timestamp),
                INDEX idx_user_id (user_id),
                INDEX idx_device_id (device_id)
            )
        """)

        # Performance summary table
        performance_table = text("""
            CREATE TABLE IF NOT EXISTS performance_summary (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                date DATE NOT NULL,
                event_type TEXT NOT NULL,
                total_requests INTEGER DEFAULT 0,
                successful_requests INTEGER DEFAULT 0,
                failed_requests INTEGER DEFAULT 0,
                avg_response_time REAL DEFAULT 0,
                p95_response_time REAL DEFAULT 0,
                error_rate REAL DEFAULT 0,
                UNIQUE(date, event_type)
            )
        """)

        # Usage summary table
        usage_table = text("""
            CREATE TABLE IF NOT EXISTS usage_summary (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                date DATE NOT NULL,
                metric_type TEXT NOT NULL,
                metric_key TEXT NOT NULL,
                metric_value REAL NOT NULL,
                UNIQUE(date, metric_type, metric_key)
            )
        """)

        db.execute(events_table)
        db.execute(performance_table)
        db.execute(usage_table)
        db.commit()

    async def get_performance_metrics(self,
                                    start_date: datetime = None,
                                    end_date: datetime = None,
                                    event_type: str = None) -> PerformanceMetrics:
        """Get performance metrics for specified time range"""
        cache_key = f"performance_{start_date}_{end_date}_{event_type}"

        if await self._is_cache_valid(cache_key):
            return self.metrics_cache.get(cache_key)

        try:
            if not start_date:
                start_date = datetime.utcnow() - timedelta(days=1)
            if not end_date:
                end_date = datetime.utcnow()

            db = next(get_db())
            from sqlalchemy import text

            # Build query
            query = text("""
                SELECT
                    COUNT(*) as total_requests,
                    COUNT(CASE WHEN success = 1 THEN 1 END) as successful_requests,
                    COUNT(CASE WHEN success = 0 THEN 1 END) as failed_requests,
                    AVG(duration_ms) as avg_response_time,
                    MIN(duration_ms) as min_response_time,
                    MAX(duration_ms) as max_response_time
                FROM analytics_events
                WHERE timestamp BETWEEN :start_date AND :end_date
                AND (:event_type IS NULL OR event_type = :event_type)
            """)

            result = db.execute(query, {
                'start_date': start_date,
                'end_date': end_date,
                'event_type': event_type
            }).fetchone()

            if not result or result.total_requests == 0:
                return PerformanceMetrics(
                    total_requests=0,
                    successful_requests=0,
                    failed_requests=0,
                    average_response_time=0.0,
                    median_response_time=0.0,
                    p95_response_time=0.0,
                    requests_per_minute=0.0,
                    error_rate=0.0,
                    uptime_percentage=100.0
                )

            # Get percentiles
            percentiles_query = text("""
                SELECT duration_ms
                FROM analytics_events
                WHERE timestamp BETWEEN :start_date AND :end_date
                AND (:event_type IS NULL OR event_type = :event_type)
                AND duration_ms IS NOT NULL
                ORDER BY duration_ms
            """)

            durations = [row[0] for row in db.execute(percentiles_query, {
                'start_date': start_date,
                'end_date': end_date,
                'event_type': event_type
            }).fetchall()]

            median_response_time = self._calculate_percentile(durations, 50)
            p95_response_time = self._calculate_percentile(durations, 95)

            # Calculate requests per minute
            time_diff_minutes = (end_date - start_date).total_seconds() / 60
            requests_per_minute = result.total_requests / time_diff_minutes if time_diff_minutes > 0 else 0

            # Calculate error rate
            error_rate = (result.failed_requests / result.total_requests * 100) if result.total_requests > 0 else 0

            metrics = PerformanceMetrics(
                total_requests=result.total_requests,
                successful_requests=result.successful_requests,
                failed_requests=result.failed_requests,
                average_response_time=result.avg_response_time or 0.0,
                median_response_time=median_response_time,
                p95_response_time=p95_response_time,
                requests_per_minute=requests_per_minute,
                error_rate=error_rate,
                uptime_percentage=100.0 - error_rate  # Simplified uptime calculation
            )

            await self._cache_result(cache_key, metrics)
            return metrics

        except Exception as e:
            logger.error(f"Failed to get performance metrics: {e}")
            return PerformanceMetrics(
                total_requests=0, successful_requests=0, failed_requests=0,
                average_response_time=0.0, median_response_time=0.0, p95_response_time=0.0,
                requests_per_minute=0.0, error_rate=0.0, uptime_percentage=0.0
            )

    async def get_usage_metrics(self,
                              start_date: datetime = None,
                              end_date: datetime = None) -> UsageMetrics:
        """Get usage metrics for specified time range"""
        cache_key = f"usage_{start_date}_{end_date}"

        if await self._is_cache_valid(cache_key):
            return self.metrics_cache.get(cache_key)

        try:
            if not start_date:
                start_date = datetime.utcnow() - timedelta(days=1)
            if not end_date:
                end_date = datetime.utcnow()

            db = next(get_db())
            from sqlalchemy import text

            # Get active users
            users_query = text("""
                SELECT COUNT(DISTINCT user_id) as active_users
                FROM analytics_events
                WHERE timestamp BETWEEN :start_date AND :end_date
            """)
            active_users = db.execute(users_query, {
                'start_date': start_date,
                'end_date': end_date
            }).fetchone()[0]

            # Get total sessions
            sessions_query = text("""
                SELECT COUNT(DISTINCT session_id) as total_sessions
                FROM analytics_events
                WHERE timestamp BETWEEN :start_date AND :end_date
            """)
            total_sessions = db.execute(sessions_query, {
                'start_date': start_date,
                'end_date': end_date
            }).fetchone()[0]

            # Get average session duration (simplified calculation)
            avg_duration_query = text("""
                SELECT AVG(
                    (SELECT MAX(timestamp) FROM analytics_events ae2
                     WHERE ae2.session_id = ae1.session_id) -
                    (SELECT MIN(timestamp) FROM analytics_events ae3
                     WHERE ae3.session_id = ae1.session_id)
                ) as avg_duration
                FROM analytics_events ae1
                WHERE ae1.timestamp BETWEEN :start_date AND :end_date
                GROUP BY ae1.session_id
            """)
            avg_duration_result = db.execute(avg_duration_query, {
                'start_date': start_date,
                'end_date': end_date
            }).fetchone()
            average_session_duration = avg_duration_result[0] if avg_duration_result and avg_duration_result[0] else 0

            # Get most used features
            features_query = text("""
                SELECT event_type, COUNT(*) as usage_count
                FROM analytics_events
                WHERE timestamp BETWEEN :start_date AND :end_date
                GROUP BY event_type
                ORDER BY usage_count DESC
                LIMIT 10
            """)
            most_used_features = [
                {"feature": row[0], "count": row[1]}
                for row in db.execute(features_query, {
                    'start_date': start_date,
                    'end_date': end_date
                }).fetchall()
            ]

            # Get voice command usage
            voice_query = text("""
                SELECT
                    json_extract(data, '$.intent') as intent,
                    COUNT(*) as usage_count
                FROM analytics_events
                WHERE event_type = 'voice_command'
                AND timestamp BETWEEN :start_date AND :end_date
                AND json_extract(data, '$.intent') IS NOT NULL
                GROUP BY json_extract(data, '$.intent')
                ORDER BY usage_count DESC
            """)
            voice_command_usage = {
                row[0]: row[1]
                for row in db.execute(voice_query, {
                    'start_date': start_date,
                    'end_date': end_date
                }).fetchall()
            }

            # Get OCR usage
            ocr_query = text("""
                SELECT
                    json_extract(data, '$.engine') as engine,
                    COUNT(*) as usage_count
                FROM analytics_events
                WHERE event_type = 'ocr_extraction'
                AND timestamp BETWEEN :start_date AND :end_date
                GROUP BY json_extract(data, '$.engine')
                ORDER BY usage_count DESC
            """)
            ocr_usage = {
                row[0]: row[1]
                for row in db.execute(ocr_query, {
                    'start_date': start_date,
                    'end_date': end_date
                }).fetchall()
            }

            # Get AI provider usage
            ai_query = text("""
                SELECT
                    json_extract(data, '$.provider') as provider,
                    COUNT(*) as usage_count
                FROM analytics_events
                WHERE event_type = 'ai_response'
                AND timestamp BETWEEN :start_date AND :end_date
                AND json_extract(data, '$.provider') IS NOT NULL
                GROUP BY json_extract(data, '$.provider')
                ORDER BY usage_count DESC
            """)
            ai_provider_usage = {
                row[0]: row[1]
                for row in db.execute(ai_query, {
                    'start_date': start_date,
                    'end_date': end_date
                }).fetchall()
            }

            metrics = UsageMetrics(
                active_users=active_users,
                total_sessions=total_sessions,
                average_session_duration=average_session_duration.total_seconds() if average_session_duration else 0,
                most_used_features=most_used_features,
                voice_command_usage=voice_command_usage,
                ocr_usage=ocr_usage,
                ai_provider_usage=ai_provider_usage
            )

            await self._cache_result(cache_key, metrics)
            return metrics

        except Exception as e:
            logger.error(f"Failed to get usage metrics: {e}")
            return UsageMetrics(
                active_users=0, total_sessions=0, average_session_duration=0,
                most_used_features=[], voice_command_usage={}, ocr_usage={}, ai_provider_usage={}
            )

    async def get_device_metrics(self, device_id: str = None) -> List[DeviceMetrics]:
        """Get metrics for specific devices or all devices"""
        try:
            db = next(get_db())
            from sqlalchemy import text

            # Build query
            where_clause = "AND device_id = :device_id" if device_id else ""

            query = text(f"""
                SELECT
                    device_id,
                    json_extract(data, '$.device_name') as device_name,
                    COUNT(*) as connection_count,
                    COUNT(CASE WHEN event_type LIKE '%command%' THEN 1 END) as total_commands,
                    COUNT(CASE WHEN success = 1 AND event_type LIKE '%command%' THEN 1 END) as successful_commands,
                    AVG(duration_ms) as avg_response_time,
                    MAX(timestamp) as last_seen
                FROM analytics_events
                WHERE timestamp >= datetime('now', '-24 hours')
                {where_clause}
                GROUP BY device_id
                ORDER BY connection_count DESC
            """)

            params = {'device_id': device_id} if device_id else {}
            results = db.execute(query, params).fetchall()

            device_metrics = []
            for result in results:
                device_id = result[0]
                device_name = result[1] or f"Device_{device_id[:8]}"

                # Get app usage for this device
                app_usage_query = text("""
                    SELECT
                        json_extract(data, '$.app_package') as app_package,
                        COUNT(*) as usage_count
                    FROM analytics_events
                    WHERE device_id = :device_id
                    AND event_type = 'app_open'
                    AND timestamp >= datetime('now', '-24 hours')
                    AND json_extract(data, '$.app_package') IS NOT NULL
                    GROUP BY json_extract(data, '$.app_package')
                    ORDER BY usage_count DESC
                    LIMIT 10
                """)
                app_usage_results = db.execute(app_usage_query, {'device_id': device_id}).fetchall()
                app_usage = {row[0]: row[1] for row in app_usage_results}

                # Get battery usage (simplified)
                battery_usage = {
                    "avg_level": 75.0,  # Placeholder
                    "charging_cycles": 0,  # Placeholder
                }

                device_metrics.append(DeviceMetrics(
                    device_id=device_id,
                    device_name=device_name,
                    connection_count=result[2],
                    total_commands=result[3],
                    successful_commands=result[4],
                    average_response_time=result[5] or 0.0,
                    battery_usage=battery_usage,
                    app_usage=app_usage,
                    last_seen=result[6]
                ))

            return device_metrics

        except Exception as e:
            logger.error(f"Failed to get device metrics: {e}")
            return []

    async def get_system_metrics(self) -> SystemMetrics:
        """Get system-wide metrics"""
        try:
            import psutil
            import os

            # CPU usage
            cpu_usage = psutil.cpu_percent(interval=1)

            # Memory usage
            memory = psutil.virtual_memory()
            memory_usage = memory.percent

            # Disk usage
            disk = psutil.disk_usage('/')
            disk_usage = (disk.used / disk.total) * 100

            # Network throughput (simplified)
            network = psutil.net_io_counters()
            network_throughput = {
                "bytes_sent": network.bytes_sent,
                "bytes_recv": network.bytes_recv,
                "packets_sent": network.packets_sent,
                "packets_recv": network.packets_recv,
            }

            # Database size
            db_size = await self._get_database_size()

            # Log size
            log_size = await self._get_log_size()

            return SystemMetrics(
                cpu_usage=cpu_usage,
                memory_usage=memory_usage,
                disk_usage=disk_usage,
                network_throughput=network_throughput,
                active_connections=0,  # Would need WebSocket service integration
                database_size_mb=db_size,
                log_size_mb=log_size
            )

        except ImportError:
            # psutil not available, return default values
            logger.warning("psutil not available for system metrics")
            return SystemMetrics(
                cpu_usage=0.0, memory_usage=0.0, disk_usage=0.0,
                network_throughput={}, active_connections=0,
                database_size_mb=0.0, log_size_mb=0.0
            )
        except Exception as e:
            logger.error(f"Failed to get system metrics: {e}")
            return SystemMetrics(
                cpu_usage=0.0, memory_usage=0.0, disk_usage=0.0,
                network_throughput={}, active_connections=0,
                database_size_mb=0.0, log_size_mb=0.0
            )

    async def _get_database_size(self) -> float:
        """Get database size in MB"""
        try:
            db_path = "data/ishchat.db"
            if os.path.exists(db_path):
                size_bytes = os.path.getsize(db_path)
                return size_bytes / (1024 * 1024)  # Convert to MB
            return 0.0
        except Exception:
            return 0.0

    async def _get_log_size(self) -> float:
        """Get log file size in MB"""
        try:
            log_files = [
                "logs/app.log",
                "logs/error.log",
                "logs/access.log"
            ]
            total_size = 0
            for log_file in log_files:
                if os.path.exists(log_file):
                    total_size += os.path.getsize(log_file)
            return total_size / (1024 * 1024)  # Convert to MB
        except Exception:
            return 0.0

    async def get_analytics_summary(self, days: int = 7) -> Dict[str, Any]:
        """Get comprehensive analytics summary"""
        try:
            end_date = datetime.utcnow()
            start_date = end_date - timedelta(days=days)

            # Get all metrics
            performance = await self.get_performance_metrics(start_date, end_date)
            usage = await self.get_usage_metrics(start_date, end_date)
            devices = await self.get_device_metrics()
            system = await self.get_system_metrics()

            # Get daily trends
            daily_trends = await self._get_daily_trends(start_date, end_date)

            return {
                "summary_period": {
                    "start_date": start_date.isoformat(),
                    "end_date": end_date.isoformat(),
                    "days": days
                },
                "performance": asdict(performance),
                "usage": asdict(usage),
                "devices": [asdict(device) for device in devices[:10]],  # Top 10 devices
                "system": asdict(system),
                "daily_trends": daily_trends,
                "generated_at": datetime.utcnow().isoformat()
            }

        except Exception as e:
            logger.error(f"Failed to get analytics summary: {e}")
            return {"error": str(e)}

    async def _get_daily_trends(self, start_date: datetime, end_date: datetime) -> List[Dict[str, Any]]:
        """Get daily trend data"""
        try:
            db = next(get_db())
            from sqlalchemy import text

            query = text("""
                SELECT
                    DATE(timestamp) as date,
                    COUNT(*) as total_events,
                    COUNT(CASE WHEN success = 1 THEN 1 END) as successful_events,
                    AVG(duration_ms) as avg_response_time
                FROM analytics_events
                WHERE timestamp BETWEEN :start_date AND :end_date
                GROUP BY DATE(timestamp)
                ORDER BY date
            """)

            results = db.execute(query, {
                'start_date': start_date,
                'end_date': end_date
            }).fetchall()

            return [
                {
                    "date": result[0],
                    "total_events": result[1],
                    "successful_events": result[2],
                    "success_rate": (result[2] / result[1] * 100) if result[1] > 0 else 0,
                    "avg_response_time": result[3] or 0
                }
                for result in results
            ]

        except Exception as e:
            logger.error(f"Failed to get daily trends: {e}")
            return []

    def _calculate_percentile(self, values: List[float], percentile: int) -> float:
        """Calculate percentile value from list of values"""
        if not values:
            return 0.0

        sorted_values = sorted(values)
        index = (percentile / 100) * (len(sorted_values) - 1)

        if index.is_integer():
            return sorted_values[int(index)]
        else:
            lower = sorted_values[int(index)]
            upper = sorted_values[int(index) + 1]
            return lower + (upper - lower) * (index - int(index))

    async def _is_cache_valid(self, cache_key: str) -> bool:
        """Check if cached result is still valid"""
        if cache_key not in self.metrics_cache:
            return False

        last_update = self.last_cache_update.get(cache_key)
        if not last_update:
            return False

        return (datetime.utcnow() - last_update).total_seconds() < self.cache_ttl

    async def _cache_result(self, cache_key: str, result: Any):
        """Cache analytics result"""
        self.metrics_cache[cache_key] = result
        self.last_cache_update[cache_key] = datetime.utcnow()

    async def _invalidate_cache(self, event_type: str = None):
        """Invalidate cache entries"""
        if event_type:
            keys_to_remove = [key for key in self.metrics_cache.keys()
                            if event_type in key]
            for key in keys_to_remove:
                self.metrics_cache.pop(key, None)
                self.last_cache_update.pop(key, None)
        else:
            self.metrics_cache.clear()
            self.last_cache_update.clear()

    async def cleanup_old_data(self, days_to_keep: int = 90):
        """Clean up old analytics data"""
        try:
            cutoff_date = datetime.utcnow() - timedelta(days=days_to_keep)
            db = next(get_db())
            from sqlalchemy import text

            delete_query = text("""
                DELETE FROM analytics_events
                WHERE timestamp < :cutoff_date
            """)

            result = db.execute(delete_query, {'cutoff_date': cutoff_date})
            db.commit()

            logger.info(f"Cleaned up {result.rowcount} old analytics records")

        except Exception as e:
            logger.error(f"Failed to cleanup old analytics data: {e}")

# Global analytics service instance
analytics_service = AnalyticsService()