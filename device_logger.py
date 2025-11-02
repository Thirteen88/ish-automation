#!/usr/bin/env python3
"""
Device Interaction Logger
Logs and tracks device interactions through ADB commands
"""

import json
import time
import datetime
import subprocess
import os
from pathlib import Path

class DeviceLogger:
    def __init__(self, log_dir="/tmp/device_logs"):
        self.log_dir = Path(log_dir)
        self.log_dir.mkdir(exist_ok=True)
        self.session_file = self.log_dir / f"session_{datetime.datetime.now().strftime('%Y%m%d_%H%M%S')}.json"
        self.screenshot_dir = self.log_dir / "screenshots"
        self.screenshot_dir.mkdir(exist_ok=True)

        self.session_data = {
            "session_start": datetime.datetime.now().isoformat(),
            "device_actions": [],
            "screenshots": [],
            "commands_executed": []
        }

    def log_action(self, action_type, details, screenshot_path=None):
        """Log a device action"""
        timestamp = datetime.datetime.now().isoformat()

        action_entry = {
            "timestamp": timestamp,
            "action_type": action_type,
            "details": details,
            "screenshot_path": screenshot_path
        }

        self.session_data["device_actions"].append(action_entry)
        self.save_session()

        print(f"[{timestamp}] {action_type}: {details}")

    def log_command(self, command, result):
        """Log an ADB command execution"""
        timestamp = datetime.datetime.now().isoformat()

        command_entry = {
            "timestamp": timestamp,
            "command": command,
            "result": result,
            "success": result.get("success", False)
        }

        self.session_data["commands_executed"].append(command_entry)
        self.save_session()

    def take_screenshot(self, name=None):
        """Take and log a screenshot"""
        if name is None:
            name = f"screenshot_{int(time.time())}"

        timestamp = datetime.datetime.now().strftime('%Y%m%d_%H%M%S')
        screenshot_filename = f"{name}_{timestamp}.png"
        device_path = f"/sdcard/{screenshot_filename}"
        local_path = self.screenshot_dir / screenshot_filename

        try:
            # Take screenshot via ISH Chat API
            import requests

            screenshot_command = {"command": f"shell screencap {device_path}"}
            response = requests.post(
                "http://localhost:8000/api/android/execute",
                headers={
                    "X-API-Key": "ish-chat-secure-key-2024",
                    "Content-Type": "application/json"
                },
                json=screenshot_command,
                timeout=10
            )

            if response.status_code == 200:
                # Pull screenshot
                pull_response = requests.get(f"http://localhost:8000/api/android/screenshot/{screenshot_filename}")
                if pull_response.status_code == 200:
                    with open(local_path, 'wb') as f:
                        f.write(pull_response.content)

                    screenshot_entry = {
                        "timestamp": datetime.datetime.now().isoformat(),
                        "filename": screenshot_filename,
                        "device_path": device_path,
                        "local_path": str(local_path)
                    }

                    self.session_data["screenshots"].append(screenshot_entry)
                    self.save_session()

                    return str(local_path)

        except Exception as e:
            print(f"Screenshot failed: {e}")
            return None

    def save_session(self):
        """Save session data to file"""
        with open(self.session_file, 'w') as f:
            json.dump(self.session_data, f, indent=2)

    def start_recording(self):
        """Start continuous recording"""
        print(f"Starting device recording...")
        print(f"Session log: {self.session_file}")
        print(f"Screenshots: {self.screenshot_dir}")

        # Take initial screenshot
        self.take_screenshot("recording_start")
        self.log_action("recording_started", "Device interaction recording started")

    def stop_recording(self):
        """Stop recording and save final session"""
        self.take_screenshot("recording_end")
        self.log_action("recording_stopped", "Device interaction recording stopped")
        self.session_data["session_end"] = datetime.datetime.now().isoformat()
        self.save_session()

        print(f"Recording stopped. Session saved to: {self.session_file}")

    def get_session_summary(self):
        """Get summary of current session"""
        actions_count = len(self.session_data["device_actions"])
        screenshots_count = len(self.session_data["screenshots"])
        commands_count = len(self.session_data["commands_executed"])

        return {
            "actions": actions_count,
            "screenshots": screenshots_count,
            "commands": commands_count,
            "session_file": str(self.session_file)
        }

if __name__ == "__main__":
    logger = DeviceLogger()
    logger.start_recording()

    print("Device logger started. Press Ctrl+C to stop recording.")
    try:
        while True:
            time.sleep(1)
    except KeyboardInterrupt:
        logger.stop_recording()
        print("\nRecording stopped.")