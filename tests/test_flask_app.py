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

    def test_built_frontend_and_private_file_boundary(self):
        with self.apps[0].test_client() as client:
            response = client.get("/", base_url=BASE)
            self.assertEqual(response.status_code, 200)
            html = response.get_data(as_text=True)
            self.assertIn('<div id="app"></div>', html)
            self.assertNotIn("/src/main.ts", html)
            response.close()
            import re

            assets = re.findall(r'(?:src|href)="(/assets/[^" ]+)"', html)
            self.assertGreaterEqual(len(assets), 2)
            for path in assets + ["/fonts/sources.json", "/LICENSE-OPENCUT"]:
                response = client.get(path, base_url=BASE)
                self.assertEqual(response.status_code, 200, path)
                response.close()
            for path in [
                "/lyricflow/config.py",
                "/src/main.ts",
                "/package.json",
                "/../index.html",
                "/assets/../../package.json",
                "/.git/config",
                "/api/missing",
            ]:
                self.assertEqual(client.get(path, base_url=BASE).status_code, 404, path)

    def test_static_assets_revalidate_but_api_and_html_are_not_cached(self):
        import re

        with self.apps[0].test_client() as client:
            page = client.get("/", base_url=BASE)
            self.assertEqual(page.headers["Cache-Control"], "no-store")
            filename = re.search(r'src="(/assets/[^" ]+)', page.get_data(as_text=True))[1]
            page.close()
            asset = client.get(filename, base_url=BASE)
            self.assertIn("immutable", asset.headers["Cache-Control"])
            etag = asset.headers["ETag"]
            asset.close()
            cached = client.get(filename, base_url=BASE, headers={"If-None-Match": etag})
            self.assertEqual(cached.status_code, 304)
            self.assertFalse(cached.data)
            cached.close()
            font = client.get("/fonts/sources.json", base_url=BASE)
            self.assertIn("must-revalidate", font.headers["Cache-Control"])
            font.close()
            for path in ["/api/health", "/assets/missing.js", "/api/jobs/missing/audio"]:
                response = client.get(path, base_url=BASE)
                self.assertEqual(response.headers["Cache-Control"], "no-store", path)

    def test_missing_frontend_build_has_actionable_error(self):
        app = self.apps[0]
        app.extensions["settings"] = Settings(root=Path(self.temporary.name))
        response = app.test_client().get("/", base_url=BASE)
        self.assertEqual(response.status_code, 503)
        self.assertIn("npm run build", response.json["error"])

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
