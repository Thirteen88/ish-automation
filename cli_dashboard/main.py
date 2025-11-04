#!/usr/bin/env python3
"""
ISH Chat CLI Status Dashboard
Real-time terminal dashboard for monitoring multi-instance AI system
"""
import asyncio
import sys
import os
import signal
import argparse
from pathlib import Path
from typing import Optional

# Add current directory to path for imports
current_dir = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, current_dir)

from core.dashboard import ISHChatDashboard
from core.config import DashboardConfig
from utils.logger import setup_logger

# Global variables for signal handling
dashboard_instance: Optional[ISHChatDashboard] = None
shutdown_event = asyncio.Event()

def signal_handler(signum, frame):
    """Handle shutdown signals gracefully"""
    print(f"\nReceived signal {signum}, shutting down gracefully...")
    if dashboard_instance:
        # Schedule the stop coroutine to run in the event loop
        try:
            loop = asyncio.get_running_loop()
            loop.create_task(dashboard_instance.stop())
        except RuntimeError:
            # No event loop running, call it synchronously (shouldn't happen in normal operation)
            pass
    shutdown_event.set()

async def main():
    """Main entry point for CLI dashboard"""
    parser = argparse.ArgumentParser(
        description="ISH Chat CLI Status Dashboard - Real-time AI System Monitoring"
    )
    parser.add_argument(
        "--config", "-c",
        type=str,
        help="Path to configuration file",
        default=None
    )
    parser.add_argument(
        "--refresh-rate", "-r",
        type=float,
        help="Refresh rate in seconds",
        default=None
    )
    parser.add_argument(
        "--api-base",
        type=str,
        help="Base URL for ISH Chat API",
        default="http://localhost:8000"
    )
    parser.add_argument(
        "--log-level",
        choices=["DEBUG", "INFO", "WARNING", "ERROR"],
        default="INFO",
        help="Logging level"
    )
    parser.add_argument(
        "--debug", "-d",
        action="store_true",
        help="Enable debug mode"
    )
    parser.add_argument(
        "--simulate-data", "-s",
        action="store_true",
        help="Use simulated data instead of connecting to real API"
    )

    args = parser.parse_args()

    # Setup logging
    logger = setup_logger(
        "cli_dashboard",
        level=args.log_level,
        debug=args.debug
    )

    # Load configuration
    config = DashboardConfig.load_from_file(args.config) if args.config else DashboardConfig()

    # Override config with command line arguments
    if args.refresh_rate:
        config.refresh_rate = args.refresh_rate
    if args.api_base:
        config.api_base_url = args.api_base
    if args.debug:
        config.debug = True
    if args.simulate_data:
        config.simulate_data = True

    logger.info("Starting ISH Chat CLI Dashboard")
    logger.info(f"API Base URL: {config.api_base_url}")
    logger.info(f"Refresh Rate: {config.refresh_rate}s")
    logger.info(f"Debug Mode: {config.debug}")
    logger.info(f"Simulation Mode: {config.simulate_data}")

    # Create and start dashboard
    global dashboard_instance
    try:
        dashboard_instance = ISHChatDashboard(config)
        await dashboard_instance.start()
    except KeyboardInterrupt:
        logger.info("Received keyboard interrupt")
    except Exception as e:
        logger.error(f"Dashboard error: {e}")
        if config.debug:
            import traceback
            traceback.print_exc()
        return 1
    finally:
        if dashboard_instance:
            dashboard_instance.cleanup()
        logger.info("Dashboard shutdown complete")

    return 0

if __name__ == "__main__":
    # Setup signal handlers
    signal.signal(signal.SIGINT, signal_handler)
    signal.signal(signal.SIGTERM, signal_handler)

    # Run main function
    try:
        exit_code = asyncio.run(main())
        sys.exit(exit_code)
    except KeyboardInterrupt:
        print("\nShutdown requested by user")
        sys.exit(0)
    except Exception as e:
        print(f"Fatal error: {e}")
        sys.exit(1)