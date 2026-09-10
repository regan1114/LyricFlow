"""State, persistence and concurrency invariants independent of HTTP."""

import io
import sys
import tempfile
import threading
import unittest
from pathlib import Path

from lyricflow.errors import JobBusyError, JobConflictError, ValidationError
from lyricflow.job_store import JobStore
from lyricflow.process_runner import ProcessRunner
from lyricflow.service import AlignmentService
from lyricflow.validation import parse_job_input


def job_input():
    return parse_job_input({"name": "song.wav", "size": 20, "lyrics": "春風吹過山河"})


class JobStoreTests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory()
        self.store = JobStore(Path(self.temporary.name))

    def tearDown(self):
        self.store.close()
        self.temporary.cleanup()

    def test_concurrent_submissions_reserve_only_one_slot(self):
        barrier = threading.Barrier(2)
        accepted, rejected = [], []

        def submit():
            barrier.wait()
            try:
                accepted.append(self.store.create(job_input()))
            except JobBusyError as error:
                rejected.append(error.job_id)

        workers = [threading.Thread(target=submit) for _ in range(2)]
        for worker in workers:
            worker.start()
        for worker in workers:
            worker.join(timeout=3)
        self.assertEqual(len(accepted), 1)
        self.assertEqual(rejected, [accepted[0]["id"]])

    def test_cancelled_job_cannot_be_revived_by_late_progress(self):
        job = self.store.create(job_input())
        self.store.update(job["id"], status="cancelled")
        before = self.store.get(job["id"])
        self.assertFalse(self.store.update(job["id"], status="done", progress={"percent": 100}))
        self.assertEqual(self.store.get(job["id"]), before)

    def test_saved_result_survives_restart_and_snapshot_edits(self):
        job = self.store.create(job_input())
        self.store.update(job["id"], status="done", result={"lines": [{"text": "原歌詞"}]})
        snapshot = self.store.get(job["id"])
        snapshot["result"]["lines"][0]["text"] = "外部修改"
        restored = JobStore(self.store.directory).get(job["id"])
        self.assertEqual(restored["result"]["lines"][0]["text"], "原歌詞")
        self.assertEqual(restored["srt_url"], f"/api/jobs/{job['id']}/srt")

    def test_interrupted_upload_is_not_restored_as_running(self):
        job = self.store.create(job_input())
        restored = JobStore(self.store.directory).get(job["id"])
        self.assertEqual(restored["status"], "error")
        self.assertIsNone(restored["srt_url"])

    def test_second_upload_cannot_write_the_same_audio(self):
        job = self.store.create(job_input())
        self.store.claim_upload(job["id"], 20)
        with self.assertRaises(JobConflictError):
            self.store.claim_upload(job["id"], 20)

    def test_incomplete_upload_releases_slot_and_removes_partial_file(self):
        class UnusedProcessor:
            def process(self, job_id):
                raise AssertionError("An incomplete upload must not start recognition")

        service = AlignmentService(self.store, ProcessRunner(self.store), UnusedProcessor())
        job = service.create(job_input())
        try:
            with self.assertRaises(ValidationError):
                service.upload(job["id"], io.BytesIO(b"short"), 20)
            self.assertEqual(service.get(job["id"])["status"], "cancelled")
            self.assertFalse(list(self.store.folder(job["id"]).glob("*.partial")))
            self.assertNotEqual(service.create(job_input())["id"], job["id"])
        finally:
            service.close()

    def test_shutdown_wakes_a_synchronous_waiter(self):
        job = self.store.create(job_input())
        results = []
        waiter = threading.Thread(target=lambda: results.append(self.store.wait(job["id"])))
        waiter.start()
        self.store.close()
        waiter.join(timeout=2)
        self.assertFalse(waiter.is_alive())
        self.assertEqual(results[0]["status"], "cancelled")

    def test_cancel_stops_the_process_group_including_its_child(self):
        job = self.store.create(job_input())
        runner = ProcessRunner(self.store)
        started, results = threading.Event(), []
        script = (
            "import subprocess, sys, time; "
            'subprocess.Popen([sys.executable, "-c", "import time; time.sleep(30)"]); '
            'print("ready", flush=True); time.sleep(30)'
        )
        worker = threading.Thread(
            target=lambda: results.append(
                runner.run(
                    job["id"], [sys.executable, "-u", "-c", script], lambda line: started.set()
                )
            )
        )
        worker.start()
        try:
            self.assertTrue(started.wait(timeout=5))
            self.store.update(job["id"], status="cancelled")
            runner.cancel(job["id"])
            worker.join(timeout=3)
            # The child inherits stdout. A leaked child would keep the reader blocked.
            self.assertFalse(worker.is_alive())
            self.assertEqual(results, [False])
        finally:
            runner.close()
            worker.join(timeout=3)
