#!/usr/bin/env python3
"""
Simple Device Activity Monitor
Monitors and logs device activity with screenshots
"""

import time
import json
from device_logger import DeviceLogger
from pathlib import Path

def monitor_device_activity(duration_minutes=5, screenshot_interval=30):
    """
    Monitor device activity for specified duration

    Args:
        duration_minutes: How long to monitor
        screenshot_interval: Seconds between screenshots
    """
    logger = DeviceLogger()
    logger.start_recording()

    print(f"Monitoring device activity for {duration_minutes} minutes...")
    print(f"Taking screenshot every {screenshot_interval} seconds")
    print("Press Ctrl+C to stop early")

    start_time = time.time()
    end_time = start_time + (duration_minutes * 60)
    screenshot_count = 0

    try:
        while time.time() < end_time:
            time.sleep(screenshot_interval)

            # Take periodic screenshot
            screenshot_path = logger.take_screenshot(f"monitor_{screenshot_count:03d}")
            if screenshot_path:
                screenshot_count += 1
                logger.log_action("periodic_screenshot", f"Automatic screenshot #{screenshot_count}", screenshot_path)

            # Show progress
            elapsed = int(time.time() - start_time)
            remaining = int(end_time - time.time())
            print(f"\rElapsed: {elapsed//60:02d}:{elapsed%60:02d} | Remaining: {remaining//60:02d}:{remaining%60:02d} | Screenshots: {screenshot_count}", end="", flush=True)

    except KeyboardInterrupt:
        print("\n\nMonitoring stopped by user.")

    logger.stop_recording()

    # Show summary
    summary = logger.get_session_summary()
    print(f"\n\nSession Summary:")
    print(f"- Actions logged: {summary['actions']}")
    print(f"- Screenshots taken: {summary['screenshots']}")
    print(f"- Commands executed: {summary['commands']}")
    print(f"- Log file: {summary['session_file']}")

    return logger

if __name__ == "__main__":
    # Monitor for 5 minutes with screenshot every 30 seconds
    monitor_device_activity(duration_minutes=5, screenshot_interval=30)