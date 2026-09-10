"""API contract tests against the running localhost service."""

import json
import subprocess
import tempfile
import unittest
import uuid
from pathlib import Path

from lyric_flow_client import LyricFlowClient, LyricFlowError
from tests.http_helpers import (
    BASE,
    EXPECTED_SRT,
    ROOT,
    TEST_AUDIO,
    TEST_LYRICS,
    create,
    request,
    requires_song,
    wait_job,
)


def multipart(parts):
    boundary = "lyric-flow-test-" + uuid.uuid4().hex
    chunks = []
    for name, filename, data in parts:
        disposition = f'Content-Disposition: form-data; name="{name}"'
        if filename is not None:
            disposition += f'; filename="{filename}"'
        chunks.extend([f"--{boundary}\r\n{disposition}\r\n\r\n".encode(), data, b"\r\n"])
    chunks.append(f"--{boundary}--\r\n".encode())
    return b"".join(chunks), {"Content-Type": "multipart/form-data; boundary=" + boundary}


def curl_upload(wait):
    with tempfile.TemporaryDirectory(dir=ROOT / ".cache") as directory:
        output, headers = Path(directory) / "response", Path(directory) / "headers"
        result = subprocess.run(
            [
                "curl",
                "--silent",
                "--show-error",
                "--max-time",
                "30",
                "--dump-header",
                str(headers),
                "--output",
                str(output),
                "--write-out",
                "%{http_code}",
                BASE + "/api/align" + ("?wait=true" if wait else ""),
                "-F",
                "audio=@" + str(TEST_AUDIO),
                "-F",
                "lyrics=@" + str(TEST_LYRICS),
                "-F",
                "threads=4",
            ],
            check=True,
            capture_output=True,
            text=True,
        )
        return int(result.stdout), output.read_bytes(), headers.read_text(encoding="utf-8")


class ApiTests(unittest.TestCase):
    @requires_song
    def test_01_single_request_returns_real_srt(self):
        status, data, headers = curl_upload(wait=True)
        self.assertEqual(status, 200, data[:500])
        self.assertEqual(data, EXPECTED_SRT.read_bytes())
        self.assertIn("application/x-subrip; charset=utf-8", headers)
        self.assertIn("Content-Disposition: attachment;", headers)
        identity = next(
            line.split(": ", 1)[1]
            for line in headers.splitlines()
            if line.startswith("X-Lyric-Flow-Job-Id:")
        )
        self.assertEqual(len(identity), 32)
        job = LyricFlowClient(BASE).get_job(identity)
        self.assertEqual(job["status"], "done")
        print("\nMultipart synchronous: reference SRT returned unchanged.", flush=True)

    @requires_song
    def test_02_async_submit_poll_and_download(self):
        status, data, _ = curl_upload(wait=False)
        self.assertEqual(status, 202, data[:500])
        job = json.loads(data)
        identity = job["id"]
        try:
            self.assertEqual(job["status_url"], "/api/jobs/" + identity)
            job = wait_job(identity)
            self.assertEqual(job["status"], "done")
            self.assertEqual(job["srt_url"], "/api/jobs/" + identity + "/srt")
            status, data, headers = request("GET", job["srt_url"])
            self.assertEqual(status, 200)
            self.assertEqual(headers["X-Lyric-Flow-Job-Id"], identity)
            self.assertEqual(data, EXPECTED_SRT.read_bytes())
        finally:
            request("POST", "/api/jobs/" + identity + "/cancel")

    @requires_song
    def test_03_python_client_returns_srt_and_reports_errors(self):
        client = LyricFlowClient(BASE)
        progress = []
        data = client.align(
            TEST_AUDIO,
            TEST_LYRICS.read_text(encoding="utf-8-sig"),
            timeout=30,
            on_progress=lambda job: progress.append(job),
        )
        self.assertEqual(data, EXPECTED_SRT.read_bytes())
        self.assertEqual(progress[-1]["progress"]["percent"], 100)
        with self.assertRaises(LyricFlowError) as error:
            client.submit(TEST_AUDIO, "春風吹過山河", threads=3)
        self.assertEqual(error.exception.status, 400)
        with self.assertRaises(LyricFlowError) as error:
            client.get_job("0" * 32)
        self.assertEqual(error.exception.status, 404)

    def test_04_multipart_validation_does_not_start_jobs(self):
        audio = ("audio", "song.wav", b"X" * 20)
        lyrics = ("lyrics", None, "春風吹過山河".encode())
        invalid = [
            [lyrics],
            [audio],
            [audio, lyrics, lyrics],
            [audio, ("lyrics", None, b"[Instrumental]")],
            [audio, ("lyrics", "lyrics.txt", b"\xff")],
            [audio, lyrics, ("threads", None, b"3")],
            [audio, lyrics, ("callback_url", None, b"https://example.invalid")],
        ]
        for parts in invalid:
            with self.subTest(parts=[part[:2] for part in parts]):
                body, headers = multipart(parts)
                self.assertEqual(request("POST", "/api/align", body, headers)[0], 400)
        body, headers = multipart([audio, lyrics])
        self.assertEqual(request("POST", "/api/align?wait=maybe", body, headers)[0], 400)
        self.assertEqual(request("POST", "/api/align?wait=true&wait=false", body, headers)[0], 400)
        self.assertEqual(
            request("POST", "/api/align", b"{}", {"Content-Type": "application/json"})[0], 415
        )
        self.assertEqual(request("POST", "/api/align", body[:-45], headers)[0], 400)

    def test_05_synchronous_failure_returns_json(self):
        body, headers = multipart(
            [("audio", "broken.wav", b"X" * 20), ("lyrics", None, "春風吹過山河".encode())]
        )
        status, data, headers = request("POST", "/api/align?wait=true", body, headers)
        self.assertEqual(status, 422)
        self.assertIn("application/json", headers["Content-Type"])
        job = json.loads(data)
        self.assertEqual(job["status"], "error")
        self.assertEqual(len(job["job_id"]), 32)

    def test_06_api_and_web_share_single_job_limit(self):
        status, data, _ = create("reserved.wav", 20)
        self.assertEqual(status, 201)
        identity = json.loads(data)["id"]
        try:
            body, headers = multipart(
                [("audio", "another.wav", b"X" * 20), ("lyrics", None, "春風吹過山河".encode())]
            )
            status, data, _ = request("POST", "/api/align", body, headers)
            self.assertEqual(status, 409)
            self.assertEqual(json.loads(data)["job_id"], identity)
            with tempfile.TemporaryDirectory() as directory:
                source = Path(directory) / "another.wav"
                source.write_bytes(b"X" * 20)
                with self.assertRaises(LyricFlowError) as error:
                    LyricFlowClient(BASE).submit(source, "春風吹過山河")
            self.assertEqual(error.exception.status, 409)
            self.assertEqual(error.exception.job_id, identity)
            self.assertEqual(LyricFlowClient(BASE).get_job(identity)["status"], "uploading")
        finally:
            request("POST", "/api/jobs/" + identity + "/cancel")


if __name__ == "__main__":
    unittest.main()
