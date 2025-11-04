"""
Vision Processor for Perplexity APK Automation

This module handles computer vision tasks including screen capture,
UI element detection, template matching, and OCR preparation
for autonomous Perplexity app interaction.
"""

import cv2
import numpy as np
import pytesseract
import asyncio
import subprocess
import logging
from typing import Tuple, Optional, List, Dict, Any
from dataclasses import dataclass
from PIL import Image
import io
import os
import time

# Set up logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)


@dataclass
class UIElement:
    """UI element detection result"""
    element_type: str
    coordinates: Tuple[int, int, int, int]  # (x, y, width, height)
    confidence: float
    detection_method: str
    timestamp: float


@dataclass
class ScreenCapture:
    """Screen capture result"""
    image: np.ndarray
    device_id: str
    timestamp: float
    file_path: Optional[str] = None
    resolution: Tuple[int, int] = (0, 0)


class VisionProcessor:
    """
    Computer vision processor for Perplexity APK automation

    Handles screen capture, UI element detection, template matching,
    and OCR preparation for autonomous app interaction.
    """

    def __init__(self, device_id: str = "emulator-5554"):
        """
        Initialize Vision Processor

        Args:
            device_id: Android device identifier
        """
        self.device_id = device_id
        self.tesseract_config = {
            'engine_mode': 1,  # LSTM OCR Engine
            'page_seg_mode': 6,  # Assume uniform text
            'psm': 6,  # Sparse text
            'oem': 3,  # Default LSTM
            'lang': 'eng'
        }

        # UI element coordinate templates (based on typical Android phone resolution)
        self.ui_templates = {
            'input_area': {
                'fallback_coords': (100, 1800, 1000, 1900),  # (x, y, width, height)
                'resource_id': 'ai.perplexity.app.android:id/input',
                'content_desc': 'Ask anything',
                'text_hints': ['ask', 'type', 'message', 'input']
            },
            'send_button': {
                'fallback_coords': (1000, 1850, 1080, 1920),
                'resource_id': 'ai.perplexity.app.android:id/send',
                'content_desc': 'Send',
                'text_hints': ['send', 'submit', 'arrow']
            },
            'response_area': {
                'fallback_coords': (50, 300, 1030, 1700),
                'resource_id': None,  # Usually no specific ID
                'content_desc': None,
                'text_hints': []  # Response area is detected by elimination
            }
        }

        # Template storage
        self.template_cache = {}
        self.capture_count = 0

        logger.info(f"VisionProcessor initialized for device {device_id}")

    async def capture_screen(self, save_to_file: bool = False) -> Optional[ScreenCapture]:
        """
        Capture screen from the Android device

        Args:
            save_to_file: Whether to save screenshot to file

        Returns:
            ScreenCapture object or None if failed
        """
        try:
            timestamp = time.time()
            filename = f"perplexity_screenshot_{self.capture_count}_{int(timestamp)}.png"
            device_path = f"/sdcard/{filename}"
            local_path = f"screenshots/{filename}"

            # Create screenshots directory if needed
            if save_to_file and not os.path.exists("screenshots"):
                os.makedirs("screenshots")

            # Take screenshot on device
            screencap_cmd = [
                "adb", "-s", self.device_id,
                "shell", "screencap", "-p", device_path
            ]

            process = await asyncio.create_subprocess_exec(
                *screencap_cmd,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE
            )

            stdout, stderr = await process.communicate()

            if process.returncode != 0:
                logger.error(f"Screenshot failed: {stderr.decode()}")
                return None

            # Pull screenshot to local machine
            if save_to_file:
                pull_cmd = [
                    "adb", "-s", self.device_id,
                    "pull", device_path, local_path
                ]

                pull_process = await asyncio.create_subprocess_exec(
                    *pull_cmd,
                    stdout=asyncio.subprocess.PIPE,
                    stderr=asyncio.subprocess.PIPE
                )

                pull_stdout, pull_stderr = await pull_process.communicate()

                if pull_process.returncode == 0:
                    # Load image from file
                    image = cv2.imread(local_path)
                    if image is not None:
                        self.capture_count += 1
                        resolution = (image.shape[1], image.shape[0])

                        # Clean up device file
                        cleanup_cmd = [
                            "adb", "-s", self.device_id,
                            "shell", "rm", device_path
                        ]
                        await asyncio.create_subprocess_exec(*cleanup_cmd)

                        logger.info(f"Screen captured and saved to {local_path}")
                        return ScreenCapture(
                            image=image,
                            device_id=self.device_id,
                            timestamp=timestamp,
                            file_path=local_path,
                            resolution=resolution
                        )
                else:
                    logger.error(f"Failed to pull screenshot: {pull_stderr.decode()}")

            # Fallback: capture directly to stdout
            direct_cmd = [
                "adb", "-s", self.device_id,
                "shell", "screencap", "-p"
            ]

            direct_process = await asyncio.create_subprocess_exec(
                *direct_cmd,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE
            )

            direct_stdout, direct_stderr = await direct_process.communicate()

            if direct_process.returncode == 0:
                # Convert bytes to numpy array
                image_array = np.frombuffer(direct_stdout, dtype=np.uint8)
                image = cv2.imdecode(image_array, cv2.IMREAD_COLOR)

                if image is not None:
                    self.capture_count += 1
                    resolution = (image.shape[1], image.shape[0])
                    logger.info(f"Screen captured directly ({resolution[0]}x{resolution[1]})")
                    return ScreenCapture(
                        image=image,
                        device_id=self.device_id,
                        timestamp=timestamp,
                        resolution=resolution
                    )

            logger.error("All screen capture methods failed")
            return None

        except Exception as e:
            logger.error(f"Error capturing screen: {e}")
            return None

    def detect_text_input_area(self, image: np.ndarray) -> Optional[UIElement]:
        """
        Detect text input area in the Perplexity app

        Args:
            image: Screen capture image

        Returns:
            UIElement for input area or None if not found
        """
        try:
            height, width = image.shape[:2]
            template = self.ui_templates['input_area']

            # Method 1: Template matching with reference patterns
            # Look for typical input area characteristics (bottom of screen, text input appearance)
            roi_y_start = int(height * 0.75)  # Focus on bottom 25% of screen
            roi = image[roi_y_start:height, :]

            # Convert to grayscale for analysis
            gray = cv2.cvtColor(roi, cv2.COLOR_BGR2GRAY)

            # Look for rectangular regions that resemble text inputs
            # Using edge detection and contour analysis
            edges = cv2.Canny(gray, 50, 150)
            contours, _ = cv2.findContours(edges, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)

            best_match = None
            best_score = 0

            for contour in contours:
                x, y, w, h = cv2.boundingRect(contour)

                # Adjust coordinates to full image
                full_y = y + roi_y_start

                # Filter for input-like rectangles
                aspect_ratio = w / h if h > 0 else 0
                area = w * h
                relative_y = full_y / height

                # Input areas are typically:
                # - Wide (aspect_ratio > 3)
                # - Located in bottom half of screen (relative_y > 0.6)
                # - Reasonable size (area > 5000 pixels)
                if (aspect_ratio > 3 and
                    relative_y > 0.6 and
                    area > 5000 and
                    area < width * height * 0.3):  # Not too large

                    score = min(aspect_ratio, 10) * min(area / 50000, 1) * (1 - abs(relative_y - 0.85))

                    if score > best_score:
                        best_score = score
                        best_match = (x, full_y, w, h)

            if best_match and best_score > 0.3:
                logger.info(f"Input area detected via template matching: {best_match} (score: {best_score:.2f})")
                return UIElement(
                    element_type='input_area',
                    coordinates=best_match,
                    confidence=best_score,
                    detection_method='template_matching',
                    timestamp=time.time()
                )

            # Method 2: Fallback to default coordinates
            fallback_x, fallback_y, fallback_w, fallback_h = template['fallback_coords']

            # Scale fallback coordinates based on actual resolution
            scale_x = width / 1080  # Reference resolution width
            scale_y = height / 1920  # Reference resolution height

            scaled_coords = (
                int(fallback_x * scale_x),
                int(fallback_y * scale_y),
                int(fallback_w * scale_x),
                int(fallback_h * scale_y)
            )

            logger.info(f"Using fallback input area coordinates: {scaled_coords}")
            return UIElement(
                element_type='input_area',
                coordinates=scaled_coords,
                confidence=0.5,  # Lower confidence for fallback
                detection_method='fallback',
                timestamp=time.time()
            )

        except Exception as e:
            logger.error(f"Error detecting input area: {e}")
            return None

    def detect_send_button(self, image: np.ndarray) -> Optional[UIElement]:
        """
        Detect send button in the Perplexity app

        Args:
            image: Screen capture image

        Returns:
            UIElement for send button or None if not found
        """
        try:
            height, width = image.shape[:2]
            template = self.ui_templates['send_button']

            # Focus on bottom-right corner where send buttons are typically located
            roi_x_start = int(width * 0.7)  # Right 30% of screen
            roi_y_start = int(height * 0.75)  # Bottom 25% of screen
            roi = image[roi_y_start:height, roi_x_start:width]

            # Convert to grayscale
            gray = cv2.cvtColor(roi, cv2.COLOR_BGR2GRAY)

            # Look for button-like circular or rounded square shapes
            # Using template matching for common button patterns
            circles = cv2.HoughCircles(
                gray,
                cv2.HOUGH_GRADIENT,
                dp=1,
                minDist=30,
                param1=50,
                param2=30,
                minRadius=15,
                maxRadius=50
            )

            best_match = None
            best_score = 0

            if circles is not None:
                circles = np.round(circles[0, :]).astype("int")

                for (x, y, r) in circles:
                    # Adjust coordinates to full image
                    full_x = x + roi_x_start
                    full_y = y + roi_y_start

                    # Score based on position (prefer bottom-right)
                    position_score = (full_x / width) * (full_y / height)

                    # Score based on size (prefer typical button sizes)
                    size_score = min(r / 25, 2)  # Normalize around 25px radius

                    total_score = position_score * size_score

                    if total_score > best_score:
                        best_score = total_score
                        best_match = (full_x - r, full_y - r, r * 2, r * 2)

            if best_match and best_score > 0.2:
                logger.info(f"Send button detected via circle detection: {best_match} (score: {best_score:.2f})")
                return UIElement(
                    element_type='send_button',
                    coordinates=best_match,
                    confidence=best_score,
                    detection_method='circle_detection',
                    timestamp=time.time()
                )

            # Method 2: Look for distinctive button features using template matching
            # Create a simple button template and use template matching
            button_template = np.zeros((30, 30), dtype=np.uint8)
            cv2.circle(button_template, (15, 15), 12, 255, -1)

            # Match template
            result = cv2.matchTemplate(gray, button_template, cv2.TM_CCOEFF_NORMED)
            min_val, max_val, min_loc, max_loc = cv2.minMaxLoc(result)

            if max_val > 0.6:  # Good match threshold
                x, y = max_loc
                full_x = x + roi_x_start
                full_y = y + roi_y_start

                match_coords = (full_x, full_y, 30, 30)
                logger.info(f"Send button detected via template matching: {match_coords} (score: {max_val:.2f})")
                return UIElement(
                    element_type='send_button',
                    coordinates=match_coords,
                    confidence=max_val,
                    detection_method='template_matching',
                    timestamp=time.time()
                )

            # Method 3: Fallback to default coordinates
            fallback_x, fallback_y, fallback_w, fallback_h = template['fallback_coords']

            # Scale fallback coordinates
            scale_x = width / 1080
            scale_y = height / 1920

            scaled_coords = (
                int(fallback_x * scale_x),
                int(fallback_y * scale_y),
                int(fallback_w * scale_x),
                int(fallback_h * scale_y)
            )

            logger.info(f"Using fallback send button coordinates: {scaled_coords}")
            return UIElement(
                element_type='send_button',
                coordinates=scaled_coords,
                confidence=0.4,
                detection_method='fallback',
                timestamp=time.time()
            )

        except Exception as e:
            logger.error(f"Error detecting send button: {e}")
            return None

    def detect_response_area(self, image: np.ndarray, input_area: Optional[UIElement] = None,
                           send_button: Optional[UIElement] = None) -> Optional[UIElement]:
        """
        Detect response area in the Perplexity app

        Args:
            image: Screen capture image
            input_area: Detected input area (for exclusion)
            send_button: Detected send button (for exclusion)

        Returns:
            UIElement for response area or None if not found
        """
        try:
            height, width = image.shape[:2]
            template = self.ui_templates['response_area']

            # Response area is typically the upper-middle portion of the screen
            # excluding the input area and send button areas

            # Define default response area (upper 80% of screen, excluding top bar)
            default_y = int(height * 0.15)  # Start after top bar
            default_h = int(height * 0.65)  # 65% of screen height
            default_x = int(width * 0.05)   # 5% margin
            default_w = int(width * 0.9)    # 90% width

            response_coords = (default_x, default_y, default_w, default_h)

            # Adjust if we have detected UI elements
            if input_area:
                # Exclude input area from response area
                in_x, in_y, in_w, in_h = input_area.coordinates
                if in_y < default_y + default_h:
                    # Adjust response area height to avoid overlap
                    new_height = in_y - default_y - 10  # 10px buffer
                    if new_height > 100:  # Minimum reasonable height
                        response_coords = (default_x, default_y, default_w, new_height)

            if send_button:
                # Exclude send button area
                send_x, send_y, send_w, send_h = send_button.coordinates
                # If send button overlaps with response area, adjust
                if (send_x < default_x + default_w and
                    send_y < default_y + response_coords[3]):
                    # Response area typically doesn't need adjustment for send button
                    # as send button is usually at the bottom
                    pass

            logger.info(f"Response area defined: {response_coords}")
            return UIElement(
                element_type='response_area',
                coordinates=response_coords,
                confidence=0.7,
                detection_method='region_deduction',
                timestamp=time.time()
            )

        except Exception as e:
            logger.error(f"Error detecting response area: {e}")
            return None

    def extract_text_region(self, image: np.ndarray, coordinates: Tuple[int, int, int, int]) -> np.ndarray:
        """
        Extract text region from image based on coordinates

        Args:
            image: Full screen image
            coordinates: (x, y, width, height) of text region

        Returns:
            Cropped image region
        """
        try:
            x, y, w, h = coordinates

            # Ensure coordinates are within image bounds
            height, width = image.shape[:2]
            x = max(0, min(x, width - 1))
            y = max(0, min(y, height - 1))
            w = min(w, width - x)
            h = min(h, height - y)

            # Extract region
            region = image[y:y+h, x:x+w]

            return region

        except Exception as e:
            logger.error(f"Error extracting text region: {e}")
            return image  # Return full image as fallback

    def ocr_extract_text(self, image: np.ndarray, preprocess: bool = True) -> str:
        """
        Extract text from image using OCR

        Args:
            image: Image region for OCR
            preprocess: Whether to preprocess image for better OCR

        Returns:
            Extracted text string
        """
        try:
            if preprocess:
                # Preprocess image for better OCR results
                # Convert to grayscale
                if len(image.shape) == 3:
                    gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
                else:
                    gray = image

                # Apply threshold to get better text contrast
                _, binary = cv2.threshold(gray, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)

                # Noise reduction
                denoised = cv2.medianBlur(binary, 3)

                # Use processed image for OCR
                processed_image = denoised
            else:
                processed_image = image

            # Configure Tesseract
            custom_config = r'--oem 3 --psm 6 -l eng'

            # Extract text
            text = pytesseract.image_to_string(processed_image, config=custom_config)

            # Clean up text
            cleaned_text = text.strip().replace('\n', ' ').replace('\r', '')

            logger.info(f"OCR extracted text: {cleaned_text[:100]}..." if len(cleaned_text) > 100 else f"OCR extracted text: {cleaned_text}")

            return cleaned_text

        except Exception as e:
            logger.error(f"Error extracting text with OCR: {e}")
            return ""

    async def analyze_screen(self) -> Dict[str, Any]:
        """
        Perform complete screen analysis

        Returns:
            Dictionary containing all detected UI elements and analysis results
        """
        try:
            logger.info("Starting complete screen analysis...")

            # Capture screen
            screen_capture = await self.capture_screen(save_to_file=True)

            if not screen_capture:
                return {"error": "Failed to capture screen"}

            image = screen_capture.image

            # Detect UI elements
            input_area = self.detect_text_input_area(image)
            send_button = self.detect_send_button(image)
            response_area = self.detect_response_area(image, input_area, send_button)

            # Extract text from response area
            response_text = ""
            if response_area:
                response_region = self.extract_text_region(image, response_area.coordinates)
                response_text = self.ocr_extract_text(response_region)

            # Compile results
            analysis_result = {
                "timestamp": screen_capture.timestamp,
                "device_id": self.device_id,
                "resolution": screen_capture.resolution,
                "screenshot_file": screen_capture.file_path,
                "ui_elements": {
                    "input_area": {
                        "found": input_area is not None,
                        "coordinates": input_area.coordinates if input_area else None,
                        "confidence": input_area.confidence if input_area else 0,
                        "detection_method": input_area.detection_method if input_area else None
                    },
                    "send_button": {
                        "found": send_button is not None,
                        "coordinates": send_button.coordinates if send_button else None,
                        "confidence": send_button.confidence if send_button else 0,
                        "detection_method": send_button.detection_method if send_button else None
                    },
                    "response_area": {
                        "found": response_area is not None,
                        "coordinates": response_area.coordinates if response_area else None,
                        "confidence": response_area.confidence if response_area else 0,
                        "detection_method": response_area.detection_method if response_area else None
                    }
                },
                "extracted_text": {
                    "response_text": response_text,
                    "text_length": len(response_text)
                },
                "analysis_time": time.time() - screen_capture.timestamp
            }

            logger.info(f"Screen analysis completed in {analysis_result['analysis_time']:.2f}s")
            return analysis_result

        except Exception as e:
            logger.error(f"Error during screen analysis: {e}")
            return {"error": str(e)}

    def get_ui_elements(self) -> Dict[str, Optional[UIElement]]:
        """
        Get all detected UI elements

        Returns:
            Dictionary of UI elements by type
        """
        # This method would typically be called after analyze_screen
        # For now, return empty dict - will be populated by analyze_screen
        return {
            "input_area": None,
            "send_button": None,
            "response_area": None
        }


# Convenience functions for common operations
async def capture_screenshot(device_id: str = "emulator-5554", save_path: str = "screenshots") -> Optional[str]:
    """
    Capture screenshot from device

    Args:
        device_id: Android device ID
        save_path: Directory to save screenshot

    Returns:
        Path to saved screenshot or None if failed
    """
    processor = VisionProcessor(device_id)

    if not os.path.exists(save_path):
        os.makedirs(save_path)

    screen_capture = await processor.capture_screen(save_to_file=True)

    return screen_capture.file_path if screen_capture else None


async def detect_ui_elements(device_id: str = "emulator-5554") -> Dict[str, Any]:
    """
    Detect UI elements on device screen

    Args:
        device_id: Android device ID

    Returns:
        UI element analysis results
    """
    processor = VisionProcessor(device_id)
    return await processor.analyze_screen()


if __name__ == "__main__":
    # Test basic functionality
    async def test_vision_processor():
        print("🔍 Testing Vision Processor")
        print("============================")

        processor = VisionProcessor("emulator-5554")

        # Test screen capture
        print("📸 Testing screen capture...")
        screen_capture = await processor.capture_screen(save_to_file=True)

        if screen_capture:
            print(f"✅ Screen captured: {screen_capture.resolution}")
            print(f"📁 Saved to: {screen_capture.file_path}")

            # Test UI element detection
            print("\n🎯 Testing UI element detection...")

            input_area = processor.detect_text_input_area(screen_capture.image)
            print(f"📝 Input area: {input_area.coordinates if input_area else 'Not found'}")

            send_button = processor.detect_send_button(screen_capture.image)
            print(f"📤 Send button: {send_button.coordinates if send_button else 'Not found'}")

            response_area = processor.detect_response_area(screen_capture.image, input_area, send_button)
            print(f"💬 Response area: {response_area.coordinates if response_area else 'Not found'}")

            # Test OCR
            if response_area:
                print("\n🔤 Testing OCR extraction...")
                response_region = processor.extract_text_region(screen_capture.image, response_area.coordinates)
                text = processor.ocr_extract_text(response_region)
                print(f"📄 Extracted text: {text[:100]}..." if len(text) > 100 else f"📄 Extracted text: {text}")

            # Test complete analysis
            print("\n🧪 Testing complete analysis...")
            analysis = await processor.analyze_screen()
            print(f"📊 Analysis keys: {list(analysis.keys())}")

        else:
            print("❌ Screen capture failed")

    asyncio.run(test_vision_processor())