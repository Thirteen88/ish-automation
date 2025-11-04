"""
Response Parser for Perplexity APK Automation

This module handles OCR text extraction, cleaning, and structured data parsing
for Perplexity app responses, including source extraction and confidence scoring.
"""

import re
import logging
import json
import hashlib
from typing import Dict, List, Optional, Tuple, Any
from dataclasses import dataclass, asdict
from datetime import datetime
import pytz

# Set up logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)


@dataclass
class PerplexityResponse:
    """Structured Perplexity response data"""
    response_id: str
    conversation_id: Optional[str]
    prompt: str
    answer: str
    sources: List[str]
    followup_questions: List[str]
    confidence_score: float
    response_time_ms: int
    device_used: str
    screenshot_path: Optional[str]
    raw_text: str
    timestamp: datetime
    metadata: Dict[str, Any]

    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary for JSON serialization"""
        data = asdict(self)
        data['timestamp'] = self.timestamp.isoformat()
        return data


@dataclass
class SourceInfo:
    """Information about a source cited in the response"""
    title: str
    url: Optional[str]
    snippet: str
    relevance_score: float


class ResponseParser:
    """
    Parser for extracting and structuring Perplexity responses

    Handles OCR text cleaning, answer extraction, source parsing,
    confidence scoring, and structured data creation.
    """

    def __init__(self):
        """Initialize Response Parser"""
        self.text_cleaning_patterns = [
            # Remove common OCR artifacts
            r'\s+',  # Multiple whitespace
            r'[^\w\s\.\,\!\?\;\:\-\(\)\[\]\{\}\"\'\/\@#\$\%\&\*\+\=\~\`\n\r\t]',  # Special chars except common ones
            r'^\s+|\s+$',  # Leading/trailing whitespace
        ]

        # Patterns for identifying different sections of Perplexity responses
        self.source_patterns = [
            r'(?i)sources?[:\s]+(.*?)(?=\n\n|\n[A-Z]|\Z)',  # Sources section
            r'(?i)references?[:\s]+(.*?)(?=\n\n|\n[A-Z]|\Z)',  # References section
            r'(?i)citations?[:\s]+(.*?)(?=\n\n|\n[A-Z]|\Z)',  # Citations section
        ]

        # URL patterns for source extraction
        self.url_patterns = [
            r'https?://[^\s\)]+',  # HTTP/HTTPS URLs
            r'www\.[^\s\)]+',  # URLs starting with www
        ]

        # Follow-up question patterns
        self.followup_patterns = [
            r'(?i)(you might also ask|related questions|you could also|consider asking|try asking)[:\s]+(.*?)(?=\n\n|\n[A-Z]|\Z)',
            r'(?i)(what|how|why|when|where|who|can|should|would|could|do|is|are)[\s\?]+.*\?',  # Question sentences
        ]

        # Quality indicators for confidence scoring
        self.quality_indicators = {
            'has_answer': 0.0,
            'has_sources': 0.0,
            'answer_length': 0.0,
            'source_count': 0.0,
            'has_structure': 0.0,
            'language_quality': 0.0,
        }

        logger.info("ResponseParser initialized")

    def clean_ocr_text(self, raw_text: str) -> str:
        """
        Clean OCR-extracted text to improve readability and accuracy

        Args:
            raw_text: Raw text from OCR

        Returns:
            Cleaned text string
        """
        try:
            if not raw_text:
                return ""

            cleaned = raw_text

            # Apply cleaning patterns
            for pattern in self.text_cleaning_patterns:
                if pattern == r'\s+':
                    cleaned = re.sub(pattern, ' ', cleaned)
                elif pattern == r'[^\w\s\.\,\!\?\;\:\-\(\)\[\]\{\}\"\'\/\@#\$\%\&\*\+\=\~\`\n\r\t]':
                    cleaned = re.sub(pattern, '', cleaned)
                elif pattern == r'^\s+|\s+$':
                    cleaned = re.sub(pattern, '', cleaned)

            # Fix common OCR errors
            corrections = {
                'l': 'I',  # Lowercase l mistaken for I
                'O': '0',  # Letter O mistaken for zero
                'rn': 'm',  # rn mistaken for m
                'vv': 'w',  # vv mistaken for w
            }

            for wrong, correct in corrections.items():
                cleaned = re.sub(wrong, correct, cleaned)

            # Normalize whitespace
            cleaned = ' '.join(cleaned.split())

            # Ensure proper sentence spacing
            cleaned = re.sub(r'([.!?])\s+([A-Z])', r'\1 \2', cleaned)

            return cleaned.strip()

        except Exception as e:
            logger.error(f"Error cleaning OCR text: {e}")
            return raw_text or ""

    def extract_main_answer(self, text: str) -> str:
        """
        Extract the main answer from Perplexity response text

        Args:
            text: Cleaned OCR text

        Returns:
            Main answer string
        """
        try:
            if not text:
                return ""

            # Split text into lines for processing
            lines = text.split('\n')

            # Remove common noise lines
            filtered_lines = []
            for line in lines:
                line = line.strip()
                if (line and
                    not line.startswith(('Sources:', 'References:', 'Citations:', '•', '-', '*')) and
                    not re.match(r'^\d+\.', line) and  # Numbered lists
                    len(line) > 10):  # Minimum length threshold
                    filtered_lines.append(line)

            if not filtered_lines:
                return text[:500]  # Fallback to first 500 chars

            # Join main content lines
            main_answer = ' '.join(filtered_lines)

            # Truncate at obvious source/followup sections
            truncation_patterns = [
                r'(?i)\n\s*(sources?|references?|citations?)[:\s]',
                r'(?i)\n\s*(you might also ask|related questions)',
                r'(?i)\n\s*\d+\.',  # Numbered lists
            ]

            for pattern in truncation_patterns:
                match = re.search(pattern, main_answer)
                if match:
                    main_answer = main_answer[:match.start()].strip()
                    break

            # Ensure reasonable length
            if len(main_answer) > 2000:
                main_answer = main_answer[:2000] + "..."

            return main_answer.strip()

        except Exception as e:
            logger.error(f"Error extracting main answer: {e}")
            return text[:500] if text else ""

    def extract_sources(self, text: str) -> List[SourceInfo]:
        """
        Extract sources from Perplexity response text

        Args:
            text: Cleaned OCR text

        Returns:
            List of SourceInfo objects
        """
        try:
            sources = []

            # Look for source sections using multiple patterns
            for pattern in self.source_patterns:
                matches = re.finditer(pattern, text, re.IGNORECASE | re.MULTILINE)
                for match in matches:
                    source_text = match.group(1)

                    # Extract URLs from source text
                    urls = re.findall(self.url_patterns[0], source_text)

                    if urls:
                        for i, url in enumerate(urls):
                            # Try to extract title from nearby text
                            title_match = re.search(r'([^.!?]*?)\s*' + re.escape(url), source_text)
                            title = title_match.group(1).strip() if title_match else f"Source {i+1}"

                            # Extract snippet (text around the URL)
                            snippet_start = max(0, source_text.find(url) - 100)
                            snippet_end = min(len(source_text), source_text.find(url) + 200)
                            snippet = source_text[snippet_start:snippet_end].strip()

                            sources.append(SourceInfo(
                                title=title,
                                url=url,
                                snippet=snippet,
                                relevance_score=0.8  # Default relevance
                            ))
                    else:
                        # No URLs found, treat as general source reference
                        sources.append(SourceInfo(
                            title=f"Source {len(sources) + 1}",
                            url=None,
                            snippet=source_text[:200],
                            relevance_score=0.5
                        ))

            return sources

        except Exception as e:
            logger.error(f"Error extracting sources: {e}")
            return []

    def extract_followup_questions(self, text: str) -> List[str]:
        """
        Extract follow-up questions from Perplexity response text

        Args:
            text: Cleaned OCR text

        Returns:
            List of follow-up question strings
        """
        try:
            questions = []

            # Look for follow-up question sections
            for pattern in self.followup_patterns:
                matches = re.finditer(pattern, text, re.IGNORECASE | re.MULTILINE)
                for match in matches:
                    question_text = match.group(2) if len(match.groups()) > 1 else match.group(1)

                    # Split into individual questions
                    individual_questions = re.split(r'[,;]\s*', question_text)

                    for question in individual_questions:
                        question = question.strip()
                        if question and '?' in question:
                            # Clean up the question
                            question = re.sub(r'^\W+', '', question)  # Remove leading punctuation
                            question = re.sub(r'\W+$', '', question)  # Remove trailing punctuation

                            if len(question) > 10:  # Minimum length
                                questions.append(question)

            # Also look for standalone question sentences
            sentences = re.split(r'[.!?]+', text)
            for sentence in sentences:
                sentence = sentence.strip()
                if (sentence and
                    sentence.startswith(('What', 'How', 'Why', 'When', 'Where', 'Who', 'Can', 'Should', 'Would', 'Could', 'Do', 'Is', 'Are')) and
                    '?' in sentence and
                    len(sentence) > 10):

                    if sentence not in questions:
                        questions.append(sentence)

            # Limit to reasonable number of questions
            return questions[:5]

        except Exception as e:
            logger.error(f"Error extracting follow-up questions: {e}")
            return []

    def calculate_confidence_score(self, answer: str, sources: List[SourceInfo],
                                raw_text: str, response_time_ms: int) -> float:
        """
        Calculate confidence score for response quality

        Args:
            answer: Extracted main answer
            sources: List of sources
            raw_text: Original OCR text
            response_time_ms: Response time in milliseconds

        Returns:
            Confidence score between 0.0 and 1.0
        """
        try:
            # Reset quality indicators
            for key in self.quality_indicators:
                self.quality_indicators[key] = 0.0

            # Check if we have a meaningful answer
            if answer and len(answer) > 50:
                self.quality_indicators['has_answer'] = 1.0

                # Score based on answer length (optimal range 100-1000 chars)
                if 100 <= len(answer) <= 1000:
                    self.quality_indicators['answer_length'] = 1.0
                elif len(answer) < 100:
                    self.quality_indicators['answer_length'] = len(answer) / 100
                else:
                    self.quality_indicators['answer_length'] = max(0.5, 1.0 - (len(answer) - 1000) / 2000)
            else:
                self.quality_indicators['has_answer'] = 0.0

            # Check for sources
            if sources:
                self.quality_indicators['has_sources'] = 1.0

                # Score based on source count (optimal 1-5 sources)
                if 1 <= len(sources) <= 5:
                    self.quality_indicators['source_count'] = 1.0
                elif len(sources) > 5:
                    self.quality_indicators['source_count'] = max(0.5, 1.0 - (len(sources) - 5) / 10)
                else:
                    self.quality_indicators['source_count'] = len(sources)  # 0-1 range
            else:
                self.quality_indicators['has_sources'] = 0.0

            # Check for structured content
            if ('.' in answer and '\n' in raw_text) or ('1.' in raw_text or '•' in raw_text):
                self.quality_indicators['has_structure'] = 1.0

            # Language quality (basic checks)
            if answer:
                # Check for sentence structure
                sentences = re.split(r'[.!?]+', answer)
                complete_sentences = [s.strip() for s in sentences if len(s.strip()) > 10]

                if complete_sentences:
                    self.quality_indicators['language_quality'] = min(1.0, len(complete_sentences) / 3)

            # Response time factor (faster is better up to a point)
            if response_time_ms < 5000:  # Under 5 seconds is excellent
                time_factor = 1.0
            elif response_time_ms < 10000:  # Under 10 seconds is good
                time_factor = 0.8
            elif response_time_ms < 20000:  # Under 20 seconds is acceptable
                time_factor = 0.6
            else:
                time_factor = max(0.3, 1.0 - (response_time_ms - 20000) / 30000)

            # Calculate weighted average
            weights = {
                'has_answer': 0.3,
                'has_sources': 0.2,
                'answer_length': 0.15,
                'source_count': 0.15,
                'has_structure': 0.1,
                'language_quality': 0.1,
            }

            weighted_score = sum(
                self.quality_indicators[indicator] * weights[indicator]
                for indicator in weights
            )

            # Apply time factor
            final_score = weighted_score * time_factor

            return round(min(1.0, max(0.0, final_score)), 3)

        except Exception as e:
            logger.error(f"Error calculating confidence score: {e}")
            return 0.5  # Default to medium confidence

    def generate_response_id(self, prompt: str, timestamp: datetime, device_id: str) -> str:
        """
        Generate unique response ID

        Args:
            prompt: Original prompt
            timestamp: Response timestamp
            device_id: Device identifier

        Returns:
            Unique response ID string
        """
        content = f"{prompt}_{timestamp.isoformat()}_{device_id}"
        return hashlib.md5(content.encode()).hexdigest()[:16]

    def parse_response(self, raw_text: str, prompt: str, response_time_ms: int = 0,
                      device_used: str = "unknown", screenshot_path: str = None,
                      conversation_id: str = None) -> PerplexityResponse:
        """
        Parse raw OCR text into structured Perplexity response

        Args:
            raw_text: Raw text from OCR
            prompt: Original prompt sent to Perplexity
            response_time_ms: Time taken to get response in milliseconds
            device_used: Device ID used for the request
            screenshot_path: Path to screenshot file
            conversation_id: Optional conversation ID

        Returns:
            Structured PerplexityResponse object
        """
        try:
            timestamp = datetime.now(pytz.UTC)

            # Clean the OCR text
            cleaned_text = self.clean_ocr_text(raw_text)

            # Extract components
            answer = self.extract_main_answer(cleaned_text)
            sources = self.extract_sources(cleaned_text)
            followup_questions = self.extract_followup_questions(cleaned_text)

            # Calculate confidence score
            confidence_score = self.calculate_confidence_score(
                answer, sources, cleaned_text, response_time_ms
            )

            # Generate response ID
            response_id = self.generate_response_id(prompt, timestamp, device_used)

            # Create metadata
            metadata = {
                'quality_indicators': self.quality_indicators.copy(),
                'text_length': len(cleaned_text),
                'word_count': len(cleaned_text.split()),
                'source_count': len(sources),
                'followup_count': len(followup_questions),
                'ocr_cleaning_applied': True,
            }

            response = PerplexityResponse(
                response_id=response_id,
                conversation_id=conversation_id,
                prompt=prompt,
                answer=answer,
                sources=[asdict(source) for source in sources],
                followup_questions=followup_questions,
                confidence_score=confidence_score,
                response_time_ms=response_time_ms,
                device_used=device_used,
                screenshot_path=screenshot_path,
                raw_text=raw_text,
                timestamp=timestamp,
                metadata=metadata
            )

            logger.info(f"Parsed response: {len(answer)} chars, {len(sources)} sources, "
                       f"{confidence_score:.2f} confidence")

            return response

        except Exception as e:
            logger.error(f"Error parsing response: {e}")
            # Return minimal response on error
            timestamp = datetime.now(pytz.UTC)
            return PerplexityResponse(
                response_id="error_" + hashlib.md5(str(timestamp).encode()).hexdigest()[:8],
                conversation_id=conversation_id,
                prompt=prompt,
                answer="Error parsing response",
                sources=[],
                followup_questions=[],
                confidence_score=0.0,
                response_time_ms=response_time_ms,
                device_used=device_used,
                screenshot_path=screenshot_path,
                raw_text=raw_text,
                timestamp=timestamp,
                metadata={'error': str(e)}
            )

    def validate_response_quality(self, response: PerplexityResponse) -> Dict[str, Any]:
        """
        Validate response quality and provide recommendations

        Args:
            response: PerplexityResponse to validate

        Returns:
            Validation results with recommendations
        """
        try:
            validation = {
                'is_valid': True,
                'confidence_level': 'high',
                'issues': [],
                'recommendations': [],
                'quality_metrics': {
                    'answer_quality': 'good',
                    'source_quality': 'good',
                    'overall_score': response.confidence_score
                }
            }

            # Check answer quality
            if len(response.answer) < 50:
                validation['issues'].append("Answer is too short")
                validation['recommendations'].append("Retry with different prompt or check device connection")
                validation['quality_metrics']['answer_quality'] = 'poor'
                validation['is_valid'] = False

            # Check source quality
            if not response.sources:
                validation['issues'].append("No sources detected")
                validation['recommendations'].append("Consider re-prompting for sources if needed")
                validation['quality_metrics']['source_quality'] = 'poor'

            # Check confidence score
            if response.confidence_score < 0.3:
                validation['confidence_level'] = 'low'
                validation['recommendations'].append("Response quality is low, consider retrying")
                validation['is_valid'] = False
            elif response.confidence_score < 0.6:
                validation['confidence_level'] = 'medium'
                validation['recommendations'].append("Response quality is acceptable but could be improved")

            # Check response time
            if response.response_time_ms > 15000:
                validation['issues'].append("Response time is slow")
                validation['recommendations'].append("Consider optimizing device performance")

            return validation

        except Exception as e:
            logger.error(f"Error validating response quality: {e}")
            return {
                'is_valid': False,
                'confidence_level': 'error',
                'issues': [f"Validation error: {str(e)}"],
                'recommendations': ["Check system status"],
                'quality_metrics': {'overall_score': 0.0}
            }


# Convenience functions for common operations
def parse_perplexity_response(raw_text: str, prompt: str, **kwargs) -> PerplexityResponse:
    """
    Convenience function to parse Perplexity response

    Args:
        raw_text: Raw OCR text
        prompt: Original prompt
        **kwargs: Additional arguments for parsing

    Returns:
        Structured PerplexityResponse
    """
    parser = ResponseParser()
    return parser.parse_response(raw_text, prompt, **kwargs)


def extract_text_from_image(image_text: str, prompt: str, **kwargs) -> Dict[str, Any]:
    """
    Extract and parse text from image with Perplexity-specific processing

    Args:
        image_text: Text extracted from image via OCR
        prompt: Original prompt
        **kwargs: Additional parsing arguments

    Returns:
        Dictionary with parsed response data
    """
    parser = ResponseParser()
    response = parser.parse_response(image_text, prompt, **kwargs)
    validation = parser.validate_response_quality(response)

    return {
        'response': response.to_dict(),
        'validation': validation,
        'success': validation['is_valid']
    }


if __name__ == "__main__":
    # Test basic functionality
    def test_response_parser():
        print("📝 Testing Response Parser")
        print("===========================")

        parser = ResponseParser()

        # Test with sample text
        sample_text = """
        Here is the main answer to your question about artificial intelligence.
        Machine learning is a subset of AI that focuses on statistical models and algorithms.

        Sources:
        https://en.wikipedia.org/wiki/Machine_learning
        https://www.ibm.com/topics/machine-learning

        You might also ask: What is deep learning? How do neural networks work?
        """

        prompt = "What is machine learning?"

        # Test parsing
        response = parser.parse_response(
            raw_text=sample_text,
            prompt=prompt,
            response_time_ms=3500,
            device_used="emulator-5554"
        )

        print(f"✅ Response ID: {response.response_id}")
        print(f"📄 Answer: {response.answer[:100]}...")
        print(f"🔗 Sources: {len(response.sources)}")
        print(f"❓ Follow-up questions: {len(response.followup_questions)}")
        print(f"🎯 Confidence: {response.confidence_score}")

        # Test validation
        validation = parser.validate_response_quality(response)
        print(f"✅ Valid: {validation['is_valid']}")
        print(f"📊 Quality: {validation['confidence_level']}")

        # Test text cleaning
        dirty_text = "  This   is   a   test   with  OCR artifacts   like l instead of I  "
        clean_text = parser.clean_ocr_text(dirty_text)
        print(f"🧹 Cleaned text: '{clean_text}'")

    test_response_parser()