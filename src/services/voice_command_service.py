"""
Voice Command Service for speech-to-text integration
Supports multiple speech recognition engines and voice-activated automation
"""
import os
import io
import logging
import tempfile
import asyncio
from typing import Dict, List, Optional, Union, Any, Callable
from datetime import datetime
from pathlib import Path
import json
from enum import Enum
from dataclasses import dataclass, field

try:
    import speech_recognition as sr
    SPEECH_RECOGNITION_AVAILABLE = True
except ImportError:
    SPEECH_RECOGNITION_AVAILABLE = False
    logging.warning("SpeechRecognition not available. Install with: pip install SpeechRecognition")

try:
    import pyaudio
    PYAUDIO_AVAILABLE = True
except ImportError:
    PYAUDIO_AVAILABLE = False
    logging.warning("PyAudio not available. Install with: pip install pyaudio")

try:
    import wave
    import audioop
    WAVE_AVAILABLE = True
except ImportError:
    WAVE_AVAILABLE = False
    logging.warning("Audio processing not fully available")

try:
    from vosk import Model, KaldiRecognizer
    VOSK_AVAILABLE = True
except ImportError:
    VOSK_AVAILABLE = False
    logging.warning("Vosk not available. Install with: pip install vosk")

try:
    import whisper
    WHISPER_AVAILABLE = True
except ImportError:
    WHISPER_AVAILABLE = False
    logging.warning("Whisper not available. Install with: pip install openai-whisper")

logger = logging.getLogger(__name__)

class VoiceCommandState(Enum):
    """Voice command states"""
    IDLE = "idle"
    LISTENING = "listening"
    PROCESSING = "processing"
    RESPONDING = "responding"
    ERROR = "error"

class SpeechEngine(Enum):
    """Available speech recognition engines"""
    GOOGLE = "google"
    WHISPER = "whisper"
    VOSK = "vosk"
    SPHINX = "sphinx"
    AZURE = "azure"
    WIT = "wit"

@dataclass
class VoiceCommand:
    """Voice command data structure"""
    command_id: str
    text: str
    confidence: float
    engine: str
    timestamp: datetime
    audio_file: Optional[str] = None
    processing_time: float = 0.0
    intent: Optional[str] = None
    entities: Dict[str, Any] = field(default_factory=dict)
    response: Optional[str] = None

@dataclass
class VoiceProfile:
    """User voice profile for better recognition"""
    user_id: str
    name: str
    preferred_engine: SpeechEngine = SpeechEngine.GOOGLE
    language: str = "en-US"
    wake_word: Optional[str] = None
    custom_commands: Dict[str, str] = field(default_factory=dict)
    voice_sensitivity: float = 0.5

class VoiceCommandService:
    """Voice command service with multiple speech recognition engines"""

    def __init__(self):
        self.recognizer = None
        self.microphone = None
        self.vosk_model = None
        self.whisper_model = None

        self.state = VoiceCommandState.IDLE
        self.current_profile = None
        self.voice_profiles = {}

        self.command_handlers = {}
        self.wake_word_detector = None

        self._initialize_speech_system()
        self._load_default_commands()

    def _initialize_speech_system(self):
        """Initialize speech recognition components"""
        try:
            if SPEECH_RECOGNITION_AVAILABLE:
                self.recognizer = sr.Recognizer()
                self.recognizer.pause_threshold = 0.5
                self.recognizer.operation_timeout = 5
                self.recognizer.phrase_threshold = 0.3
                self.recognizer.non_speaking_duration = 0.5

                logger.info("Speech recognizer initialized")

            if PYAUDIO_AVAILABLE and SPEECH_RECOGNITION_AVAILABLE:
                try:
                    self.microphone = sr.Microphone()
                    with self.microphone as source:
                        self.recognizer.adjust_for_ambient_noise(source, duration=1)
                    logger.info("Microphone initialized and calibrated")
                except Exception as e:
                    logger.warning(f"Microphone initialization failed: {e}")

            # Initialize Vosk if available
            if VOSK_AVAILABLE:
                try:
                    model_path = os.path.expanduser("~/.cache/vosk/model-en-us")
                    if os.path.exists(model_path):
                        self.vosk_model = Model(model_path)
                        logger.info("Vosk model loaded")
                    else:
                        logger.info("Vosk model not found, download required")
                except Exception as e:
                    logger.warning(f"Vosk initialization failed: {e}")

            # Initialize Whisper if available
            if WHISPER_AVAILABLE:
                try:
                    self.whisper_model = whisper.load_model("base")
                    logger.info("Whisper model loaded")
                except Exception as e:
                    logger.warning(f"Whisper initialization failed: {e}")

        except Exception as e:
            logger.error(f"Speech system initialization failed: {e}")

    def _load_default_commands(self):
        """Load default voice commands"""
        default_commands = {
            # Navigation commands
            "go home": "navigate_home",
            "go back": "navigate_back",
            "scroll up": "scroll_up",
            "scroll down": "scroll_down",
            "swipe left": "swipe_left",
            "swipe right": "swipe_right",

            # App commands
            "open chrome": "open_app:com.android.chrome",
            "open messages": "open_app:com.google.android.apps.messaging",
            "open camera": "open_app:com.google.android.GoogleCamera",
            "close app": "close_current_app",

            # Automation commands
            "take screenshot": "take_screenshot",
            "start recording": "start_recording",
            "stop recording": "stop_recording",
            "refresh page": "refresh_page",

            # System commands
            "volume up": "volume_up",
            "volume down": "volume_down",
            "mute": "mute_volume",
            "unmute": "unmute_volume",

            # AI assistant commands
            "hey assistant": "activate_assistant",
            "help me": "request_help",
            "what can i say": "list_commands"
        }

        self.command_handlers.update(default_commands)

    def create_voice_profile(self, user_id: str, name: str, **kwargs) -> VoiceProfile:
        """Create a new voice profile"""
        profile = VoiceProfile(
            user_id=user_id,
            name=name,
            **kwargs
        )
        self.voice_profiles[user_id] = profile
        logger.info(f"Created voice profile for {name} ({user_id})")
        return profile

    def set_voice_profile(self, user_id: str):
        """Set active voice profile"""
        if user_id in self.voice_profiles:
            self.current_profile = self.voice_profiles[user_id]
            logger.info(f"Switched to voice profile: {self.current_profile.name}")
        else:
            logger.warning(f"Voice profile not found: {user_id}")

    async def listen_for_command(self, timeout: float = 10.0, engine: SpeechEngine = None) -> Optional[VoiceCommand]:
        """Listen for a voice command"""
        if not self._is_speech_available():
            logger.error("Speech recognition not available")
            return None

        self.state = VoiceCommandState.LISTENING
        start_time = datetime.now()

        try:
            if engine is None:
                engine = self.current_profile.preferred_engine if self.current_profile else SpeechEngine.GOOGLE

            command_text = ""
            confidence = 0.0
            audio_file = None

            if engine == SpeechEngine.GOOGLE:
                command_text, confidence, audio_file = await self._recognize_with_google(timeout)
            elif engine == SpeechEngine.WHISPER and WHISPER_AVAILABLE:
                command_text, confidence, audio_file = await self._recognize_with_whisper(timeout)
            elif engine == SpeechEngine.VOSK and VOSK_AVAILABLE:
                command_text, confidence, audio_file = await self._recognize_with_vosk(timeout)
            elif engine == SpeechEngine.SPHINX:
                command_text, confidence, audio_file = await self._recognize_with_sphinx(timeout)
            else:
                # Fallback to Google
                command_text, confidence, audio_file = await self._recognize_with_google(timeout)

            processing_time = (datetime.now() - start_time).total_seconds()

            if command_text.strip():
                command = VoiceCommand(
                    command_id=self._generate_command_id(),
                    text=command_text.strip(),
                    confidence=confidence,
                    engine=engine.value,
                    timestamp=start_time,
                    audio_file=audio_file,
                    processing_time=processing_time
                )

                # Extract intent and entities
                await self._extract_command_intent(command)

                self.state = VoiceCommandState.PROCESSING
                logger.info(f"Voice command recognized: '{command_text}' (confidence: {confidence:.1f}%)")
                return command
            else:
                self.state = VoiceCommandState.IDLE
                return None

        except asyncio.TimeoutError:
            logger.warning("Voice command listening timed out")
            self.state = VoiceCommandState.IDLE
            return None
        except Exception as e:
            logger.error(f"Voice command recognition failed: {e}")
            self.state = VoiceCommandState.ERROR
            return None
        finally:
            # Clean up temporary audio file
            if audio_file and os.path.exists(audio_file):
                try:
                    os.unlink(audio_file)
                except:
                    pass

    async def _recognize_with_google(self, timeout: float) -> tuple[str, float, Optional[str]]:
        """Recognize speech using Google Speech Recognition"""
        if not self.microphone:
            raise RuntimeError("Microphone not available")

        with self.microphone as source:
            logger.info("Listening for command...")
            audio_data = self.recognizer.listen(source, timeout=timeout)

        # Save audio to temporary file
        audio_file = tempfile.mktemp(suffix='.wav')
        with open(audio_file, 'wb') as f:
            f.write(audio_data.get_wav_data())

        try:
            # Use Google Speech Recognition
            text = self.recognizer.recognize_google(audio_data, show_all=False)
            confidence = 0.8  # Google doesn't provide confidence in basic mode

            return text, confidence, audio_file

        except sr.UnknownValueError:
            logger.warning("Google Speech Recognition could not understand audio")
            return "", 0.0, audio_file
        except sr.RequestError as e:
            logger.error(f"Google Speech Recognition service error: {e}")
            return "", 0.0, audio_file

    async def _recognize_with_whisper(self, timeout: float) -> tuple[str, float, Optional[str]]:
        """Recognize speech using Whisper"""
        if not self.microphone or not self.whisper_model:
            raise RuntimeError("Microphone or Whisper not available")

        with self.microphone as source:
            logger.info("Listening for command with Whisper...")
            audio_data = self.recognizer.listen(source, timeout=timeout)

        # Save audio to temporary file
        audio_file = tempfile.mktemp(suffix='.wav')
        with open(audio_file, 'wb') as f:
            f.write(audio_data.get_wav_data())

        try:
            # Use Whisper for transcription
            result = self.whisper_model.transcribe(audio_file, fp16=False)
            text = result['text'].strip()

            # Estimate confidence based on model performance
            confidence = min(95.0, 80.0 + (len(result['segments']) * 2))

            return text, confidence, audio_file

        except Exception as e:
            logger.error(f"Whisper transcription failed: {e}")
            return "", 0.0, audio_file

    async def _recognize_with_vosk(self, timeout: float) -> tuple[str, float, Optional[str]]:
        """Recognize speech using Vosk"""
        if not self.microphone or not self.vosk_model:
            raise RuntimeError("Microphone or Vosk not available")

        rec = KaldiRecognizer(self.vosk_model, 16000)

        with self.microphone as source:
            logger.info("Listening for command with Vosk...")
            audio_data = self.recognizer.listen(source, timeout=timeout)

        # Save audio to temporary file
        audio_file = tempfile.mktemp(suffix='.wav')
        with open(audio_file, 'wb') as f:
            f.write(audio_data.get_wav_data())

        try:
            # Process audio with Vosk
            if rec.AcceptWaveform(audio_data.get_wav_data()):
                result = json.loads(rec.Result())
                text = result.get('text', '').strip()
                confidence = 0.85  # Vosk typically provides good accuracy
            else:
                text = ""
                confidence = 0.0

            return text, confidence, audio_file

        except Exception as e:
            logger.error(f"Vosk recognition failed: {e}")
            return "", 0.0, audio_file

    async def _recognize_with_sphinx(self, timeout: float) -> tuple[str, float, Optional[str]]:
        """Recognize speech using CMU Sphinx (offline)"""
        if not self.microphone:
            raise RuntimeError("Microphone not available")

        with self.microphone as source:
            logger.info("Listening for command with Sphinx...")
            audio_data = self.recognizer.listen(source, timeout=timeout)

        # Save audio to temporary file
        audio_file = tempfile.mktemp(suffix='.wav')
        with open(audio_file, 'wb') as f:
            f.write(audio_data.get_wav_data())

        try:
            # Use CMU Sphinx for offline recognition
            text = self.recognizer.recognize_sphinx(audio_data)
            confidence = 0.7  # Sphinx generally has lower accuracy

            return text, confidence, audio_file

        except sr.UnknownValueError:
            logger.warning("Sphinx could not understand audio")
            return "", 0.0, audio_file
        except sr.RequestError as e:
            logger.error(f"Sphinx recognition error: {e}")
            return "", 0.0, audio_file

    async def _extract_command_intent(self, command: VoiceCommand):
        """Extract intent and entities from voice command"""
        text_lower = command.text.lower().strip()

        # Check for exact matches first
        if text_lower in self.command_handlers:
            command.intent = self.command_handlers[text_lower]
            return

        # Check for pattern matches
        for pattern, handler in self.command_handlers.items():
            if pattern in text_lower:
                command.intent = handler
                break

        # Extract entities
        if "open" in text_lower:
            # Extract app name
            words = text_lower.split()
            if len(words) > 1:
                app_name = " ".join(words[1:])
                command.entities["app_name"] = app_name

        if "volume" in text_lower:
            if "up" in text_lower:
                command.entities["volume_action"] = "increase"
            elif "down" in text_lower:
                command.entities["volume_action"] = "decrease"
            elif "mute" in text_lower:
                command.entities["volume_action"] = "mute"

    async def execute_voice_command(self, command: VoiceCommand, device_service=None) -> Dict[str, Any]:
        """Execute a recognized voice command"""
        if not command.intent:
            return {
                "success": False,
                "error": "No intent recognized",
                "command": command.text
            }

        self.state = VoiceCommandState.RESPONDING

        try:
            result = {"success": True, "command": command.text, "intent": command.intent}

            # Execute based on intent
            if command.intent.startswith("navigate_"):
                action = command.intent.replace("navigate_", "")
                if device_service:
                    await self._execute_navigation(action, device_service, result)

            elif command.intent.startswith("open_app:"):
                app_package = command.intent.split(":", 1)[1]
                if device_service:
                    await self._execute_open_app(app_package, device_service, result)

            elif command.intent == "close_current_app":
                if device_service:
                    await self._execute_close_app(device_service, result)

            elif command.intent == "take_screenshot":
                if device_service:
                    await self._execute_screenshot(device_service, result)

            elif command.intent.startswith("volume_"):
                action = command.entities.get("volume_action", command.intent.replace("volume_", ""))
                if device_service:
                    await self._execute_volume_control(action, device_service, result)

            elif command.intent == "activate_assistant":
                result["response"] = "Assistant activated. How can I help you?"

            elif command.intent == "request_help":
                result["response"] = self._get_help_text()

            elif command.intent == "list_commands":
                result["response"] = self._get_available_commands()

            else:
                result["success"] = False
                result["error"] = f"Unknown intent: {command.intent}"

            return result

        except Exception as e:
            logger.error(f"Command execution failed: {e}")
            return {
                "success": False,
                "error": str(e),
                "command": command.text,
                "intent": command.intent
            }
        finally:
            self.state = VoiceCommandState.IDLE

    async def _execute_navigation(self, action: str, device_service, result: Dict):
        """Execute navigation command"""
        try:
            if action == "home":
                await device_service.press_key("home")
                result["response"] = "Navigated to home"
            elif action == "back":
                await device_service.press_key("back")
                result["response"] = "Navigated back"
            elif action == "scroll_up":
                await device_service.swipe(500, 1000, 500, 400, 500)
                result["response"] = "Scrolled up"
            elif action == "scroll_down":
                await device_service.swipe(500, 400, 500, 1000, 500)
                result["response"] = "Scrolled down"
            elif action == "swipe_left":
                await device_service.swipe(800, 800, 200, 800, 300)
                result["response"] = "Swiped left"
            elif action == "swipe_right":
                await device_service.swipe(200, 800, 800, 800, 300)
                result["response"] = "Swiped right"
        except Exception as e:
            result["success"] = False
            result["error"] = str(e)

    async def _execute_open_app(self, app_package: str, device_service, result: Dict):
        """Execute app opening command"""
        try:
            success = await device_service.open_app(app_package)
            if success:
                result["response"] = f"Opened app: {app_package}"
            else:
                result["success"] = False
                result["error"] = f"Failed to open app: {app_package}"
        except Exception as e:
            result["success"] = False
            result["error"] = str(e)

    async def _execute_close_app(self, device_service, result: Dict):
        """Execute app closing command"""
        try:
            await device_service.press_key("home")
            result["response"] = "Closed current app"
        except Exception as e:
            result["success"] = False
            result["error"] = str(e)

    async def _execute_screenshot(self, device_service, result: Dict):
        """Execute screenshot command"""
        try:
            screenshot_path = await device_service.take_screenshot("/tmp/voice_screenshot.png")
            result["response"] = f"Screenshot saved: {screenshot_path}"
            result["screenshot_path"] = screenshot_path
        except Exception as e:
            result["success"] = False
            result["error"] = str(e)

    async def _execute_volume_control(self, action: str, device_service, result: Dict):
        """Execute volume control command"""
        try:
            if action == "increase":
                await device_service.press_key("volume_up")
                result["response"] = "Volume increased"
            elif action == "decrease":
                await device_service.press_key("volume_down")
                result["response"] = "Volume decreased"
            elif action == "mute":
                await device_service.press_key("volume_mute")
                result["response"] = "Volume muted"
        except Exception as e:
            result["success"] = False
            result["error"] = str(e)

    def _get_help_text(self) -> str:
        """Get help text for voice commands"""
        return (
            "Available voice commands:\n"
            "• Navigation: 'go home', 'go back', 'scroll up/down', 'swipe left/right'\n"
            "• Apps: 'open chrome', 'open messages', 'open camera', 'close app'\n"
            "• Automation: 'take screenshot', 'start/stop recording', 'refresh page'\n"
            "• System: 'volume up/down', 'mute', 'unmute'\n"
            "• Assistant: 'hey assistant', 'help me', 'what can i say'"
        )

    def _get_available_commands(self) -> str:
        """Get list of available voice commands"""
        commands = list(self.command_handlers.keys())
        return f"You can say: {', '.join(sorted(commands))}"

    def _generate_command_id(self) -> str:
        """Generate unique command ID"""
        import uuid
        return str(uuid.uuid4())

    def _is_speech_available(self) -> bool:
        """Check if speech recognition is available"""
        return SPEECH_RECOGNITION_AVAILABLE and self.recognizer is not None

    def get_state(self) -> Dict[str, Any]:
        """Get current voice service state"""
        return {
            "state": self.state.value,
            "current_profile": self.current_profile.name if self.current_profile else None,
            "available_engines": [engine.value for engine in SpeechEngine],
            "speech_available": self._is_speech_available(),
            "microphone_available": self.microphone is not None,
            "vosk_available": VOSK_AVAILABLE and self.vosk_model is not None,
            "whisper_available": WHISPER_AVAILABLE and self.whisper_model is not None,
            "total_commands": len(self.command_handlers),
            "total_profiles": len(self.voice_profiles)
        }

    async def transcribe_audio_file(self, audio_path: str, engine: SpeechEngine = SpeechEngine.GOOGLE) -> Dict[str, Any]:
        """Transcribe audio file to text"""
        if not os.path.exists(audio_path):
            return {"error": f"Audio file not found: {audio_path}"}

        try:
            if engine == SpeechEngine.WHISPER and WHISPER_AVAILABLE:
                result = self.whisper_model.transcribe(audio_path, fp16=False)
                return {
                    "text": result['text'].strip(),
                    "engine": "whisper",
                    "confidence": 0.9,
                    "segments": result.get('segments', [])
                }

            elif engine == SpeechEngine.GOOGLE and SPEECH_RECOGNITION_AVAILABLE:
                with sr.AudioFile(audio_path) as source:
                    audio_data = self.recognizer.record(source)

                text = self.recognizer.recognize_google(audio_data)
                return {
                    "text": text,
                    "engine": "google",
                    "confidence": 0.8
                }

            else:
                return {"error": f"Engine {engine.value} not available"}

        except Exception as e:
            logger.error(f"Audio transcription failed: {e}")
            return {"error": str(e)}

# Global voice command service instance
voice_command_service = VoiceCommandService()