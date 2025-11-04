#!/usr/bin/env python3
"""
ISH Chat PostgreSQL Cluster Health Check Script
Monitors the health and performance of the PostgreSQL cluster
"""

import psycopg2
import redis
import requests
import json
import sys
import logging
from datetime import datetime, timedelta
from typing import Dict, List, Any, Optional
import argparse
import smtplib
from email.mime.text import MimeText
from dataclasses import dataclass

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

@dataclass
class HealthCheckConfig:
    """Configuration for health checks"""
    postgres_host: str = "postgres-primary"
    postgres_port: int = 5432
    postgres_database: str = "ish_chat"
    postgres_user: str = "postgres"
    postgres_password: str = "secure_password"

    replica_hosts: List[str] = None

    redis_host: str = "redis"
    redis_port: int = 6379
    redis_password: str = "redis_password"

    haproxy_stats_url: str = "http://haproxy:8404/stats"

    patroni_api_ports: List[int] = None

    alert_threshold_replication_lag: int = 10  # seconds
    alert_threshold_connection_count: int = 150  # out of 200
    alert_threshold_disk_usage: float = 85.0  # percentage
    alert_threshold_response_time: float = 1.0  # seconds

    smtp_server: Optional[str] = None
    smtp_port: int = 587
    smtp_username: Optional[str] = None
    smtp_password: Optional[str] = None
    alert_email: Optional[str] = None

class PostgreSQLClusterHealthChecker:
    """Health checker for PostgreSQL cluster"""

    def __init__(self, config: HealthCheckConfig):
        self.config = config
        self.health_status = {
            'timestamp': datetime.utcnow().isoformat(),
            'overall_status': 'healthy',
            'components': {},
            'alerts': [],
            'metrics': {}
        }

    def check_postgres_primary(self) -> Dict[str, Any]:
        """Check primary PostgreSQL instance"""
        status = {
            'name': 'PostgreSQL Primary',
            'status': 'healthy',
            'details': {},
            'alerts': []
        }

        try:
            conn = psycopg2.connect(
                host=self.config.postgres_host,
                port=self.config.postgres_port,
                database=self.config.postgres_database,
                user=self.config.postgres_user,
                password=self.config.postgres_password,
                connect_timeout=5
            )

            with conn.cursor() as cursor:
                # Check if primary
                cursor.execute("SELECT pg_is_in_recovery()")
                is_recovery = cursor.fetchone()[0]
                status['details']['is_primary'] = not is_recovery

                if is_recovery:
                    status['status'] = 'warning'
                    status['alerts'].append('Primary database is in recovery mode')

                # Get connection count
                cursor.execute("""
                    SELECT COUNT(*) FROM pg_stat_activity
                    WHERE state = 'active'
                """)
                active_connections = cursor.fetchone()[0]
                status['details']['active_connections'] = active_connections

                if active_connections > self.config.alert_threshold_connection_count:
                    status['alerts'].append(f'High connection count: {active_connections}')

                # Get database size
                cursor.execute("SELECT pg_database_size(%s)", (self.config.postgres_database,))
                db_size = cursor.fetchone()[0]
                status['details']['database_size_bytes'] = db_size
                status['details']['database_size_human'] = self._format_bytes(db_size)

                # Check replication status
                cursor.execute("""
                    SELECT
                        COUNT(*) as replica_count,
                        pg_size_pretty(pg_wal_lsn_diff(pg_current_wal_lsn(),
                            COALESCE(MAX(replay_lsn), '0/0'))) as max_lag
                    FROM pg_stat_replication
                """)
                replica_info = cursor.fetchone()
                status['details']['replica_count'] = replica_info[0]
                status['details']['max_replication_lag'] = replica_info[1]

                # Get transaction stats
                cursor.execute("""
                    SELECT
                        xact_commit + xact_rollback as total_transactions,
                        blks_read,
                        blks_hit,
                        tup_returned,
                        tup_fetched,
                        tup_inserted,
                        tup_updated,
                        tup_deleted
                    FROM pg_stat_database
                    WHERE datname = %s
                """, (self.config.postgres_database,))
                stats = cursor.fetchone()
                status['details'].update({
                    'total_transactions': stats[0],
                    'blocks_read': stats[1],
                    'blocks_hit': stats[2],
                    'cache_hit_ratio': round(stats[2] / (stats[1] + stats[2]) * 100, 2) if (stats[1] + stats[2]) > 0 else 0,
                    'tuples_returned': stats[3],
                    'tuples_fetched': stats[4],
                    'tuples_inserted': stats[5],
                    'tuples_updated': stats[6],
                    'tuples_deleted': stats[7]
                })

            conn.close()

        except Exception as e:
            status['status'] = 'unhealthy'
            status['alerts'].append(f'Connection failed: {str(e)}')

        return status

    def check_postgres_replicas(self) -> List[Dict[str, Any]]:
        """Check replica PostgreSQL instances"""
        replica_statuses = []

        for host in self.config.replica_hosts:
            status = {
                'name': f'PostgreSQL Replica ({host})',
                'status': 'healthy',
                'details': {},
                'alerts': []
            }

            try:
                conn = psycopg2.connect(
                    host=host,
                    port=self.config.postgres_port,
                    database=self.config.postgres_database,
                    user=self.config.postgres_user,
                    password=self.config.postgres_password,
                    connect_timeout=5
                )

                with conn.cursor() as cursor:
                    # Check if replica
                    cursor.execute("SELECT pg_is_in_recovery()")
                    is_recovery = cursor.fetchone()[0]
                    status['details']['is_replica'] = is_recovery

                    if not is_recovery:
                        status['status'] = 'warning'
                        status['alerts'].append('Replica is not in recovery mode')

                    # Get replication lag
                    cursor.execute("""
                        SELECT
                            pg_last_wal_receive_lsn(),
                            pg_last_wal_replay_lsn(),
                            pg_size_pretty(pg_wal_lsn_diff(
                                pg_last_wal_receive_lsn(),
                                pg_last_wal_replay_lsn()
                            )) as replay_lag
                    """)
                    replay_info = cursor.fetchone()
                    status['details'].update({
                        'receive_lsn': replay_info[0],
                        'replay_lsn': replay_info[1],
                        'replication_lag': replay_info[2]
                    })

                    # Check replication lag in seconds
                    cursor.execute("""
                        SELECT EXTRACT(EPOCH FROM (
                            pg_last_xact_replay_timestamp()
                        ))
                    """)
                    lag_seconds = cursor.fetchone()[0]
                    status['details']['replication_lag_seconds'] = lag_seconds

                    if lag_seconds > self.config.alert_threshold_replication_lag:
                        status['alerts'].append(f'High replication lag: {lag_seconds:.1f}s')

                conn.close()

            except Exception as e:
                status['status'] = 'unhealthy'
                status['alerts'].append(f'Connection failed: {str(e)}')

            replica_statuses.append(status)

        return replica_statuses

    def check_redis(self) -> Dict[str, Any]:
        """Check Redis instance"""
        status = {
            'name': 'Redis',
            'status': 'healthy',
            'details': {},
            'alerts': []
        }

        try:
            r = redis.Redis(
                host=self.config.redis_host,
                port=self.config.redis_port,
                password=self.config.redis_password,
                decode_responses=True,
                socket_timeout=5
            )

            # Test connection
            r.ping()

            # Get info
            info = r.info()
            status['details'] = {
                'version': info.get('redis_version'),
                'connected_clients': info.get('connected_clients'),
                'used_memory': info.get('used_memory_human'),
                'used_memory_peak': info.get('used_memory_peak_human'),
                'keyspace_hits': info.get('keyspace_hits', 0),
                'keyspace_misses': info.get('keyspace_misses', 0),
                'uptime_in_seconds': info.get('uptime_in_seconds')
            }

            # Calculate hit ratio
            hits = info.get('keyspace_hits', 0)
            misses = info.get('keyspace_misses', 0)
            total = hits + misses
            if total > 0:
                status['details']['hit_ratio'] = round((hits / total) * 100, 2)

        except Exception as e:
            status['status'] = 'unhealthy'
            status['alerts'].append(f'Redis connection failed: {str(e)}')

        return status

    def check_haproxy(self) -> Dict[str, Any]:
        """Check HAProxy status"""
        status = {
            'name': 'HAProxy',
            'status': 'healthy',
            'details': {},
            'alerts': []
        }

        try:
            response = requests.get(
                self.config.haproxy_stats_url,
                timeout=10,
                verify=False
            )

            if response.status_code == 200:
                # Parse CSV stats (simplified)
                lines = response.text.strip().split('\n')
                if len(lines) > 2:  # Header + separator + data
                    status['details']['backend_count'] = len(lines) - 2
                    status['details']['status_page_accessible'] = True

                    # Count healthy backends
                    healthy_backends = 0
                    for line in lines[2:]:  # Skip header and separator
                        parts = line.split(',')
                        if len(parts) > 17:  # Status column
                            if parts[17] in ['UP', 'OPEN']:
                                healthy_backends += 1

                    status['details']['healthy_backends'] = healthy_backends
                    status['details']['total_backends'] = len(lines) - 2

                    if healthy_backends < (len(lines) - 2):
                        status['alerts'].append(f'Some backends are down: {healthy_backends}/{len(lines)-2}')

            else:
                status['status'] = 'warning'
                status['alerts'].append(f'Status page returned: {response.status_code}')

        except Exception as e:
            status['status'] = 'unhealthy'
            status['alerts'].append(f'HAProxy check failed: {str(e)}')

        return status

    def check_patroni(self) -> List[Dict[str, Any]]:
        """Check Patroni API for each node"""
        patroni_statuses = []

        for port in self.config.patroni_api_ports:
            status = {
                'name': f'Patroni API (port {port})',
                'status': 'healthy',
                'details': {},
                'alerts': []
            }

            try:
                response = requests.get(
                    f'http://localhost:{port}/health',
                    timeout=5
                )

                if response.status_code == 200:
                    cluster_info = response.json()
                    status['details'] = {
                        'state': cluster_info.get('state'),
                        'role': cluster_info.get('role'),
                        'timeline': cluster_info.get('timeline'),
                        'lag': cluster_info.get('lag')
                    }

                    if cluster_info.get('state') != 'running':
                        status['alerts'].append(f'Node state: {cluster_info.get("state")}')

                else:
                    status['status'] = 'warning'
                    status['alerts'].append(f'API returned: {response.status_code}')

            except Exception as e:
                status['status'] = 'unhealthy'
                status['alerts'].append(f'Patroni API check failed: {str(e)}')

            patroni_statuses.append(status)

        return patroni_statuses

    def run_health_check(self) -> Dict[str, Any]:
        """Run complete health check"""
        logger.info("Starting PostgreSQL cluster health check")

        # Check all components
        primary_status = self.check_postgres_primary()
        replica_statuses = self.check_postgres_replicas()
        redis_status = self.check_redis()
        haproxy_status = self.check_haproxy()
        patroni_statuses = self.check_patroni()

        # Compile results
        self.health_status['components'] = {
            'postgres_primary': primary_status,
            'postgres_replicas': replica_statuses,
            'redis': redis_status,
            'haproxy': haproxy_status,
            'patroni': patroni_statuses
        }

        # Collect all alerts
        all_alerts = []
        for component_status in [primary_status, redis_status, haproxy_status]:
            all_alerts.extend(component_status.get('alerts', []))

        for replica_status in replica_statuses:
            all_alerts.extend(replica_status.get('alerts', []))

        for patroni_status in patroni_statuses:
            all_alerts.extend(patroni_status.get('alerts', []))

        self.health_status['alerts'] = all_alerts

        # Determine overall status
        if any(component['status'] == 'unhealthy' for component in
               [primary_status, redis_status, haproxy_status]):
            self.health_status['overall_status'] = 'unhealthy'
        elif any(component['status'] == 'warning' for component in
                 [primary_status, redis_status, haproxy_status] +
                 replica_statuses + patroni_statuses):
            self.health_status['overall_status'] = 'warning'
        else:
            self.health_status['overall_status'] = 'healthy'

        # Calculate metrics
        self._calculate_metrics()

        logger.info(f"Health check completed. Overall status: {self.health_status['overall_status']}")
        return self.health_status

    def _calculate_metrics(self):
        """Calculate performance metrics"""
        metrics = {}

        # PostgreSQL metrics
        primary = self.health_status['components']['postgres_primary']
        metrics['postgres'] = {
            'active_connections': primary['details'].get('active_connections', 0),
            'cache_hit_ratio': primary['details'].get('cache_hit_ratio', 0),
            'total_transactions': primary['details'].get('total_transactions', 0),
            'database_size_bytes': primary['details'].get('database_size_bytes', 0),
            'replica_count': primary['details'].get('replica_count', 0)
        }

        # Redis metrics
        redis = self.health_status['components']['redis']
        metrics['redis'] = {
            'connected_clients': redis['details'].get('connected_clients', 0),
            'hit_ratio': redis['details'].get('hit_ratio', 0),
            'uptime_seconds': redis['details'].get('uptime_in_seconds', 0)
        }

        # HAProxy metrics
        haproxy = self.health_status['components']['haproxy']
        metrics['haproxy'] = {
            'healthy_backends': haproxy['details'].get('healthy_backends', 0),
            'total_backends': haproxy['details'].get('total_backends', 0)
        }

        self.health_status['metrics'] = metrics

    def _format_bytes(self, bytes_value: int) -> str:
        """Format bytes to human readable format"""
        for unit in ['B', 'KB', 'MB', 'GB', 'TB']:
            if bytes_value < 1024.0:
                return f"{bytes_value:.2f} {unit}"
            bytes_value /= 1024.0
        return f"{bytes_value:.2f} PB"

    def send_alert(self, message: str, severity: str = 'warning'):
        """Send alert notification"""
        if not self.config.alert_email:
            logger.warning(f"ALERT ({severity}): {message}")
            return

        try:
            msg = MimeText(f"""
ISH Chat PostgreSQL Cluster Alert

Severity: {severity}
Time: {datetime.utcnow().isoformat()}

Message: {message}

This is an automated alert from the ISH Chat health monitoring system.
            """)

            msg['Subject'] = f'ISH Chat Cluster Alert - {severity.upper()}'
            msg['From'] = self.config.smtp_username
            msg['To'] = self.config.alert_email

            server = smtplib.SMTP(self.config.smtp_server, self.config.smtp_port)
            server.starttls()
            server.login(self.config.smtp_username, self.config.smtp_password)
            server.send_message(msg)
            server.quit()

            logger.info(f"Alert sent: {message}")

        except Exception as e:
            logger.error(f"Failed to send alert: {e}")

def main():
    """Main health check function"""
    parser = argparse.ArgumentParser(description='ISH Chat PostgreSQL Cluster Health Check')
    parser.add_argument('--config-file', help='Configuration file path')
    parser.add_argument('--postgres-host', default='postgres-primary', help='PostgreSQL host')
    parser.add_argument('--postgres-port', type=int, default=5432, help='PostgreSQL port')
    parser.add_argument('--postgres-user', default='postgres', help='PostgreSQL user')
    parser.add_argument('--postgres-password', default='secure_password', help='PostgreSQL password')
    parser.add_argument('--redis-host', default='redis', help='Redis host')
    parser.add_argument('--redis-port', type=int, default=6379, help='Redis port')
    parser.add_argument('--output-format', choices=['json', 'text'], default='json', help='Output format')
    parser.add_argument('--send-alerts', action='store_true', help='Send email alerts for issues')
    parser.add_argument('--verbose', '-v', action='store_true', help='Verbose output')

    args = parser.parse_args()

    # Create configuration
    config = HealthCheckConfig(
        postgres_host=args.postgres_host,
        postgres_port=args.postgres_port,
        postgres_user=args.postgres_user,
        postgres_password=args.postgres_password,
        redis_host=args.redis_host,
        redis_port=args.redis_port,
        replica_hosts=['postgres-replica1', 'postgres-replica2'],
        patroni_api_ports=[8008, 8009, 8010]
    )

    if args.verbose:
        logging.getLogger().setLevel(logging.DEBUG)

    # Run health check
    checker = PostgreSQLClusterHealthChecker(config)
    health_status = checker.run_health_check()

    # Output results
    if args.output_format == 'json':
        print(json.dumps(health_status, indent=2))
    else:
        print(f"\n=== ISH Chat PostgreSQL Cluster Health Check ===")
        print(f"Overall Status: {health_status['overall_status'].upper()}")
        print(f"Timestamp: {health_status['timestamp']}")

        for component_name, component_data in health_status['components'].items():
            if isinstance(component_data, list):
                print(f"\n{component_name.upper()}:")
                for item in component_data:
                    print(f"  - {item['name']}: {item['status'].upper()}")
                    for alert in item.get('alerts', []):
                        print(f"    ALERT: {alert}")
            else:
                print(f"\n{component_data['name']}: {component_data['status'].upper()}")
                for alert in component_data.get('alerts', []):
                    print(f"  ALERT: {alert}")

        if health_status['alerts']:
            print(f"\nTOTAL ALERTS: {len(health_status['alerts'])}")

    # Send alerts if configured and there are issues
    if args.send_alerts and health_status['overall_status'] != 'healthy':
        alert_message = f"Cluster status: {health_status['overall_status']}. Alerts: {len(health_status['alerts'])}"
        checker.send_alert(alert_message, health_status['overall_status'])

    # Exit with appropriate code
    if health_status['overall_status'] == 'unhealthy':
        sys.exit(2)
    elif health_status['overall_status'] == 'warning':
        sys.exit(1)
    else:
        sys.exit(0)

if __name__ == "__main__":
    main()