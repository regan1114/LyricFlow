"""Run cancellable local process groups and stream their logs."""

import os
import signal
import subprocess
import sys
import threading
from pathlib import Path

from .errors import ProcessingError


class ProcessRunner:
    def __init__(self, store):
        self.store = store
        self._processes = {}
        self._windows_jobs = {}
        self._lock = threading.Lock()

    def run(self, job_id, args, on_line=None):
        with self._lock:
            if self.store.is_terminal(job_id):
                return False
            windows_job = None
            process = None
            options = {"start_new_session": True}
            if sys.platform == "win32":
                from .windows_job import WindowsJob

                windows_job = WindowsJob()
                args = [
                    sys.executable,
                    "-u",
                    str(Path(__file__).with_name("worker_bootstrap.py")),
                    *args,
                ]
                options = {"stdin": subprocess.PIPE, "creationflags": subprocess.CREATE_NO_WINDOW}
            try:
                process = subprocess.Popen(
                    args,
                    stdout=subprocess.PIPE,
                    stderr=subprocess.STDOUT,
                    text=True,
                    encoding="utf-8",
                    errors="replace",
                    env=dict(os.environ, PYTHONIOENCODING="utf-8", PYTHONUTF8="1"),
                    **options,
                )
                if windows_job:
                    windows_job.assign(process.pid)
                    # Text-mode pipes translate "\n" to os.linesep ("\r\n" on
                    # Windows) on write. worker_bootstrap.py reads exactly one
                    # byte expecting b"\n", so the translated "\r" breaks the
                    # handshake. Write the raw byte via the underlying buffer.
                    process.stdin.buffer.write(b"\n")
                    process.stdin.buffer.flush()
                    process.stdin.close()
                    process.stdin = None
                    self._windows_jobs[job_id] = windows_job
            except BaseException:
                if windows_job:
                    windows_job.close()
                if process:
                    process.kill()
                    process.communicate()
                raise
            self._processes[job_id] = process
        try:
            with (
                process,
                (self.store.folder(job_id) / "process.log").open("a", encoding="utf-8") as log,
            ):
                for line in process.stdout:
                    log.write(line)
                    if on_line and not self.store.is_terminal(job_id):
                        on_line(line)
            if self.store.is_terminal(job_id):
                return False
            if process.returncode:
                raise ProcessingError(
                    "音訊無法處理。請確認檔案能正常播放，或改用 PCM WAV 再試一次。"
                )
            return True
        finally:
            with self._lock:
                self._processes.pop(job_id, None)
                job = self._windows_jobs.pop(job_id, None)
                if job:
                    job.close()

    def cancel(self, job_id):
        with self._lock:
            process = self._processes.get(job_id)
            if process is None:
                return
            windows_job = self._windows_jobs.get(job_id)
            if windows_job:
                windows_job.terminate()
                process.wait(timeout=5)
                return
            try:
                os.killpg(process.pid, signal.SIGTERM)
            except ProcessLookupError:
                return
        try:
            process.wait(timeout=2)
        except subprocess.TimeoutExpired:
            try:
                os.killpg(process.pid, signal.SIGKILL)
            except ProcessLookupError:
                pass
            process.wait(timeout=2)

    def close(self):
        with self._lock:
            identities = list(self._processes)
        for job_id in identities:
            self.cancel(job_id)
