"""HTTP integration checks against the locally running app, without browser automation."""

import json
import re
import struct
import subprocess
import tempfile
import time
import unittest
import uuid
import wave
from pathlib import Path

from lyricflow.lyrics import read_lyrics
from tests.http_helpers import (
    EXPECTED_SRT,
    JOBS_DIRECTORY,
    ROOT,
    TEST_AUDIO,
    TEST_LYRICS,
    create,
    request,
    requires_song,
    wait_job,
)


class InterfaceTests(unittest.TestCase):
    def test_01_static_and_local_boundary(self):
        status, html, _ = request("GET", "/")
        self.assertEqual(status, 200)
        assets = re.findall(r'(?:src|href)="(/assets/[^" ]+)"', html.decode())
        self.assertGreaterEqual(len(assets), 2)
        for resource in ["/", *assets]:
            status, _, headers = request("GET", resource)
            self.assertEqual(status, 200)
            self.assertIn("connect-src 'self'", headers["Content-Security-Policy"])
        for path in ["/.local/models/ggml-small-q5_1.bin", "/../lyric.txt", "/api/jobs/not-an-id"]:
            self.assertEqual(request("GET", path)[0], 404)
        self.assertEqual(request("GET", "/api/health", headers={"Host": "evil.example"})[0], 403)
        self.assertEqual(
            request("POST", "/api/jobs", b"{}", {"Origin": "https://evil.example"})[0], 403
        )

    def test_02_bad_inputs_and_cancel(self):
        self.assertEqual(create("song.exe", 40)[0], 400)
        self.assertEqual(create("song.wav", 40, "[Instrumental]")[0], 400)
        self.assertEqual(create("song.wav", 201 * 1024 * 1024)[0], 400)
        status, data, _ = create("small.wav", 20)
        self.assertEqual(status, 201)
        identity = json.loads(data)["id"]
        try:
            self.assertEqual(create("second.wav", 20)[0], 409)
            _, data, _ = request("POST", "/api/jobs/" + identity + "/cancel")
            self.assertEqual(json.loads(data)["status"], "cancelled")
        finally:
            request("POST", "/api/jobs/" + identity + "/cancel")

    def test_03_corrupt_audio_has_actionable_error(self):
        status, data, _ = create("broken.wav", 20)
        self.assertEqual(status, 201)
        identity = json.loads(data)["id"]
        request("POST", f"/api/jobs/{identity}/audio", b"X" * 20)
        job = wait_job(identity)
        self.assertEqual(job["status"], "error")
        self.assertIn("音訊", job["message"])

    @requires_song
    def test_04_real_song_upload_to_download(self):
        source = TEST_AUDIO
        lyrics = TEST_LYRICS.read_text(encoding="utf-8-sig")
        status, data, _ = create(source.name, source.stat().st_size, lyrics)
        self.assertEqual(status, 201)
        identity = json.loads(data)["id"]
        try:
            with source.open("rb") as audio:
                status, _, _ = request(
                    "POST",
                    f"/api/jobs/{identity}/audio",
                    audio,
                    {
                        "Content-Length": str(source.stat().st_size),
                        "Content-Type": "application/octet-stream",
                    },
                )
            self.assertEqual(status, 202)
            job = wait_job(identity)
            self.assertEqual(job["status"], "done", job.get("message"))
            self.assertEqual(job["progress"], {"stage": "done", "percent": 100})
            self.assertEqual(len(job["result"]["lines"]), len(read_lyrics(TEST_LYRICS)))
            status, srt, headers = request("GET", f"/api/jobs/{identity}/srt")
            self.assertEqual(status, 200)
            self.assertIn("attachment;", headers["Content-Disposition"])
            self.assertEqual(srt, EXPECTED_SRT.read_bytes())
            status, chunk, headers = request(
                "GET", f"/api/jobs/{identity}/audio", headers={"Range": "bytes=0-99"}
            )
            self.assertEqual(status, 206)
            self.assertEqual(len(chunk), 100)
            self.assertTrue(chunk.startswith(b"RIFF"))
            self.assertEqual(
                request(
                    "GET", f"/api/jobs/{identity}/audio", headers={"Range": "bytes=999999999-"}
                )[0],
                416,
            )
            self.assertEqual(request("GET", f"/api/jobs/{identity}/report")[0], 200)
            events = [
                json.loads(line.removeprefix("LYRIC_FLOW_PROGRESS "))
                for line in (JOBS_DIRECTORY / identity / "process.log")
                .read_text(encoding="utf-8")
                .splitlines()
                if line.startswith("LYRIC_FLOW_PROGRESS ")
            ]
            self.assertTrue({"aligning", "exporting"} <= {event["stage"] for event in events})
            retries = [event for event in events if event["stage"] == "retrying"]
            self.assertTrue(all(1 <= event["current"] <= event["total"] <= 3 for event in retries))
            print(f"\nWAV verification: {identity}; {job['elapsed']} seconds", flush=True)
        finally:
            request("POST", "/api/jobs/" + identity + "/cancel")

    @requires_song
    def test_05_compressed_audio_is_decoded_locally(self):
        from imageio_ffmpeg import get_ffmpeg_exe

        lyrics = "\n".join(read_lyrics(TEST_LYRICS)[:4])
        with tempfile.TemporaryDirectory(dir=ROOT / ".cache") as directory:
            for extension in ["mp3", "m4a"]:
                with self.subTest(format=extension):
                    source = Path(directory) / ("clip." + extension)
                    subprocess.run(
                        [
                            get_ffmpeg_exe(),
                            "-nostdin",
                            "-v",
                            "error",
                            "-y",
                            "-ss",
                            "25",
                            "-i",
                            str(TEST_AUDIO),
                            "-t",
                            "22",
                            "-ac",
                            "1",
                            "-ar",
                            "44100",
                            str(source),
                        ],
                        check=True,
                    )
                    status, data, _ = create(source.name, source.stat().st_size, lyrics)
                    self.assertEqual(status, 201)
                    identity = json.loads(data)["id"]
                    with source.open("rb") as audio:
                        request(
                            "POST",
                            f"/api/jobs/{identity}/audio",
                            audio,
                            {"Content-Length": str(source.stat().st_size)},
                        )
                    job = wait_job(identity)
                    self.assertEqual(job["status"], "done", job.get("message"))
                    self.assertAlmostEqual(job["result"]["duration"], 22, delta=0.15)
                    self.assertGreater(
                        sum(r["start"] is not None for r in job["result"]["lines"]), 0
                    )
                    print(
                        f"\n{extension.upper()} verification: {len(job['result']['lines'])} lines; {job['elapsed']} seconds",
                        flush=True,
                    )

    @requires_song
    def test_06_running_job_can_be_stopped(self):
        from imageio_ffmpeg import get_ffmpeg_exe

        with tempfile.TemporaryDirectory(dir=ROOT / ".cache") as directory:
            source = Path(directory) / "cancel-test.mp3"
            subprocess.run(
                [
                    get_ffmpeg_exe(),
                    "-nostdin",
                    "-v",
                    "error",
                    "-y",
                    "-ss",
                    "24.321",
                    "-i",
                    str(TEST_AUDIO),
                    "-t",
                    "45.123",
                    str(source),
                ],
                check=True,
            )
            status, data, _ = create(
                source.name, source.stat().st_size, TEST_LYRICS.read_text(encoding="utf-8-sig")
            )
            self.assertEqual(status, 201)
            identity = json.loads(data)["id"]
            try:
                with source.open("rb") as audio:
                    request(
                        "POST",
                        f"/api/jobs/{identity}/audio",
                        audio,
                        {"Content-Length": str(source.stat().st_size)},
                    )
                deadline = time.monotonic() + 10
                while time.monotonic() < deadline:
                    job = json.loads(request("GET", f"/api/jobs/{identity}")[1])
                    if job["status"] == "processing":
                        break
                    time.sleep(0.05)
                self.assertEqual(job["status"], "processing")
                time.sleep(0.15)
                request("POST", f"/api/jobs/{identity}/cancel")
                time.sleep(0.3)
                self.assertEqual(wait_job(identity)["status"], "cancelled")
                self.assertEqual(request("GET", f"/api/jobs/{identity}/srt")[0], 404)
            finally:
                request("POST", f"/api/jobs/{identity}/cancel")

    @requires_song
    def test_07_live_recognition_progress(self):
        """A fresh 90-second clip must expose partial engine progress before done."""
        with tempfile.TemporaryDirectory(dir=ROOT / ".cache") as directory:
            source = Path(directory) / "progress.wav"
            with (
                wave.open(str(TEST_AUDIO), "rb") as audio,
                wave.open(str(source), "wb") as clip,
            ):
                clip.setparams(audio.getparams())
                audio.setpos(round(24.5 * audio.getframerate()))
                clip.writeframes(audio.readframes(90 * audio.getframerate()))
            # A valid ignored RIFF chunk ensures a new cache key without changing the audio.
            with source.open("r+b") as audio:
                audio.seek(0, 2)
                audio.write(b"JUNK" + struct.pack("<I", 16) + uuid.uuid4().bytes)
                size = audio.tell()
                audio.seek(4)
                audio.write(struct.pack("<I", size - 8))
            status, data, _ = create(source.name, size, "\n".join(read_lyrics(TEST_LYRICS)[:4]))
            self.assertEqual(status, 201)
            identity = json.loads(data)["id"]
            seen = []
            try:
                with source.open("rb") as audio:
                    request(
                        "POST", f"/api/jobs/{identity}/audio", audio, {"Content-Length": str(size)}
                    )
                deadline = time.monotonic() + 100
                while time.monotonic() < deadline:
                    job = json.loads(request("GET", f"/api/jobs/{identity}")[1])
                    event = job.get("progress", {})
                    if event.get("stage") == "recognizing" and event["percent"] not in seen:
                        seen.append(event["percent"])
                    if job["status"] in {"done", "error", "cancelled"}:
                        break
                    time.sleep(0.1)
                self.assertEqual(job["status"], "done", job.get("message"))
                self.assertTrue(any(0 < value < 100 for value in seen), seen)
                self.assertEqual(seen, sorted(seen))
                self.assertEqual(job["progress"], {"stage": "done", "percent": 100})
                self.assertEqual(request("GET", f"/api/jobs/{identity}/srt")[0], 200)
                print(f"\nLive progress: {seen}; completed in {job['elapsed']} seconds", flush=True)
            finally:
                request("POST", f"/api/jobs/{identity}/cancel")


if __name__ == "__main__":
    unittest.main()
