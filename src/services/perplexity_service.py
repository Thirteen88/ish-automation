"""
Perplexity app automation service
"""
import asyncio
import logging
from typing import Dict, Any, List
from .android_service import AndroidService

logger = logging.getLogger(__name__)

class PerplexityService:
    """Service for Perplexity app automation"""

    PERPLEXITY_PACKAGE = "ai.perplexity.app.android"

    def __init__(self, android_service: AndroidService):
        self.android = android_service

    async def open_perplexity(self) -> Dict[str, Any]:
        """Open Perplexity app"""
        return await self.android.open_app(self.PERPLEXITY_PACKAGE)

    async def search_query(self, query: str) -> Dict[str, Any]:
        """Search in Perplexity app"""
        # First open the app
        open_result = await self.open_perplexity()
        if not open_result["success"]:
            return open_result

        # Wait for app to load
        await asyncio.sleep(2)

        # Tap on search bar (coordinates may need adjustment)
        search_tap = await self.android.tap_coordinates(540, 200)

        if search_tap["success"]:
            # Type the query
            await asyncio.sleep(1)
            type_result = await self.android.input_text(query)

            if type_result["success"]:
                # Press Enter
                await asyncio.sleep(1)
                enter_result = await self.android.press_key("KEYCODE_ENTER")
                return enter_result

        return search_tap

    async def take_screenshot(self, filename_prefix: str = "perplexity") -> Dict[str, Any]:
        """Take screenshot of Perplexity app"""
        timestamp = int(asyncio.get_event_loop().time())
        device_path = f"/sdcard/{filename_prefix}_{timestamp}.png"

        # Take screenshot
        screenshot = await self.android.take_screenshot(device_path)

        if screenshot["success"]:
            # Copy with specific name
            await self.android.run_adb_command(f"shell cp {device_path} /sdcard/{filename_prefix}_latest.png")

        return screenshot

    async def take_screenshot_with_ocr(self, filename_prefix: str = "perplexity", ocr_engine: str = None) -> Dict[str, Any]:
        """Take screenshot and extract text using OCR"""
        # Import OCR service here to avoid circular imports
        from .ocr_service import ocr_service

        # Take screenshot
        screenshot_result = await self.take_screenshot(filename_prefix)

        if not screenshot_result["success"]:
            return {
                "screenshot": screenshot_result,
                "ocr": {"error": "Failed to take screenshot"},
                "success": False
            }

        # Extract text from screenshot
        image_path = screenshot_result.get("local_path")
        if image_path:
            try:
                ocr_result = await ocr_service.extract_text(
                    image_path,
                    engine=ocr_engine,
                    preprocess=True
                )

                return {
                    "screenshot": screenshot_result,
                    "ocr": ocr_result,
                    "success": True,
                    "text_extracted": "error" not in ocr_result,
                    "word_count": ocr_result.get("word_count", 0),
                    "confidence": ocr_result.get("confidence", 0)
                }
            except Exception as e:
                logger.error(f"OCR processing failed: {e}")
                return {
                    "screenshot": screenshot_result,
                    "ocr": {"error": str(e)},
                    "success": False
                }
        else:
            return {
                "screenshot": screenshot_result,
                "ocr": {"error": "No screenshot path available"},
                "success": False
            }

    async def analyze_screen_content(self, ocr_engine: str = None) -> Dict[str, Any]:
        """Analyze current screen content using OCR"""
        # Take screenshot with OCR
        result = await self.take_screenshot_with_ocr("perplexity_analysis", ocr_engine)

        if not result["success"] or not result.get("text_extracted", False):
            return {
                "success": False,
                "error": "Failed to extract text from screen",
                "details": result
            }

        ocr_data = result["ocr"]
        extracted_text = ocr_data.get("text", "")
        words = ocr_data.get("words", [])

        # Analyze content
        analysis = {
            "success": True,
            "text": extracted_text,
            "word_count": len(words),
            "confidence": ocr_data.get("confidence", 0),
            "engine": ocr_data.get("engine", ocr_engine or "unknown")
        }

        # Look for specific UI elements in text
        text_lower = extracted_text.lower()

        # Check for common Perplexity UI elements
        ui_elements = {
            "has_search_box": any(keyword in text_lower for keyword in ["search", "ask", "query"]),
            "has_model_selector": any(keyword in text_lower for keyword in ["model", "gpt", "claude", "sonnet"]),
            "has_response": len(extracted_text) > 50,  # Assume response if substantial text
            "has_history": any(keyword in text_lower for keyword in ["history", "previous", "conversation"]),
            "has_settings": any(keyword in text_lower for keyword in ["settings", "menu", "profile"])
        }

        analysis["ui_elements"] = ui_elements

        # Extract potential clickable text regions
        if words:
            # Filter for words that might be buttons or links
            clickable_candidates = [
                word for word in words
                if word["confidence"] > 50 and (
                    any(btn in word["text"].lower() for btn in ["search", "send", "submit", "ask", "menu"]) or
                    word["text"].isupper() or  # Often buttons are uppercase
                    (5 < len(word["text"]) < 20)  # Reasonable length for buttons
                )
            ]
            analysis["clickable_regions"] = clickable_candidates

        return {
            "screenshot_result": result["screenshot"],
            "ocr_result": ocr_data,
            "analysis": analysis,
            "success": True
        }

    async def find_model_selector(self) -> Dict[str, Any]:
        """Find model selector by trying multiple common locations"""
        # Common model selector locations (x, y coordinates)
        potential_locations = [
            (1000, 150),  # Top right
            (900, 200),   # Upper right
            (540, 100),   # Top center
            (1080, 300),  # Far right
            (100, 150),   # Top left
            (200, 200),   # Upper left
        ]

        results = []

        for i, (x, y) in enumerate(potential_locations):
            # Tap on location
            tap_result = await self.android.tap_coordinates(x, y)

            # Wait for UI response
            await asyncio.sleep(1)

            # Take screenshot
            screenshot = await self.take_screenshot(f"perplexity_model_selector_{i}")

            results.append({
                "location": f"({x}, {y})",
                "tap_result": tap_result,
                "screenshot_result": screenshot,
                "screenshot_file": screenshot.get("local_path")
            })

        return {
            "success": True,
            "locations_tested": len(potential_locations),
            "results": results
        }

    async def map_interface(self, max_points: int = 30) -> Dict[str, Any]:
        """Map out the Perplexity interface by systematic tapping"""
        # Create a grid of tap points
        screen_width, screen_height = 1080, 2400  # Typical phone resolution
        grid_points = []

        # Create grid with 100px spacing
        for x in range(100, screen_width, 100):
            for y in range(100, screen_height, 200):  # Vertical spacing larger
                grid_points.append((x, y))

        interface_map = []
        screenshot_count = 0

        for i, (x, y) in enumerate(grid_points[:max_points]):
            # Tap on location
            tap_result = await self.android.tap_coordinates(x, y)

            # Wait for UI response
            await asyncio.sleep(0.5)

            # Take screenshot
            screenshot = await self.take_screenshot(f"interface_map_{i}")

            if screenshot["success"]:
                screenshot_count += 1

            interface_map.append({
                "point": i,
                "coordinates": (x, y),
                "tap_result": tap_result["success"],
                "screenshot_taken": screenshot["success"],
                "screenshot_file": screenshot.get("local_path")
            })

        return {
            "success": True,
            "total_points_tested": len(grid_points[:max_points]),
            "screenshots_captured": screenshot_count,
            "interface_map": interface_map
        }

    async def cycle_through_models(self) -> Dict[str, Any]:
        """Cycle through available models by finding and using model selector"""
        cycle_results = []

        # First try to find model selector
        model_finder = await self.find_model_selector()
        cycle_results.append({"action": "find_model_selector", "result": model_finder})

        # Try common model selector interactions
        model_actions = [
            ("tap_model_selector", "tap_coordinates", 900, 200),
            ("navigate_down", "press_key", "KEYCODE_DPAD_DOWN"),
            ("navigate_down", "press_key", "KEYCODE_DPAD_DOWN"),
            ("select_model", "press_key", "KEYCODE_ENTER"),
            ("tap_first_option", "tap_coordinates", 540, 400),
            ("tap_second_option", "tap_coordinates", 540, 500),
            ("tap_third_option", "tap_coordinates", 540, 600),
        ]

        for i, (action_name, method, *args) in enumerate(model_actions):
            # Execute action
            if method == "tap_coordinates":
                action_result = await self.android.tap_coordinates(args[0], args[1])
            else:
                action_result = await getattr(self.android, method)(args[0])

            # Wait for UI response
            await asyncio.sleep(2)

            # Take screenshot to see result
            screenshot = await self.take_screenshot(f"model_cycle_{i}")

            cycle_results.append({
                "step": i,
                "action": action_name,
                "action_result": action_result,
                "screenshot_taken": screenshot["success"],
                "screenshot_file": screenshot.get("local_path")
            })

        return {
            "success": True,
            "total_actions": len(model_actions),
            "cycle_results": cycle_results
        }

    async def smart_model_selector(self) -> Dict[str, Any]:
        """Smart model selector that tries multiple approaches"""
        approaches = []

        # Approach 1: Try direct tap on common model selector locations
        await self.android.tap_coordinates(900, 200)
        await asyncio.sleep(1)
        screenshot1 = await self.take_screenshot("smart_selector_1")
        approaches.append({"method": "direct_tap_top_right", "success": screenshot1["success"]})

        # Approach 2: Try accessing menu
        await self.android.tap_coordinates(1000, 200)
        await asyncio.sleep(1)
        screenshot2 = await self.take_screenshot("smart_selector_2")
        approaches.append({"method": "menu_tap", "success": screenshot2["success"]})

        # Approach 3: Try swipe down (common for model selector)
        await self.android.swipe_gesture(540, 100, 540, 800, 300)
        await asyncio.sleep(1)
        screenshot3 = await self.take_screenshot("smart_selector_3")
        approaches.append({"method": "swipe_down", "success": screenshot3["success"]})

        # Approach 4: Try long press on search area
        await self.android.long_press(540, 200, 1000)
        await asyncio.sleep(1)
        screenshot4 = await self.take_screenshot("smart_selector_4")
        approaches.append({"method": "long_press_search", "success": screenshot4["success"]})

        return {
            "success": any(approach["success"] for approach in approaches),
            "approaches_tried": len(approaches),
            "approach_results": approaches,
            "screenshots_saved": sum(1 for app in approaches if app["success"])
        }

    async def comprehensive_exploration(self) -> Dict[str, Any]:
        """Comprehensive exploration of Perplexity app using all methods"""
        exploration_results = []

        # 1. Basic search test
        search_result = await self.search_query("Perplexity models available")
        exploration_results.append({"method": "basic_search", "result": search_result})

        # 2. Model selector finder
        await self.open_perplexity()
        await asyncio.sleep(3)
        selector_finder = await self.find_model_selector()
        exploration_results.append({"method": "model_selector_finder", "result": selector_finder})

        # 3. Smart selector
        await self.open_perplexity()
        await asyncio.sleep(3)
        smart_selector_result = await self.smart_model_selector()
        exploration_results.append({"method": "smart_selector", "result": smart_selector_result})

        # 4. Model cycling
        await self.open_perplexity()
        await asyncio.sleep(3)
        cycle_result = await self.cycle_through_models()
        exploration_results.append({"method": "model_cycling", "result": cycle_result})

        return {
            "action": "comprehensive_exploration",
            "exploration_results": exploration_results,
            "summary": {
                "methods_completed": len(exploration_results),
                "screenshots_generated": "Check /tmp/ for all screenshots"
            }
        }

    async def is_installed(self) -> bool:
        """Check if Perplexity app is installed"""
        packages = await self.android.get_installed_packages()
        return self.PERPLEXITY_PACKAGE in packages