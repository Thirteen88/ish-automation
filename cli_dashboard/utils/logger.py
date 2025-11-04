"""
Logging utilities for CLI Dashboard
"""
import logging
import sys
from typing import Optional
from pathlib import Path

def setup_logger(
    name: str,
    level: str = "INFO",
    debug: bool = False,
    log_file: Optional[str] = None
) -> logging.Logger:
    """Setup logger with console and optional file output"""

    # Create logger
    logger = logging.getLogger(name)

    # Clear existing handlers
    logger.handlers.clear()

    # Set log level
    if debug:
        logger.setLevel(logging.DEBUG)
    else:
        logger.setLevel(getattr(logging, level.upper(), logging.INFO))

    # Create formatter
    if debug:
        formatter = logging.Formatter(
            '%(asctime)s - %(name)s - %(levelname)s - %(funcName)s:%(lineno)d - %(message)s'
        )
    else:
        formatter = logging.Formatter(
            '%(asctime)s - %(levelname)s - %(message)s'
        )

    # Console handler
    console_handler = logging.StreamHandler(sys.stdout)
    console_handler.setFormatter(formatter)
    logger.addHandler(console_handler)

    # File handler (if specified)
    if log_file:
        log_path = Path(log_file)
        log_path.parent.mkdir(parents=True, exist_ok=True)

        file_handler = logging.FileHandler(log_path)
        file_handler.setFormatter(formatter)
        logger.addHandler(file_handler)

    return logger

def get_logger(name: str) -> logging.Logger:
    """Get existing logger"""
    return logging.getLogger(name)