"""Exercise real subprocesses, including the Windows job on native Windows CI."""

import json
import subprocess
import sys
import tempfile
import threading
import unittest
from pathlib import Path

from lyricflow.job_store import JobStore
from lyricflow.process_runner import ProcessRunner
from lyricflow.validation import parse_job_input

ROOT = Path(__file__).resolve().parent.parent


class RuntimeTests(unittest.TestCase):
    def test_bootstrap_does_not_execute_before_assignment_gate(self):
        with tempfile.TemporaryDirectory() as directory:
            marker = Path(directory) / "started"
            result = subprocess.run(
                [
                    sys.executable,
                    str(ROOT / "lyricflow/worker_bootstrap.py"),
                    sys.executable,
                    "-c",
                    "from pathlib import Path; import sys; Path(sys.argv[1]).touch()",
                    str(marker),
                ],
                input=b"",
                capture_output=True,
                timeout=10,
            )
            self.assertNotEqual(result.returncode, 0)
            self.assertFalse(marker.exists())

    def test_unicode_arguments_and_logs_survive_worker_roundtrip(self):
        with tempfile.TemporaryDirectory(prefix="lyric 中文 space ") as directory:
            store = JobStore(Path(directory))
            job = store.create(
                parse_job_input({"name": "九月 九.wav", "size": 20, "lyrics": "海會回答嗎"})
            )
            runner, lines = ProcessRunner(store), []
            try:
                self.assertTrue(
                    runner.run(
                        job["id"],
                        [sys.executable, "-c", "import sys; print(sys.argv[1])", "海會回答嗎 🎵"],
                        lines.append,
                    )
                )
                self.assertEqual("".join(lines).strip(), "海會回答嗎 🎵")
            finally:
                runner.close()
                store.close()

    def test_cancel_reaps_descendant_after_immediate_parent_exits(self):
        with tempfile.TemporaryDirectory() as directory:
            store = JobStore(Path(directory))
            job = store.create(parse_job_input({"name": "song.wav", "size": 20, "lyrics": "歌詞"}))
            runner = ProcessRunner(store)
            started, exited = threading.Event(), threading.Event()
            results = []
            child = "import time; print('ready', flush=True); time.sleep(30)"
            parent = f"import subprocess, sys; subprocess.Popen([sys.executable, '-u', '-c', {json.dumps(child)}])"

            def execute():
                try:
                    results.append(
                        runner.run(
                            job["id"],
                            [sys.executable, "-u", "-c", parent],
                            lambda line: started.set(),
                        )
                    )
                finally:
                    exited.set()

            worker = threading.Thread(target=execute)
            worker.start()
            try:
                self.assertTrue(started.wait(5))
                # Wait for the immediate parent (bootstrap on Windows) to exit;
                # the grandchild still holds stdout open and belongs to the job/group.
                with runner._lock:
                    process = runner._processes[job["id"]]
                process.wait(timeout=5)
                store.update(job["id"], status="cancelled")
                runner.cancel(job["id"])
                self.assertTrue(exited.wait(5), "A leaked descendant is holding stdout open")
                self.assertEqual(results, [False])
            finally:
                runner.close()
                store.close()
                worker.join(timeout=5)
