"""Validate and export the public contract without AI/runtime dependencies."""

import json
import math

from ..subtitles import srt_timestamp

VERSION = "1.0.0"
MODES = {"known_lyrics", "auto_recognition", "hybrid", "import"}


class TimelineError(Exception):
    def __init__(self, code, message, details="", suggestion="請檢查音訊與歌詞後重試。"):
        super().__init__(message)
        self.data = dict(code=code, message=message, details=details, suggestion=suggestion)


def validate_project(project):
    def finite(value):
        return (
            isinstance(value, (int, float)) and not isinstance(value, bool) and math.isfinite(value)
        )

    def fail():
        raise TimelineError("INVALID_TIMELINE", "字幕時間軸格式無效。")

    if not isinstance(project, dict) or project.get("version") != VERSION:
        fail()
    duration = project.get("duration")
    if (
        not finite(duration)
        or duration < 0
        or not isinstance(project.get("mode"), str)
        or project.get("mode") not in MODES
    ):
        fail()
    if not isinstance(project.get("segments"), list):
        fail()
    ids = set()
    previous = 0
    for segment in project["segments"]:
        if not isinstance(segment, dict):
            fail()
        identity = segment.get("id")
        if type(identity) is not int or identity < 1 or identity in ids:
            fail()
        ids.add(identity)
        start, end = segment.get("start"), segment.get("end")
        if not finite(start) or not finite(end) or not 0 <= start < end <= duration:
            fail()
        if start < previous:
            fail()
        previous = start
        if not isinstance(segment.get("text"), str):
            fail()
        if "words" in segment and (not isinstance(segment["words"], list) or not segment["words"]):
            fail()
        for item in [segment, *segment.get("words", [])]:
            if not isinstance(item, dict):
                fail()
            if "confidence" in item and (
                not finite(item["confidence"]) or not 0 <= item["confidence"] <= 1
            ):
                fail()
        if "words" in segment:
            words = segment["words"]
            if not isinstance(words, list) or not words:
                fail()
            last = start
            for word in words:
                if not isinstance(word, dict) or not isinstance(word.get("text"), str):
                    fail()
                a, b = word.get("start"), word.get("end")
                if not finite(a) or not finite(b) or not last <= a < b <= end or not word["text"]:
                    fail()
                last = b
            if "".join(word["text"] for word in words) != segment["text"]:
                fail()
    return project


def to_srt(project):
    validate_project(project)
    blocks = []
    for index, segment in enumerate(project["segments"], 1):
        start, end = srt_timestamp(segment["start"]), srt_timestamp(segment["end"])
        if start == end:
            raise TimelineError("INVALID_TIMELINE", "字幕短於 SRT 毫秒精度，請調整起訖時間。")
        blocks.append(f"{index}\n{start} --> {end}\n{segment['text']}\n")
    return "\n".join(blocks)


def export_project(project, output):
    validate_project(project)
    srt = to_srt(project)
    output.mkdir(parents=True, exist_ok=True)
    (output / "lyrics.json").write_text(
        json.dumps(project, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    (output / "lyrics.srt").write_text(srt, encoding="utf-8")
