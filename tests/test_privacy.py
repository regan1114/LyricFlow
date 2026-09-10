"""Regression checks for local HTTP boundaries and filename handling."""

import os
import stat
import tempfile
import unittest
from pathlib import Path

from lyricflow.config import Settings
from lyricflow.errors import ValidationError
from lyricflow.factory import create_app
from lyricflow.job_store import JobStore
from lyricflow.validation import parse_job_input

BASE = "http://127.0.0.1:8765"


class PrivacyTests(unittest.TestCase):
    def test_cross_site_requests_are_rejected_even_without_origin(self):
        with tempfile.TemporaryDirectory() as directory:
            app = create_app(Settings(jobs_directory=Path(directory)))
            try:
                client = app.test_client()
                for method, path in [("GET", "/api/health"), ("POST", "/api/jobs")]:
                    response = client.open(
                        path,
                        method=method,
                        base_url=BASE,
                        headers={"Sec-Fetch-Site": "cross-site"},
                    )
                    self.assertEqual(response.status_code, 403)
                for headers in [{}, {"Sec-Fetch-Site": "same-origin", "Origin": BASE}]:
                    response = client.get("/api/health", base_url=BASE, headers=headers)
                    self.assertEqual(response.status_code, 200)
                    self.assertEqual(response.headers["Referrer-Policy"], "no-referrer")
                    self.assertEqual(
                        response.headers["Cross-Origin-Resource-Policy"], "same-origin"
                    )
                    self.assertNotIn("Access-Control-Allow-Origin", response.headers)
                self.assertEqual(
                    client.get("/api/health", base_url="http://evil.example:8765").status_code, 403
                )
                for origin in ["null", "https://evil.example", "http://localhost:9999"]:
                    self.assertEqual(
                        client.get(
                            "/api/health", base_url=BASE, headers={"Origin": origin}
                        ).status_code,
                        403,
                    )
            finally:
                app.extensions["alignment_service"].close()

    def test_control_characters_in_download_names_are_rejected(self):
        for name in [
            "song\r\nX-Test: injected.wav",
            "song\x00.wav",
            "song\x7f.wav",
            "a" * 256 + ".wav",
        ]:
            with self.subTest(name=repr(name)), self.assertRaises(ValidationError):
                parse_job_input({"name": name, "size": 20, "lyrics": "歌詞"})
        data = parse_job_input({"name": "C:\\Music\\九月 九.wav", "size": 20, "lyrics": "歌詞"})
        self.assertEqual(data.name, "九月 九.wav")

    @unittest.skipIf(os.name == "nt", "Windows relies on inherited user-folder ACLs")
    def test_new_job_directory_is_private_to_its_owner(self):
        with tempfile.TemporaryDirectory() as directory:
            store = JobStore(Path(directory))
            job = store.create(parse_job_input({"name": "song.wav", "size": 20, "lyrics": "歌詞"}))
            self.assertEqual(stat.S_IMODE(store.folder(job["id"]).stat().st_mode), 0o700)
            store.close()
