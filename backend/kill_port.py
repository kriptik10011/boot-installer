#!/usr/bin/env python3
"""
Kill processes using a specific port.

Usage:
    python backend/kill_port.py           # Kill processes on port 8000
    python backend/kill_port.py 8001      # Kill processes on port 8001
    python backend/kill_port.py --check   # Just check if port is in use
"""

import argparse
import socket
import subprocess
import sys
import time
import platform


def get_pids_on_port(port: int) -> set[str]:
    """Get all process IDs using a specific port."""
    pids = set()

    if platform.system() == "Windows":
        result = subprocess.run(
            f'netstat -ano | findstr :{port}',
            shell=True,
            capture_output=True,
            text=True
        )
        for line in result.stdout.strip().split('\n'):
            if line.strip():
                parts = line.split()
                if len(parts) >= 5:
                    pid = parts[-1]
                    if pid.isdigit() and pid != '0':
                        pids.add(pid)
    else:
        # macOS/Linux
        result = subprocess.run(
            f'lsof -ti :{port}',
            shell=True,
            capture_output=True,
            text=True
        )
        for pid in result.stdout.strip().split('\n'):
            if pid.strip() and pid.isdigit():
                pids.add(pid)

    return pids


def kill_pid(pid: str) -> bool:
    """Kill a process by PID."""
    try:
        if platform.system() == "Windows":
            result = subprocess.run(
                f'taskkill /PID {pid} /F',
                shell=True,
                capture_output=True,
                text=True
            )
        else:
            result = subprocess.run(
                f'kill -9 {pid}',
                shell=True,
                capture_output=True,
                text=True
            )
        return result.returncode == 0
    except Exception as e:
        print(f"Error killing PID {pid}: {e}")
        return False


def check_process_exists(pid: str) -> bool:
    """Check if a process actually exists (not just a zombie socket)."""
    try:
        if platform.system() == "Windows":
            result = subprocess.run(
                f'tasklist /FI "PID eq {pid}"',
                shell=True,
                capture_output=True,
                text=True
            )
            return pid in result.stdout
        else:
            result = subprocess.run(
                f'ps -p {pid}',
                shell=True,
                capture_output=True,
                text=True
            )
            return result.returncode == 0
    except Exception:
        return False


def clear_time_wait(host: str, port: int) -> bool:
    """
    Try to clear TIME_WAIT sockets using SO_REUSEADDR.
    This allows binding to a port even if it's in TIME_WAIT state.
    """
    try:
        sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        sock.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
        sock.bind((host, port))
        sock.close()
        return True
    except OSError:
        return False


def main():
    parser = argparse.ArgumentParser(description="Kill processes on a port")
    parser.add_argument("port", nargs="?", type=int, default=8000, help="Port number (default: 8000)")
    parser.add_argument("--check", action="store_true", help="Only check, don't kill")
    args = parser.parse_args()

    port = args.port
    pids = get_pids_on_port(port)

    if not pids:
        print(f"Port {port} is free")
        sys.exit(0)

    print(f"Found {len(pids)} process(es) on port {port}: {', '.join(pids)}")

    if args.check:
        # Just report status
        for pid in pids:
            exists = check_process_exists(pid)
            status = "active" if exists else "zombie socket"
            print(f"  PID {pid}: {status}")

        zombie_count = sum(1 for pid in pids if not check_process_exists(pid))
        if zombie_count > 0:
            print(f"\n{zombie_count} zombie socket(s) detected.")
            print("These cannot be killed - restart your computer to clear them.")
            print("Or try: python backend/kill_port.py (without --check)")
        sys.exit(0)

    # Kill processes
    killed = 0
    zombies = 0

    for pid in pids:
        if not check_process_exists(pid):
            print(f"PID {pid} is a zombie socket (process doesn't exist)")
            zombies += 1
            continue

        if kill_pid(pid):
            print(f"Killed PID {pid}")
            killed += 1
        else:
            print(f"Failed to kill PID {pid}")

    # Wait briefly for TIME_WAIT to clear
    if killed > 0:
        print("Waiting for TIME_WAIT sockets to clear...")
        time.sleep(1)

    # Try to clear any remaining TIME_WAIT sockets with SO_REUSEADDR
    if clear_time_wait("127.0.0.1", port):
        print(f"Successfully cleared TIME_WAIT on port {port}")

    # Verify port is now free
    remaining = get_pids_on_port(port)
    if remaining:
        # Check if these are actual processes or just TIME_WAIT
        active_remaining = [pid for pid in remaining if check_process_exists(pid)]
        if active_remaining:
            print(f"\nWarning: Port {port} still has {len(active_remaining)} active process(es)")
            sys.exit(1)
        else:
            # Only TIME_WAIT sockets remain - SO_REUSEADDR should handle these
            print(f"\nPort {port} has TIME_WAIT sockets but should be usable with SO_REUSEADDR")
            if zombies > 0:
                print(f"Note: {zombies} zombie socket(s) detected - restart computer to fully clear.")
            sys.exit(0)
    else:
        print(f"\nPort {port} is now free")
        sys.exit(0)


if __name__ == "__main__":
    main()
