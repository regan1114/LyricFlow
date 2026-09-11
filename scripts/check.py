#!/usr/bin/env python3
"""Run checks against a temporary local server; always stop that server afterward."""

import argparse
import json
import os
import socket
import subprocess
import sys
import tempfile
import time
from contextlib import contextmanager
from pathlib import Path
from urllib.request import urlopen

ROOT = Path(__file__).resolve().parent.parent


def run(*args, env=None):
    subprocess.run(args, cwd=ROOT, env=env, check=True)


def wait_until_ready(server, base_url, log_path):
    for attempt in range(50):
        if server.poll() is not None:
            raise RuntimeError(f"Test server exited; see {log_path}")
        try:
            with urlopen(base_url + "/api/health", timeout=1) as response:
                health = json.load(response)
                if health.get("app") == "lyric-flow" and (
                    not os.environ.get("LYRIC_FLOW_TEST_FIXTURES") or health.get("ready")
                ):
                    return
        except OSError:
            pass
        time.sleep(0.1)
    raise RuntimeError(f"Test server did not become ready; see {log_path}")


@contextmanager
def test_server():
    with socket.socket() as listener:
        listener.bind(("127.0.0.1", 0))
        port = listener.getsockname()[1]
    base_url = f"http://127.0.0.1:{port}"
    log_path = ROOT / ".cache/check-server.log"
    log_path.parent.mkdir(exist_ok=True)
    with tempfile.TemporaryDirectory(prefix="check-jobs-", dir=log_path.parent) as directory:
        with log_path.open("w", encoding="utf-8") as log:
            server = subprocess.Popen(
                [sys.executable, "-u", "app.py", "--port", str(port), "--jobs-dir", directory],
                cwd=ROOT,
                stdout=log,
                stderr=subprocess.STDOUT,
            )
            try:
                wait_until_ready(server, base_url, log_path)
                yield dict(os.environ, LYRIC_FLOW_TEST_URL=base_url, LYRIC_FLOW_TEST_JOBS=directory)
            finally:
                server.terminate()
                try:
                    server.wait(timeout=15)
                except subprocess.TimeoutExpired:
                    server.kill()
                    server.wait()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--browser",
        action="store_true",
        help="Also run Chrome tests against the built Flask interface",
    )
    args = parser.parse_args()
    run(sys.executable, "-m", "ruff", "check", ".")
    run(sys.executable, "-m", "ruff", "format", "--check", ".")
    npm = "npm.cmd" if sys.platform == "win32" else "npm"
    run(npm, "run", "format:check")
    run(npm, "run", "typecheck")
    run(npm, "run", "lint")
    run(npm, "test")
    run(npm, "run", "build")
    with test_server() as environment:
        run(sys.executable, "-m", "unittest", "discover", "-s", "tests", "-v", env=environment)
        if args.browser:
            run(
                npm,
                "--prefix",
                "web",
                "run",
                "test:e2e",
                "--",
                "--workers=2",
                env=dict(environment, PLAYWRIGHT_BASE_URL=environment["LYRIC_FLOW_TEST_URL"]),
            )
    print("All checks passed. The temporary server and uploaded test files have been cleaned up.")


if __name__ == "__main__":
    main()
