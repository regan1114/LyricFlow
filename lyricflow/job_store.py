"""Persist job state and serialize transitions shared by HTTP and workers."""

import copy
import json
import re
import threading
import time
import uuid
from dataclasses import asdict
from pathlib import Path

from .config import TERMINAL_STATUSES
from .errors import JobBusyError, JobConflictError, JobNotFoundError, ServiceClosedError
from .validation import JobInput


class JobStore:
    def __init__(self, directory: Path):
        self.directory = directory
        self._jobs = {}
        self._uploads = set()
        self._changed = threading.Condition(threading.RLock())
        self._closed = False

    def folder(self, job_id):
        if not re.fullmatch(r"[a-f0-9]{32}", job_id):
            raise JobNotFoundError("找不到這個工作。")
        return self.directory / job_id

    def _load(self, job_id):
        """Caller holds the condition lock; old status.json files remain readable."""
        if job_id not in self._jobs:
            saved = self.folder(job_id) / "status.json"
            if not saved.is_file():
                raise JobNotFoundError("找不到這個工作。")
            job = json.loads(saved.read_text(encoding="utf-8"))
            if job["status"] not in TERMINAL_STATUSES:
                job.update(
                    status="error",
                    finished=time.time(),
                    message="上次處理因程式關閉而中斷，請重新開始。",
                )
                self._save(job)
            self._jobs[job_id] = job
        return self._jobs[job_id]

    def _save(self, job):
        temporary = self.folder(job["id"]) / "status.tmp"
        temporary.write_text(json.dumps(job, ensure_ascii=False), encoding="utf-8")
        temporary.replace(temporary.with_name("status.json"))

    @staticmethod
    def _snapshot(job):
        public = copy.deepcopy({key: value for key, value in job.items() if key != "size"})
        public.update(
            elapsed=round((job.get("finished") or time.time()) - job["created"], 1),
            status_url=f"/api/jobs/{job['id']}",
            srt_url=f"/api/jobs/{job['id']}/srt" if job["status"] == "done" else None,
        )
        return public

    def create(self, data: JobInput):
        with self._changed:
            if self._closed:
                raise ServiceClosedError("本機服務正在關閉，請重新啟動後再試。")
            for job in self._jobs.values():
                if job["status"] not in TERMINAL_STATUSES:
                    raise JobBusyError(job["id"])
            job_id = uuid.uuid4().hex
            folder = self.folder(job_id)
            folder.mkdir(parents=True, mode=0o700)
            (folder / "lyrics.txt").write_text(data.lyrics, encoding="utf-8")
            job = dict(
                asdict(data),
                id=job_id,
                created=time.time(),
                status="uploading",
                message="正在匯入歌曲…",
                progress={"stage": "uploading", "percent": 0},
            )
            self._save(job)
            self._jobs[job_id] = job
            return self._snapshot(job)

    def get(self, job_id):
        with self._changed:
            return self._snapshot(self._load(job_id))

    def update(self, job_id, **values):
        with self._changed:
            job = self._load(job_id)
            if job["status"] in TERMINAL_STATUSES:
                return False
            updated = dict(job, **values)
            if updated["status"] in TERMINAL_STATUSES:
                updated["finished"] = time.time()
            self._save(updated)
            self._jobs[job_id] = updated
            self._changed.notify_all()
            return True

    def claim_upload(self, job_id, size):
        with self._changed:
            job = self._load(job_id)
            if job["status"] != "uploading" or size != job.get("size") or job_id in self._uploads:
                raise JobConflictError("匯入已開始或結束，或檔案大小不符。")
            self._uploads.add(job_id)

    def release_upload(self, job_id):
        with self._changed:
            self._uploads.discard(job_id)

    def is_terminal(self, job_id):
        with self._changed:
            return self._load(job_id)["status"] in TERMINAL_STATUSES

    def wait(self, job_id):
        with self._changed:
            self._changed.wait_for(lambda: self._load(job_id)["status"] in TERMINAL_STATUSES)
            return self._snapshot(self._load(job_id))

    def close(self):
        with self._changed:
            self._closed = True
            for job_id in list(self._jobs):
                self.update(job_id, status="cancelled", message="本機服務已關閉，處理已停止。")
