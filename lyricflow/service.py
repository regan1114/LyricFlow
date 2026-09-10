"""Application operations shared by every HTTP upload route."""

import json
import os
import shutil
import threading
from pathlib import Path

from .config import COPY_CHUNK_BYTES
from .errors import JobConflictError, JobNotFoundError, ValidationError
from .progress import STAGE_MESSAGES
from .validation import parse_job_input, retry_rows


class AlignmentService:
    def __init__(self, store, runner, processor):
        self.store = store
        self.runner = runner
        self.processor = processor
        self._workers = set()
        self._lifecycle = threading.Lock()
        self._closed = False

    def create(self, data):
        return self.store.create(data)

    def get(self, job_id):
        return self.store.get(job_id)

    def wait(self, job_id):
        return self.store.wait(job_id)

    def upload(self, job_id, stream, size):
        self.store.claim_upload(job_id, size)
        job = self.get(job_id)
        target = self.store.folder(job_id) / ("source" + Path(job["name"]).suffix.lower())
        temporary = target.with_suffix(target.suffix + ".partial")
        try:
            with temporary.open("wb") as output:
                remaining = size
                while remaining:
                    if self.store.is_terminal(job_id):
                        raise JobConflictError("工作已停止。")
                    chunk = stream.read(min(COPY_CHUNK_BYTES, remaining))
                    if not chunk:
                        raise ValidationError("歌曲匯入中斷，請重試。")
                    output.write(chunk)
                    remaining -= len(chunk)
            temporary.replace(target)
            self._start(job_id)
        except Exception:
            self.cancel(job_id)
            raise
        finally:
            self.store.release_upload(job_id)
            temporary.unlink(missing_ok=True)
        return self.get(job_id)

    def submit(self, data, stream):
        job = self.create(data)
        return self.upload(job["id"], stream, data.size)

    def retry(self, job_id, data):
        original = self.get(job_id)
        if original["status"] != "done":
            raise JobConflictError("請等待歌曲處理完成後再補辨識。")
        rows = retry_rows(data, original["result"]["lines"], original["result"]["duration"])
        source, _ = self.resource(job_id, "audio")
        job = self.create(
            parse_job_input(
                {
                    "name": original["name"],
                    "size": source.stat().st_size,
                    "lyrics": original["lyrics"],
                    "threads": original["threads"],
                }
            )
        )
        folder = self.store.folder(job["id"])
        try:
            target = folder / ("source" + source.suffix)
            # Uploaded sources are immutable; a hard link avoids another full song copy.
            try:
                os.link(source, target)
            except OSError:
                shutil.copyfile(source, target)
            (folder / "retry-input.json").write_text(
                json.dumps({"lines": rows}, ensure_ascii=False), encoding="utf-8"
            )
            self.store.update(
                job["id"],
                operation="retry",
                retry_of=job_id,
                retry_missing_count=sum(row["start"] is None for row in rows),
            )
            self._start(job["id"])
        except Exception:
            self.cancel(job["id"])
            raise
        return self.get(job["id"])

    def _start(self, job_id):
        with self._lifecycle:
            if self._closed:
                self.cancel(job_id)
                return
            if not self.store.update(
                job_id,
                status="preparing",
                message=STAGE_MESSAGES["preparing"],
                progress={"stage": "preparing", "percent": None},
            ):
                return
            worker = threading.Thread(target=self._process, args=(job_id,), daemon=True)
            self._workers.add(worker)
            worker.start()

    def _process(self, job_id):
        try:
            self.processor.process(job_id)
        finally:
            with self._lifecycle:
                self._workers.discard(threading.current_thread())

    def cancel(self, job_id):
        self.store.update(job_id, status="cancelled", message="已停止處理，可以重新選擇歌曲。")
        self.runner.cancel(job_id)
        return self.get(job_id)

    def resource(self, job_id, kind):
        job = self.get(job_id)
        folder = self.store.folder(job_id)
        if kind == "audio" and job["status"] != "uploading":
            path = folder / ("source" + Path(job["name"]).suffix.lower())
        elif kind in ("srt", "report") and job["status"] == "done":
            extension = ".draft.srt" if kind == "srt" else ".review.txt"
            path = next((folder / "output").glob("*" + extension), None)
        else:
            path = None
        if path is None or not path.is_file():
            raise JobNotFoundError("找不到這個檔案或工作。")
        return path, job

    def close(self):
        with self._lifecycle:
            if self._closed:
                return
            self._closed = True
            workers = list(self._workers)
            self.store.close()
        self.runner.close()
        for worker in workers:
            worker.join(timeout=5)
