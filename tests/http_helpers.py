"""HTTP test helpers; the check script selects an isolated local port."""

import http.client
import json
import os
import time
import unittest
from pathlib import Path
from urllib.parse import urlparse

ROOT = Path(__file__).resolve().parent.parent
BASE = os.environ.get("LYRIC_FLOW_TEST_URL", "http://127.0.0.1:8765")
SERVER = urlparse(BASE)
JOBS_DIRECTORY = Path(os.environ.get("LYRIC_FLOW_TEST_JOBS", str(ROOT / ".cache/interface")))
FIXTURES_DIRECTORY = Path(os.environ.get("LYRIC_FLOW_TEST_FIXTURES", str(ROOT / "tests/fixtures")))
TEST_AUDIO = FIXTURES_DIRECTORY / "song.wav"
TEST_LYRICS = FIXTURES_DIRECTORY / "lyrics.txt"
EXPECTED_SRT = FIXTURES_DIRECTORY / "expected.srt"
requires_song = unittest.skipUnless(
    os.environ.get("LYRIC_FLOW_TEST_FIXTURES"),
    "未指定 LYRIC_FLOW_TEST_FIXTURES；略過需要外部歌曲素材的測試。",
)


def request(method, path, body=None, headers=None):
    connection = http.client.HTTPConnection(SERVER.hostname, SERVER.port, timeout=30)
    try:
        connection.request(method, path, body=body, headers=headers or {})
        response = connection.getresponse()
        return response.status, response.read(), dict(response.getheaders())
    finally:
        connection.close()


def create(name, size, lyrics="春風吹過山河"):
    return request(
        "POST",
        "/api/jobs",
        json.dumps({"name": name, "size": size, "lyrics": lyrics, "threads": 4}),
        {"Content-Type": "application/json"},
    )


def wait_job(identity):
    deadline = time.monotonic() + 100
    while time.monotonic() < deadline:
        job = json.loads(request("GET", "/api/jobs/" + identity)[1])
        if job["status"] in {"done", "error", "cancelled"}:
            return job
        time.sleep(0.25)
    raise AssertionError("工作未在測試時間內完成")
