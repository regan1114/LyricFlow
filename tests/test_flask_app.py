"""Factory isolation, HTTP translation and application dependency boundaries."""

import ast
import io
import socket
import tempfile
import unittest
from pathlib import Path

from lyricflow.config import Settings
from lyricflow.factory import create_app

ROOT = Path(__file__).resolve().parent.parent
BASE = "http://127.0.0.1:8765"


class FlaskApplicationTests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory()
        self.apps = [
            create_app(Settings(jobs_directory=Path(self.temporary.name) / str(index)))
            for index in range(2)
        ]

    def tearDown(self):
        for app in self.apps:
            app.extensions["alignment_service"].close()
        self.temporary.cleanup()

    def test_factories_do_not_share_mutable_job_state(self):
        first, second = [app.test_client() for app in self.apps]
        metadata = {"name": "song.wav", "size": 20, "lyrics": "春風吹過山河"}
        job = first.post("/api/jobs", json=metadata, base_url=BASE)
        self.assertEqual(job.status_code, 201)
        self.assertEqual(second.get(job.json["status_url"], base_url=BASE).status_code, 404)
        self.assertEqual(second.post("/api/jobs", json=metadata, base_url=BASE).status_code, 201)

    def test_web_modules_are_served_and_private_files_are_not(self):
        with self.apps[0].test_client() as client:
            for path in ["/api.mjs", "/storage.mjs", "/progress.mjs"]:
                response = client.get(path, base_url=BASE)
                self.assertEqual(response.status_code, 200)
                self.assertIn("javascript", response.content_type)
                response.close()
            self.assertEqual(client.get("/lyricflow/config.py", base_url=BASE).status_code, 404)

    def test_unknown_routes_and_invalid_input_return_json(self):
        client = self.apps[0].test_client()
        self.assertIsNotNone(client.get("/api/missing", base_url=BASE).json)
        for data in [
            [],
            {"name": "song.wav", "size": True, "lyrics": "歌詞"},
            {"name": "song.wav", "size": 20, "lyrics": "歌詞", "threads": 2.5},
        ]:
            self.assertEqual(client.post("/api/jobs", json=data, base_url=BASE).status_code, 400)

    def test_engine_and_services_have_no_web_framework_imports(self):
        modules = [
            "alignment",
            "lyrics",
            "pipeline",
            "repair",
            "recognition",
            "subtitles",
            "service",
            "job_store",
            "processor",
            "process_runner",
            "validation",
            "config",
        ]
        for module in modules:
            tree = ast.parse((ROOT / "lyricflow" / (module + ".py")).read_text(encoding="utf-8"))
            for node in ast.walk(tree):
                names = [alias.name for alias in node.names] if isinstance(node, ast.Import) else []
                if isinstance(node, ast.ImportFrom) and node.module:
                    names.append(node.module)
                self.assertFalse(
                    {"flask", "werkzeug"} & {name.split(".")[0] for name in names}, module
                )

    def test_upload_inactivity_timeout_keeps_408_json_contract(self):
        class TimedOutStream(io.BytesIO):
            def readinto(self, buffer):
                raise socket.timeout("upload timed out")

        response = (
            self.apps[0]
            .test_client()
            .post(
                "/api/jobs",
                base_url=BASE,
                content_type="application/json",
                environ_overrides={"wsgi.input": TimedOutStream(), "CONTENT_LENGTH": "20"},
            )
        )
        self.assertEqual(response.status_code, 408)
        self.assertIn("逾時", response.json["error"])
