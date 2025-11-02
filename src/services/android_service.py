"""
Android device automation service
"""
import asyncio
import subprocess
import json
from typing import Dict, Any, List
import logging

logger = logging.getLogger(__name__)

class AndroidService:
    """Service for Android device automation via ADB"""

    def __init__(self):
        self.default_timeout = 30

    async def run_adb_command(self, command: str, timeout: int = None) -> Dict[str, Any]:
        """Execute ADB command and return result"""
        timeout = timeout or self.default_timeout
        try:
            result = subprocess.run(
                f"adb {command}",
                shell=True,
                capture_output=True,
                text=True,
                timeout=timeout
            )
            return {
                "success": result.returncode == 0,
                "stdout": result.stdout.strip(),
                "stderr": result.stderr.strip(),
                "returncode": result.returncode
            }
        except subprocess.TimeoutExpired:
            return {
                "success": False,
                "stdout": "",
                "stderr": "Command timed out",
                "returncode": -1
            }
        except Exception as e:
            logger.error(f"ADB command error: {e}")
            return {
                "success": False,
                "stdout": "",
                "stderr": str(e),
                "returncode": -1
            }

    async def get_device_status(self) -> Dict[str, Any]:
        """Get comprehensive device status"""
        # Check device connection
        devices = await self.run_adb_command("devices")
        if not devices["success"]:
            return {"connected": False, "error": "Failed to check devices"}

        # Get battery level
        battery = await self.run_adb_command("shell dumpsys battery | grep level")

        # Get device model
        model = await self.run_adb_command("shell getprop ro.product.model")

        # Get Android version
        version = await self.run_adb_command("shell getprop ro.build.version.release")

        # Get device serial
        serial = await self.run_adb_command("shell getprop ro.serialno")

        return {
            "connected": True,
            "battery": battery["stdout"] if battery["success"] else "Unknown",
            "model": model["stdout"] if model["success"] else "Unknown",
            "android_version": version["stdout"] if version["success"] else "Unknown",
            "serial": serial["stdout"] if serial["success"] else "Unknown",
            "devices": devices["stdout"]
        }

    async def take_screenshot(self, save_path: str = "/sdcard/screenshot.png") -> Dict[str, Any]:
        """Take screenshot and save to specified path"""
        # Take screenshot
        screenshot = await self.run_adb_command(f"shell screencap -p {save_path}")

        if screenshot["success"]:
            # Pull screenshot to computer
            local_path = f"/tmp/screenshot_{asyncio.get_event_loop().time()}.png"
            pull_result = await self.run_adb_command(f"pull {save_path} {local_path}")
            return {
                "success": pull_result["success"],
                "local_path": local_path if pull_result["success"] else None,
                "device_path": save_path,
                "pull_result": pull_result
            }

        return screenshot

    async def open_app(self, package_name: str) -> Dict[str, Any]:
        """Open app by package name"""
        return await self.run_adb_command(f"shell monkey -p {package_name} -c android.intent.category.LAUNCHER 1")

    async def tap_coordinates(self, x: int, y: int) -> Dict[str, Any]:
        """Tap on specific coordinates"""
        return await self.run_adb_command(f"shell input tap {x} {y}")

    async def swipe_gesture(self, x1: int, y1: int, x2: int, y2: int, duration: int = 300) -> Dict[str, Any]:
        """Perform swipe gesture"""
        return await self.run_adb_command(f"shell input touchscreen swipe {x1} {y1} {x2} {y2} {duration}")

    async def input_text(self, text: str) -> Dict[str, Any]:
        """Input text"""
        # Escape special characters for shell
        escaped_text = text.replace(" ", "%s").replace("&", "%26")
        return await self.run_adb_command(f"shell input text {escaped_text}")

    async def press_key(self, key_code: str) -> Dict[str, Any]:
        """Press hardware key"""
        return await self.run_adb_command(f"shell input keyevent {key_code}")

    async def long_press(self, x: int, y: int, duration: int = 1000) -> Dict[str, Any]:
        """Long press at coordinates"""
        return await self.run_adb_command(f"shell input touchscreen swipe {x} {y} {x} {y} {duration}")

    async def get_installed_packages(self, filter_text: str = None) -> List[str]:
        """Get list of installed packages, optionally filtered"""
        result = await self.run_adb_command("shell pm list packages")
        if not result["success"]:
            return []

        packages = []
        for line in result["stdout"].split('\n'):
            if line.startswith('package:'):
                package = line.replace('package:', '').strip()
                if not filter_text or filter_text.lower() in package.lower():
                    packages.append(package)

        return packages

    async def get_app_info(self, package_name: str) -> Dict[str, Any]:
        """Get detailed app information"""
        info = {}

        # Get version
        version = await self.run_adb_command(f"shell dumpsys package {package_name} | grep versionName")
        if version["success"]:
            info["version"] = version["stdout"].split('=')[-1].strip() if '=' in version["stdout"] else "Unknown"

        # Get activities
        activities = await self.run_adb_command(f"shell dumpsys package {package_name} | grep -A 5 'Activity Resolver Table'")
        if activities["success"]:
            info["activities"] = activities["stdout"]

        return info