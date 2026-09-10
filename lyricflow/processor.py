"""Convert audio and invoke the CLI without depending on Flask."""

import json
import logging
import sys
import wave
from pathlib import Path

from imageio_ffmpeg import get_ffmpeg_exe

from .config import MAX_AUDIO_SECONDS
from .errors import ProcessingError
from .progress import PROGRESS_PREFIX, progress_message

logger = logging.getLogger(__name__)


class AlignmentProcessor:
    def __init__(self, settings, store, runner):
        self.settings = settings
        self.store = store
        self.runner = runner

    @staticmethod
    def _is_pcm(source):
        try:
            with wave.open(str(source)) as audio:
                return audio.getcomptype() == "NONE" and audio.getnchannels() in (1, 2)
        except (wave.Error, EOFError):
            return False

    def _prepare_audio(self, job):
        folder = self.store.folder(job["id"])
        source = folder / ("source" + Path(job["name"]).suffix.lower())
        if self._is_pcm(source):
            return source
        prepared = folder / "prepared.wav"
        args = [
            get_ffmpeg_exe(),
            "-nostdin",
            "-v",
            "error",
            "-y",
            "-protocol_whitelist",
            "file,pipe",
            "-i",
            str(source),
            "-map",
            "0:a:0",
            "-vn",
            "-ac",
            "1",
            "-ar",
            "16000",
            "-c:a",
            "pcm_s16le",
            str(prepared),
        ]
        return prepared if self.runner.run(job["id"], args) else None

    def _record_progress(self, job_id, line):
        if line.startswith(PROGRESS_PREFIX):
            event = json.loads(line[len(PROGRESS_PREFIX) :])
            self.store.update(job_id, progress=event, message=progress_message(event))

    def process(self, job_id):
        try:
            if self.store.is_terminal(job_id):
                return
            job = self.store.get(job_id)
            prepared = self._prepare_audio(job)
            if prepared is None:
                return
            with wave.open(str(prepared)) as audio:
                duration = audio.getnframes() / audio.getframerate()
            if not 0 < duration <= MAX_AUDIO_SECONDS:
                raise ProcessingError("請選擇長度在 30 分鐘內、可正常播放的歌曲。")
            if not self.store.update(
                job_id, status="processing", duration=duration, message="正在辨識歌曲並對齊歌詞…"
            ):
                return
            folder = self.store.folder(job_id)
            output = folder / "output"
            args = [
                sys.executable,
                "-u",
                str(self.settings.root / "lyric_flow.py"),
                str(prepared),
                str(folder / "lyrics.txt"),
                "--output",
                str(output),
                "--threads",
                str(job["threads"]),
                "--progress-json",
            ]
            if job.get("operation") == "retry":
                args += ["--retry-from", str(folder / "retry-input.json")]
            if not self.runner.run(job_id, args, lambda line: self._record_progress(job_id, line)):
                return
            data = json.loads(next(output.glob("*.alignment.json")).read_text(encoding="utf-8"))
            self.store.update(
                job_id,
                status="done",
                message="對齊完成",
                progress={"stage": "done", "percent": 100},
                result={
                    "lines": data["lines"],
                    "duration": duration,
                    "review_count": sum(row["status"] == "review" for row in data["lines"]),
                    "unmatched_count": sum(row["start"] is None for row in data["lines"]),
                },
            )
        except Exception as error:
            logger.exception("Alignment job %s failed", job_id)
            message = (
                str(error)
                if isinstance(error, ProcessingError)
                else "處理未完成。請重新嘗試，詳細紀錄保留在本機。"
            )
            self.store.update(job_id, status="error", message=message)
