#!/usr/bin/env python3
"""
Weekly Review Backend Runner

Use this script to start the backend server with proper signal handling.
This prevents zombie sockets when the server is terminated.

Usage:
    python backend/run.py
    python backend/run.py --port 8001
    python backend/run.py --no-reload
"""

import argparse
import atexit
import os
import signal
import socket
import sys

import uvicorn


# PID lockfile in %LOCALAPPDATA%/WeeklyReview/ prevents duplicate backends
# from fighting over the same SQLite DB (causes cascading 500 errors).
def _lockfile_path():
    if sys.platform == "win32":
        base = os.environ.get("LOCALAPPDATA", os.path.expanduser("~"))
        return os.path.join(base, "WeeklyReview", "backend.pid")
    return "/tmp/weekly_review_backend.pid"


def _kill_stale_backend():
    """Kill any existing backend holding the lockfile, if still alive."""
    path = _lockfile_path()
    if not os.path.exists(path):
        return
    try:
        with open(path) as f:
            old_pid = int(f.read().strip())
        # Check if the process is still alive
        if sys.platform == "win32":
            import subprocess
            result = subprocess.run(
                ["tasklist", "/FI", f"PID eq {old_pid}"],
                capture_output=True, text=True, timeout=5,
            )
            if str(old_pid) in result.stdout:
                print(f"Killing stale backend (PID {old_pid})...")
                subprocess.run(
                    ["taskkill", "/F", "/PID", str(old_pid), "/T"],
                    capture_output=True, timeout=5,
                )
                import time; time.sleep(0.5)
        else:
            os.kill(old_pid, signal.SIGTERM)
            import time; time.sleep(0.5)
    except (ValueError, OSError, FileNotFoundError):
        pass
    # Remove stale lockfile
    try:
        os.remove(path)
    except OSError:
        pass


def _write_lockfile():
    """Write our PID to the lockfile."""
    path = _lockfile_path()
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w") as f:
        f.write(str(os.getpid()))


def _remove_lockfile():
    """Remove lockfile on exit."""
    try:
        os.remove(_lockfile_path())
    except OSError:
        pass


def signal_handler(sig, frame):
    """Handle shutdown signals gracefully."""
    print("\nReceived shutdown signal, cleaning up...")
    _remove_lockfile()
    sys.exit(0)


def clear_port(host: str, port: int) -> bool:
    """
    Force socket reuse by pre-binding with SO_REUSEADDR.
    This helps clear TIME_WAIT sockets from previous runs.
    """
    try:
        sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        sock.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
        sock.bind((host, port))
        sock.close()
        return True
    except OSError as e:
        print(f"Warning: Could not pre-clear port {port}: {e}")
        return False


def main():
    parser = argparse.ArgumentParser(description="Run the Weekly Review backend")
    parser.add_argument("--host", default="127.0.0.1", help="Host to bind to")
    parser.add_argument("--port", type=int, default=8000, help="Port to bind to")
    parser.add_argument("--no-reload", action="store_true", help="Disable auto-reload")
    args = parser.parse_args()

    # Kill any stale backend before starting
    _kill_stale_backend()

    # Write PID lockfile and register cleanup
    _write_lockfile()
    atexit.register(_remove_lockfile)

    # Register signal handlers for graceful shutdown
    signal.signal(signal.SIGINT, signal_handler)
    signal.signal(signal.SIGTERM, signal_handler)

    # Windows-specific: handle CTRL+C properly
    if sys.platform == "win32":
        signal.signal(signal.SIGBREAK, signal_handler)

    # Pre-clear the port with SO_REUSEADDR to handle TIME_WAIT sockets
    clear_port(args.host, args.port)

    print(f"Starting server on {args.host}:{args.port}")
    print("Press Ctrl+C to stop")

    uvicorn.run(
        "app.main:app",
        host=args.host,
        port=args.port,
        reload=not args.no_reload,
        timeout_keep_alive=5,      # Close idle connections after 5 seconds
        log_level="info",
    )


if __name__ == "__main__":
    main()
