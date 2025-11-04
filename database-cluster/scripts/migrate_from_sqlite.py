#!/usr/bin/env python3
"""
SQLite to PostgreSQL Migration Script for ISH Chat
Handles data migration from existing SQLite database to PostgreSQL cluster
"""

import sqlite3
import psycopg2
from psycopg2 import sql, extras
import json
import os
import logging
from datetime import datetime
from typing import Dict, List, Any
import argparse
from dataclasses import dataclass
from decimal import Decimal
import sys

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

@dataclass
class MigrationConfig:
    """Configuration for database migration"""
    sqlite_path: str
    postgres_host: str = "localhost"
    postgres_port: int = 5432
    postgres_database: str = "ish_chat"
    postgres_user: str = "ish_chat_app"
    postgres_password: str = "secure_app_password"
    instance_id: str = "default"
    batch_size: int = 1000
    dry_run: bool = False

class SQLiteToPostgresMigrator:
    """Handles migration from SQLite to PostgreSQL"""

    def __init__(self, config: MigrationConfig):
        self.config = config
        self.sqlite_conn = None
        self.postgres_conn = None
        self.migration_stats = {
            'tables_migrated': 0,
            'total_records': 0,
            'errors': 0,
            'start_time': None,
            'end_time': None
        }

    def connect_databases(self):
        """Establish connections to both databases"""
        try:
            # Connect to SQLite
            logger.info(f"Connecting to SQLite database: {self.config.sqlite_path}")
            self.sqlite_conn = sqlite3.connect(self.config.sqlite_path)
            self.sqlite_conn.row_factory = sqlite3.Row

            # Connect to PostgreSQL
            logger.info(f"Connecting to PostgreSQL: {self.config.postgres_host}:{self.config.postgres_port}")
            self.postgres_conn = psycopg2.connect(
                host=self.config.postgres_host,
                port=self.config.postgres_port,
                database=self.config.postgres_database,
                user=self.config.postgres_user,
                password=self.config.postgres_password
            )
            self.postgres_conn.autocommit = False

            # Set instance context for row-level security
            with self.postgres_conn.cursor() as cursor:
                cursor.execute("SET app.current_instance_id = %s", (self.config.instance_id,))

            logger.info("Database connections established successfully")

        except Exception as e:
            logger.error(f"Failed to connect to databases: {e}")
            raise

    def close_connections(self):
        """Close database connections"""
        if self.sqlite_conn:
            self.sqlite_conn.close()
        if self.postgres_conn:
            self.postgres_conn.close()
        logger.info("Database connections closed")

    def get_sqlite_tables(self) -> List[str]:
        """Get list of tables in SQLite database"""
        cursor = self.sqlite_conn.cursor()
        cursor.execute("""
            SELECT name FROM sqlite_master
            WHERE type='table' AND name NOT LIKE 'sqlite_%'
            ORDER BY name
        """)
        return [row[0] for row in cursor.fetchall()]

    def get_table_schema(self, table_name: str) -> List[Dict]:
        """Get schema information for a SQLite table"""
        cursor = self.sqlite_conn.cursor()
        cursor.execute(f"PRAGMA table_info({table_name})")
        return [dict(row) for row in cursor.fetchall()]

    def transform_row_for_postgres(self, row: Dict, table_name: str) -> Dict:
        """Transform a row from SQLite to PostgreSQL format"""
        transformed = {}

        for key, value in row.items():
            # Skip empty values
            if value is None:
                transformed[key] = None
                continue

            # Transform based on column name and table
            if key in ['created_at', 'completed_at', 'last_seen', 'timestamp'] and isinstance(value, str):
                # Convert ISO timestamp strings
                try:
                    if value.isdigit():
                        # Unix timestamp
                        transformed[key] = datetime.fromtimestamp(int(value))
                    else:
                        # ISO string
                        transformed[key] = datetime.fromisoformat(value.replace('Z', '+00:00'))
                except (ValueError, OSError):
                    transformed[key] = datetime.utcnow()
            elif key.endswith('_at') and isinstance(value, str):
                try:
                    transformed[key] = datetime.fromisoformat(value.replace('Z', '+00:00'))
                except (ValueError, OSError):
                    transformed[key] = datetime.utcnow()
            elif key in ['models_found', 'screenshot_paths', 'token_usage', 'test_metadata', 'metadata', 'data', 'capabilities', 'device_metadata', 'tags'] and isinstance(value, str):
                # Parse JSON strings
                try:
                    transformed[key] = json.loads(value) if value else {}
                except json.JSONDecodeError:
                    transformed[key] = {}
            elif key in ['battery_level', 'priority', 'screenshots_taken', 'duration_ms', 'execution_time_ms', 'response_length', 'response_tokens', 'prompt_tokens', 'total_tokens', 'health_score'] and isinstance(value, str):
                # Convert numeric strings to integers
                try:
                    transformed[key] = int(value) if value else None
                except ValueError:
                    transformed[key] = None
            elif key in ['response_time', 'execution_time', 'estimated_cost', 'quality_score', 'confidence_score'] and isinstance(value, str):
                # Convert to float
                try:
                    transformed[key] = float(value) if value else None
                except ValueError:
                    transformed[key] = None
            elif key in ['connected', 'response_received', 'success'] and isinstance(value, str):
                # Convert boolean strings
                transformed[key] = value.lower() in ('true', '1', 'yes', 'on')
            else:
                transformed[key] = value

        # Add instance_id for multi-instance support
        if 'instance_id' not in transformed:
            transformed['instance_id'] = self.config.instance_id

        return transformed

    def migrate_table(self, table_name: str) -> int:
        """Migrate a single table from SQLite to PostgreSQL"""
        logger.info(f"Migrating table: {table_name}")

        # Map SQLite table names to PostgreSQL table names
        table_mapping = {
            'automation_sessions': 'automation_sessions',
            'perplexity_queries': 'perplexity_queries',
            'device_status': 'device_status',
            'model_exploration': 'model_exploration',
            'analytics_events': 'analytics_events',
            'ai_test_results': 'ai_test_results'
        }

        postgres_table = table_mapping.get(table_name)
        if not postgres_table:
            logger.warning(f"Skipping table {table_name} (no mapping found)")
            return 0

        try:
            # Get SQLite data
            cursor = self.sqlite_conn.cursor()
            cursor.execute(f"SELECT * FROM {table_name}")
            rows = cursor.fetchall()

            if not rows:
                logger.info(f"No data found in table {table_name}")
                return 0

            # Transform and insert data in batches
            total_inserted = 0
            batch = []

            for row in rows:
                # Convert Row object to dict
                row_dict = dict(zip([col[0] for col in cursor.description], row))

                # Transform for PostgreSQL
                transformed_row = self.transform_row_for_postgres(row_dict, table_name)
                batch.append(transformed_row)

                # Insert batch
                if len(batch) >= self.config.batch_size:
                    total_inserted += self.insert_batch(postgres_table, batch)
                    batch = []

            # Insert remaining records
            if batch:
                total_inserted += self.insert_batch(postgres_table, batch)

            logger.info(f"Migrated {total_inserted} records from {table_name}")
            return total_inserted

        except Exception as e:
            logger.error(f"Error migrating table {table_name}: {e}")
            self.migration_stats['errors'] += 1
            return 0

    def insert_batch(self, table_name: str, batch: List[Dict]) -> int:
        """Insert a batch of records into PostgreSQL"""
        if not batch or self.config.dry_run:
            return len(batch)

        try:
            with self.postgres_conn.cursor() as cursor:
                # Get column names from the first record
                columns = list(batch[0].keys())

                # Build INSERT query
                query = sql.SQL("INSERT INTO {} ({}) VALUES ({})").format(
                    sql.Identifier(table_name),
                    sql.SQL(', ').join(map(sql.Identifier, columns)),
                    sql.SQL(', ').join(sql.Placeholder() * len(columns))
                )

                # Prepare values
                values = []
                for record in batch:
                    record_values = [record.get(col) for col in columns]
                    values.append(record_values)

                # Execute batch insert
                extras.execute_batch(cursor, query, values, page_size=100)
                self.postgres_conn.commit()

                return len(batch)

        except Exception as e:
            logger.error(f"Error inserting batch into {table_name}: {e}")
            self.postgres_conn.rollback()
            return 0

    def validate_migration(self):
        """Validate the migration by comparing record counts"""
        logger.info("Validating migration...")

        validation_results = {}

        # Get table counts from SQLite
        sqlite_cursor = self.sqlite_conn.cursor()
        sqlite_cursor.execute("""
            SELECT name FROM sqlite_master
            WHERE type='table' AND name NOT LIKE 'sqlite_%'
        """)
        sqlite_tables = [row[0] for row in sqlite_cursor.fetchall()]

        for table in sqlite_tables:
            # Get SQLite count
            sqlite_cursor.execute(f"SELECT COUNT(*) FROM {table}")
            sqlite_count = sqlite_cursor.fetchone()[0]

            # Get PostgreSQL count
            table_mapping = {
                'automation_sessions': 'automation_sessions',
                'perplexity_queries': 'perplexity_queries',
                'device_status': 'device_status',
                'model_exploration': 'model_exploration',
                'analytics_events': 'analytics_events',
                'ai_test_results': 'ai_test_results'
            }

            postgres_table = table_mapping.get(table)
            if postgres_table:
                try:
                    with self.postgres_conn.cursor() as cursor:
                        cursor.execute(
                            sql.SQL("SELECT COUNT(*) FROM {} WHERE instance_id = %s").format(
                                sql.Identifier(postgres_table)
                            ),
                            (self.config.instance_id,)
                        )
                        postgres_count = cursor.fetchone()[0]
                except Exception as e:
                    logger.error(f"Error getting PostgreSQL count for {table}: {e}")
                    postgres_count = -1

                validation_results[table] = {
                    'sqlite_count': sqlite_count,
                    'postgres_count': postgres_count,
                    'match': sqlite_count == postgres_count
                }

                status = "✓" if sqlite_count == postgres_count else "✗"
                logger.info(f"{status} {table}: SQLite={sqlite_count}, PostgreSQL={postgres_count}")

        return validation_results

    def run_migration(self) -> Dict:
        """Run the complete migration process"""
        self.migration_stats['start_time'] = datetime.utcnow()

        try:
            self.connect_databases()

            # Get all tables to migrate
            tables = self.get_sqlite_tables()
            logger.info(f"Found {len(tables)} tables to migrate: {tables}")

            # Migrate each table
            for table in tables:
                records = self.migrate_table(table)
                self.migration_stats['total_records'] += records
                if records > 0:
                    self.migration_stats['tables_migrated'] += 1

            # Validate migration
            validation_results = self.validate_migration()

            # Generate summary
            self.migration_stats['end_time'] = datetime.utcnow()
            duration = self.migration_stats['end_time'] - self.migration_stats['start_time']

            summary = {
                **self.migration_stats,
                'duration_seconds': duration.total_seconds(),
                'validation_results': validation_results,
                'instance_id': self.config.instance_id
            }

            logger.info(f"Migration completed in {duration.total_seconds():.2f} seconds")
            logger.info(f"Migrated {self.migration_stats['tables_migrated']} tables with {self.migration_stats['total_records']} total records")

            if self.migration_stats['errors'] > 0:
                logger.warning(f"Migration completed with {self.migration_stats['errors']} errors")

            return summary

        except Exception as e:
            logger.error(f"Migration failed: {e}")
            raise
        finally:
            self.close_connections()

def main():
    """Main migration function"""
    parser = argparse.ArgumentParser(description='Migrate ISH Chat data from SQLite to PostgreSQL')
    parser.add_argument('--sqlite-path', required=True, help='Path to SQLite database file')
    parser.add_argument('--postgres-host', default='localhost', help='PostgreSQL host')
    parser.add_argument('--postgres-port', type=int, default=5432, help='PostgreSQL port')
    parser.add_argument('--postgres-database', default='ish_chat', help='PostgreSQL database name')
    parser.add_argument('--postgres-user', default='ish_chat_app', help='PostgreSQL username')
    parser.add_argument('--postgres-password', default='secure_app_password', help='PostgreSQL password')
    parser.add_argument('--instance-id', default='default', help='Instance ID for multi-instance support')
    parser.add_argument('--batch-size', type=int, default=1000, help='Batch size for inserts')
    parser.add_argument('--dry-run', action='store_true', help='Perform a dry run without inserting data')

    args = parser.parse_args()

    # Validate SQLite file exists
    if not os.path.exists(args.sqlite_path):
        logger.error(f"SQLite file not found: {args.sqlite_path}")
        sys.exit(1)

    # Create migration config
    config = MigrationConfig(
        sqlite_path=args.sqlite_path,
        postgres_host=args.postgres_host,
        postgres_port=args.postgres_port,
        postgres_database=args.postgres_database,
        postgres_user=args.postgres_user,
        postgres_password=args.postgres_password,
        instance_id=args.instance_id,
        batch_size=args.batch_size,
        dry_run=args.dry_run
    )

    # Run migration
    migrator = SQLiteToPostgresMigrator(config)

    try:
        if args.dry_run:
            logger.info("=== DRY RUN MODE - NO DATA WILL BE INSERTED ===")

        results = migrator.run_migration()

        # Save migration report
        report_path = f"migration_report_{datetime.utcnow().strftime('%Y%m%d_%H%M%S')}.json"
        with open(report_path, 'w') as f:
            json.dump(results, f, indent=2, default=str)

        logger.info(f"Migration report saved to: {report_path}")

        # Exit with appropriate code
        sys.exit(0 if results['errors'] == 0 else 1)

    except Exception as e:
        logger.error(f"Migration failed: {e}")
        sys.exit(1)

if __name__ == "__main__":
    main()