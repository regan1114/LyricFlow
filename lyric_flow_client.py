"""Dependency-free client for a running LyricFlow service (Python 3.9+)."""

import http.client
import json
import re
import time
from pathlib import Path
from urllib.parse import urlparse


class LyricFlowError(RuntimeError):
    def __init__(self, message, status=None, job_id=None):
        super().__init__(message)
        self.status = status
        self.job_id = job_id


class LyricFlowClient:
    def __init__(self, base_url="http://127.0.0.1:8765", request_timeout=60):
        self.url = urlparse(base_url)
        if (
            self.url.scheme not in ("http", "https")
            or not self.url.hostname
            or self.url.path not in ("", "/")
        ):
            raise ValueError("base_url 必須是完整服務網址，例如 http://127.0.0.1:8765")
        self.request_timeout = request_timeout

    def _request(self, method, path, body=None, headers=None):
        kind = (
            http.client.HTTPSConnection
            if self.url.scheme == "https"
            else http.client.HTTPConnection
        )
        connection = kind(self.url.hostname, self.url.port, timeout=self.request_timeout)
        try:
            connection.request(method, path, body, headers or {})
            response = connection.getresponse()
            data = response.read()
            if not 200 <= response.status < 300:
                try:
                    error = json.loads(data)
                except (ValueError, UnicodeError):
                    error = {}
                raise LyricFlowError(
                    error.get("error", f"API 回應 HTTP {response.status}"),
                    response.status,
                    error.get("job_id"),
                )
            return data
        finally:
            connection.close()

    @staticmethod
    def _job_path(job_id):
        if not isinstance(job_id, str) or not re.fullmatch(r"[a-f0-9]{32}", job_id):
            raise ValueError("無效的工作編號")
        return "/api/jobs/" + job_id

    def submit(self, audio_path, lyrics, threads=4):
        """Stream audio from disk and return a job; does not wait for alignment."""
        source = Path(audio_path)
        with source.open("rb") as audio:
            size = source.stat().st_size
            metadata = json.dumps(
                {"name": source.name, "size": size, "lyrics": lyrics, "threads": threads}
            ).encode("utf-8")
            job = json.loads(
                self._request("POST", "/api/jobs", metadata, {"Content-Type": "application/json"})
            )
            try:
                return json.loads(
                    self._request(
                        "POST",
                        self._job_path(job["id"]) + "/audio",
                        audio,
                        {"Content-Type": "application/octet-stream", "Content-Length": str(size)},
                    )
                )
            except Exception:
                try:
                    self.cancel(job["id"])
                except Exception:
                    pass
                raise

    def get_job(self, job_id):
        return json.loads(self._request("GET", self._job_path(job_id)))

    def cancel(self, job_id):
        return json.loads(self._request("POST", self._job_path(job_id) + "/cancel"))

    def download_srt(self, job_id):
        """Return the original generated SRT as UTF-8 BOM bytes."""
        return self._request("GET", self._job_path(job_id) + "/srt")

    def wait(self, job_id, timeout=900, poll_interval=1, on_progress=None):
        """Poll until done. A timeout leaves the job running so it can be resumed."""
        if timeout <= 0 or poll_interval <= 0:
            raise ValueError("timeout 和 poll_interval 必須大於 0")
        deadline = time.monotonic() + timeout
        while True:
            job = self.get_job(job_id)
            if on_progress:
                on_progress(job)
            if job["status"] == "done":
                return job
            if job["status"] in ("error", "cancelled"):
                raise LyricFlowError(job["message"], job_id=job_id)
            remaining = deadline - time.monotonic()
            if remaining <= 0:
                raise TimeoutError(f"等待逾時；工作 {job_id} 仍在本機處理，可查詢或取消。")
            time.sleep(min(poll_interval, remaining))

    def align(self, audio_path, lyrics, threads=4, timeout=900, on_progress=None):
        """Submit, wait and return SRT bytes in one function call."""
        if timeout <= 0:
            raise ValueError("timeout 必須大於 0")
        job = self.submit(audio_path, lyrics, threads)
        self.wait(job["id"], timeout=timeout, on_progress=on_progress)
        return self.download_srt(job["id"])
