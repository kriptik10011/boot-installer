#!/usr/bin/env python3
"""
Weekly Review Backend Server Entry Point

This is the entry point for the PyInstaller executable.
Runs the FastAPI server on localhost:8000.

Includes port conflict detection and retry logic to ensure
the backend starts reliably even if a previous instance is still shutting down.
"""

import sys
import os
import socket
import time
import logging

# Ensure the app package is importable
if getattr(sys, 'frozen', False):
    # Running as compiled executable
    app_dir = os.path.dirname(sys.executable)
else:
    # Running as script
    app_dir = os.path.dirname(os.path.abspath(__file__))

sys.path.insert(0, app_dir)

# Set up logging for startup diagnostics
from pathlib import Path
from platformdirs import user_data_dir

log_dir = Path(user_data_dir("WeeklyReview", False))
log_dir.mkdir(parents=True, exist_ok=True)
log_file = log_dir / "backend_startup.log"

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s',
    handlers=[
        logging.FileHandler(log_file, encoding='utf-8'),
    ]
)
logger = logging.getLogger(__name__)


def is_port_available(port: int, host: str = "127.0.0.1") -> bool:
    """Check if a port is available for binding."""
    try:
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
            s.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
            s.bind((host, port))
            return True
    except OSError:
        return False


def wait_for_port(port: int, host: str = "127.0.0.1", timeout: float = 10.0) -> bool:
    """Wait for a port to become available."""
    start_time = time.time()
    while time.time() - start_time < timeout:
        if is_port_available(port, host):
            return True
        logger.info(f"Port {port} in use, waiting...")
        time.sleep(0.5)
    return False


def main():
    """Run the FastAPI server with retry logic."""
    import uvicorn
    from app.main import app

    host = "127.0.0.1"
    port = 8000

    logger.info(f"Starting Weekly Review backend on {host}:{port}")

    # Wait for port to be available (handles previous instance shutting down)
    if not is_port_available(port, host):
        logger.warning(f"Port {port} is in use, waiting for it to become available...")
        if not wait_for_port(port, host, timeout=10.0):
            logger.error(f"Port {port} did not become available after 10 seconds")
            # Try to start anyway - uvicorn will report the error

    logger.info("Port available, starting uvicorn server...")

    try:
        uvicorn.run(
            app,
            host=host,
            port=port,
            log_level="warning",  # Reduce noise in production
            access_log=False,
        )
    except Exception as e:
        logger.error(f"Failed to start server: {e}")
        raise


if __name__ == "__main__":
    main()
