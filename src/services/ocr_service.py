"""
OCR Service for extracting text from screenshots
Supports multiple OCR engines: Tesseract, EasyOCR, and cloud-based options
"""
import os
import io
import logging
import tempfile
from typing import Dict, List, Optional, Union, Any
from datetime import datetime
from pathlib import Path
import json

try:
    import cv2
    import numpy as np
    CV2_AVAILABLE = True
except ImportError:
    CV2_AVAILABLE = False
    logging.warning("OpenCV not available. Some preprocessing features will be limited.")

try:
    import pytesseract
    from PIL import Image
    TESSERACT_AVAILABLE = True
except ImportError:
    TESSERACT_AVAILABLE = False
    logging.warning("Tesseract not available. Install with: pip install pytesseract pillow")

try:
    import easyocr
    EASYOCR_AVAILABLE = True
except ImportError:
    EASYOCR_AVAILABLE = False
    logging.warning("EasyOCR not available. Install with: pip install easyocr")

logger = logging.getLogger(__name__)

class OCREngine:
    """Base class for OCR engines"""

    def __init__(self, name: str):
        self.name = name
        self.available = False

    async def extract_text(self, image_path: str, **kwargs) -> Dict[str, Any]:
        """Extract text from image"""
        raise NotImplementedError

    def preprocess_image(self, image_path: str) -> Optional[str]:
        """Preprocess image for better OCR results"""
        if not CV2_AVAILABLE:
            return image_path

        try:
            # Read image
            img = cv2.imread(image_path)
            if img is None:
                return image_path

            # Convert to grayscale
            gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)

            # Apply threshold to get binary image
            _, binary = cv2.threshold(gray, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)

            # Noise reduction
            denoised = cv2.medianBlur(binary, 5)

            # Save preprocessed image to temp file
            temp_path = tempfile.mktemp(suffix='_preprocessed.png')
            cv2.imwrite(temp_path, denoised)

            return temp_path
        except Exception as e:
            logger.error(f"Image preprocessing failed: {e}")
            return image_path

class TesseractEngine(OCREngine):
    """Tesseract OCR engine"""

    def __init__(self):
        super().__init__("Tesseract")
        self.available = TESSERACT_AVAILABLE

        if self.available:
            try:
                # Test Tesseract availability
                pytesseract.get_tesseract_version()
                logger.info("Tesseract OCR engine initialized")
            except Exception as e:
                logger.error(f"Tesseract initialization failed: {e}")
                self.available = False

    async def extract_text(self, image_path: str, language: str = 'eng', preprocess: bool = True) -> Dict[str, Any]:
        """Extract text using Tesseract"""
        if not self.available:
            return {"error": "Tesseract not available", "text": "", "confidence": 0}

        try:
            # Preprocess image if requested
            processed_path = self.preprocess_image(image_path) if preprocess else image_path

            # Extract text with confidence scores
            data = pytesseract.image_to_data(processed_path, lang=language, output_type=pytesseract.Output.DICT)

            # Process results
            text_parts = []
            confidences = []
            words_with_positions = []

            for i in range(len(data['text'])):
                if int(data['conf'][i]) > 0:  # Filter out low confidence results
                    text = data['text'][i].strip()
                    if text:
                        text_parts.append(text)
                        confidences.append(int(data['conf'][i]))

                        words_with_positions.append({
                            'text': text,
                            'confidence': int(data['conf'][i]),
                            'bbox': {
                                'x': data['left'][i],
                                'y': data['top'][i],
                                'width': data['width'][i],
                                'height': data['height'][i]
                            }
                        })

            # Calculate average confidence
            avg_confidence = sum(confidences) / len(confidences) if confidences else 0

            # Clean up temp file
            if preprocess and processed_path != image_path:
                try:
                    os.unlink(processed_path)
                except:
                    pass

            return {
                "engine": self.name,
                "text": " ".join(text_parts),
                "confidence": avg_confidence,
                "words": words_with_positions,
                "word_count": len(text_parts),
                "language": language,
                "preprocessed": preprocess
            }

        except Exception as e:
            logger.error(f"Tesseract OCR failed: {e}")
            return {"engine": self.name, "error": str(e), "text": "", "confidence": 0}

class EasyOCREngine(OCREngine):
    """EasyOCR engine"""

    def __init__(self):
        super().__init__("EasyOCR")
        self.available = EASYOCR_AVAILABLE
        self.reader = None

        if self.available:
            try:
                # Initialize reader (lazy loading)
                logger.info("EasyOCR engine initialized (reader will be loaded on first use)")
            except Exception as e:
                logger.error(f"EasyOCR initialization failed: {e}")
                self.available = False

    def _get_reader(self, languages: List[str] = None):
        """Lazy load EasyOCR reader"""
        if self.reader is None:
            languages = languages or ['en']
            try:
                self.reader = easyocr.Reader(languages, gpu=False)
                logger.info(f"EasyOCR reader loaded for languages: {languages}")
            except Exception as e:
                logger.error(f"EasyOCR reader loading failed: {e}")
                self.available = False
        return self.reader

    async def extract_text(self, image_path: str, languages: List[str] = None, preprocess: bool = True) -> Dict[str, Any]:
        """Extract text using EasyOCR"""
        if not self.available:
            return {"error": "EasyOCR not available", "text": "", "confidence": 0}

        try:
            languages = languages or ['en']
            reader = self._get_reader(languages)

            if reader is None:
                return {"error": "EasyOCR reader not available", "text": "", "confidence": 0}

            # Preprocess image if requested
            processed_path = self.preprocess_image(image_path) if preprocess else image_path

            # Extract text
            results = reader.readtext(processed_path)

            # Process results
            text_parts = []
            confidences = []
            words_with_positions = []

            for (bbox, text, confidence) in results:
                if confidence > 0.1:  # Filter low confidence results
                    text_parts.append(text)
                    confidences.append(confidence)

                    # Convert bbox format
                    x_min = min([point[0] for point in bbox])
                    y_min = min([point[1] for point in bbox])
                    x_max = max([point[0] for point in bbox])
                    y_max = max([point[1] for point in bbox])

                    words_with_positions.append({
                        'text': text,
                        'confidence': confidence * 100,  # Convert to percentage
                        'bbox': {
                            'x': int(x_min),
                            'y': int(y_min),
                            'width': int(x_max - x_min),
                            'height': int(y_max - y_min)
                        }
                    })

            # Calculate average confidence
            avg_confidence = sum(confidences) / len(confidences) if confidences else 0

            # Clean up temp file
            if preprocess and processed_path != image_path:
                try:
                    os.unlink(processed_path)
                except:
                    pass

            return {
                "engine": self.name,
                "text": " ".join(text_parts),
                "confidence": avg_confidence * 100,  # Convert to percentage
                "words": words_with_positions,
                "word_count": len(text_parts),
                "languages": languages,
                "preprocessed": preprocess
            }

        except Exception as e:
            logger.error(f"EasyOCR failed: {e}")
            return {"engine": self.name, "error": str(e), "text": "", "confidence": 0}

class OCRService:
    """Main OCR service with multiple engine support"""

    def __init__(self):
        self.engines = {
            'tesseract': TesseractEngine(),
            'easyocr': EasyOCREngine()
        }

        # Determine default engine
        self.default_engine = self._get_best_available_engine()

        logger.info(f"OCR Service initialized. Available engines: {[name for name, engine in self.engines.items() if engine.available]}")
        logger.info(f"Default OCR engine: {self.default_engine}")

    def _get_best_available_engine(self) -> str:
        """Select the best available OCR engine"""
        # Priority order: EasyOCR > Tesseract
        if self.engines['easyocr'].available:
            return 'easyocr'
        elif self.engines['tesseract'].available:
            return 'tesseract'
        else:
            return None

    async def extract_text(self, image_path: str, engine: str = None, **kwargs) -> Dict[str, Any]:
        """Extract text from image using specified or default engine"""
        if not os.path.exists(image_path):
            return {"error": f"Image file not found: {image_path}", "text": "", "confidence": 0}

        # Use specified engine or default
        engine_name = engine or self.default_engine

        if not engine_name:
            return {"error": "No OCR engines available", "text": "", "confidence": 0}

        if engine_name not in self.engines:
            return {"error": f"Unknown OCR engine: {engine_name}", "text": "", "confidence": 0}

        ocr_engine = self.engines[engine_name]

        if not ocr_engine.available:
            return {"error": f"OCR engine {engine_name} not available", "text": "", "confidence": 0}

        try:
            logger.info(f"Extracting text from {image_path} using {engine_name}")
            result = await ocr_engine.extract_text(image_path, **kwargs)

            # Add metadata
            result.update({
                "image_path": image_path,
                "timestamp": datetime.utcnow().isoformat(),
                "file_size": os.path.getsize(image_path)
            })

            logger.info(f"OCR completed. Extracted {result.get('word_count', 0)} words with {result.get('confidence', 0):.1f}% confidence")
            return result

        except Exception as e:
            logger.error(f"OCR extraction failed: {e}")
            return {"error": str(e), "text": "", "confidence": 0}

    async def extract_text_all_engines(self, image_path: str, **kwargs) -> Dict[str, Any]:
        """Extract text using all available engines and return best result"""
        if not os.path.exists(image_path):
            return {"error": f"Image file not found: {image_path}", "results": {}}

        results = {}
        best_result = None
        best_confidence = 0

        for engine_name, engine in self.engines.items():
            if engine.available:
                try:
                    result = await engine.extract_text(image_path, **kwargs)
                    results[engine_name] = result

                    # Track best result by confidence
                    confidence = result.get('confidence', 0)
                    if confidence > best_confidence:
                        best_confidence = confidence
                        best_result = result

                except Exception as e:
                    logger.error(f"Engine {engine_name} failed: {e}")
                    results[engine_name] = {"error": str(e), "confidence": 0}

        return {
            "image_path": image_path,
            "timestamp": datetime.utcnow().isoformat(),
            "results": results,
            "best_result": best_result,
            "best_engine": best_result.get('engine') if best_result else None
        }

    def get_available_engines(self) -> Dict[str, Dict[str, Any]]:
        """Get information about available OCR engines"""
        return {
            name: {
                "name": engine.name,
                "available": engine.available
            }
            for name, engine in self.engines.items()
        }

    async def analyze_text_layout(self, image_path: str, engine: str = None) -> Dict[str, Any]:
        """Analyze text layout and structure in image"""
        result = await self.extract_text(image_path, engine)

        if 'error' in result:
            return result

        words = result.get('words', [])

        if not words:
            return {"error": "No text found in image", "layout": {}}

        # Analyze layout
        # Group words by lines (similar y-coordinates)
        lines = []
        current_line = []
        last_y = None

        for word in sorted(words, key=lambda w: (w['bbox']['y'], w['bbox']['x'])):
            y = word['bbox']['y']

            if last_y is not None and abs(y - last_y) > 20:  # New line
                if current_line:
                    lines.append(current_line)
                current_line = [word]
            else:
                current_line.append(word)

            last_y = y

        if current_line:
            lines.append(current_line)

        # Calculate text regions
        if words:
            x_coords = [w['bbox']['x'] for w in words]
            y_coords = [w['bbox']['y'] for w in words]
            right_coords = [w['bbox']['x'] + w['bbox']['width'] for w in words]
            bottom_coords = [w['bbox']['y'] + w['bbox']['height'] for w in words]

            text_region = {
                'left': min(x_coords),
                'top': min(y_coords),
                'right': max(right_coords),
                'bottom': max(bottom_coords),
                'width': max(right_coords) - min(x_coords),
                'height': max(bottom_coords) - min(y_coords)
            }
        else:
            text_region = {}

        return {
            "engine": result.get('engine'),
            "text": result.get('text'),
            "confidence": result.get('confidence'),
            "layout": {
                "lines": len(lines),
                "words_per_line": [len(line) for line in lines],
                "text_region": text_region,
                "total_words": len(words)
            },
            "detailed_lines": [
                {
                    "line_number": i + 1,
                    "text": " ".join([w['text'] for w in line]),
                    "words": len(line),
                    "confidence": sum([w['confidence'] for w in line]) / len(line) if line else 0
                }
                for i, line in enumerate(lines)
            ]
        }

# Global OCR service instance
ocr_service = OCRService()