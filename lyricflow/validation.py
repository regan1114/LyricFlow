"""Validate job input once for both multipart and two-step uploads."""

import copy
import math
import re
from dataclasses import dataclass
from pathlib import Path

from .config import AUDIO_EXTENSIONS, MAX_AUDIO_BYTES, MAX_LYRICS_CHARACTERS
from .errors import ValidationError


@dataclass(frozen=True)
class JobInput:
    name: str
    size: int
    lyrics: str
    threads: int


def integer(value, field):
    if isinstance(value, bool) or not isinstance(value, (int, str)):
        raise ValidationError(f"{field} 必須是整數。")
    try:
        return int(value)
    except ValueError as error:
        raise ValidationError(f"{field} 必須是整數。") from error


def parse_job_input(data) -> JobInput:
    if not isinstance(data, dict):
        raise ValidationError("無效的工作資料。")
    name = data.get("name", "")
    if not isinstance(name, str):
        raise ValidationError("請提供音檔名稱。")
    name = Path(name.replace("\\", "/")).name
    if len(name) > 255 or any(ord(char) < 32 or ord(char) == 127 for char in name):
        raise ValidationError("音檔名稱過長或包含控制字元。")
    if Path(name).suffix.lower() not in AUDIO_EXTENSIONS:
        raise ValidationError("請選擇 WAV、MP3、M4A、AAC、FLAC 或 AIFF 音訊。")
    size = integer(data.get("size", 0), "size")
    if not 0 < size <= MAX_AUDIO_BYTES:
        raise ValidationError("音檔大小必須介於 1 位元組與 200 MB 之間。")
    lyrics = data.get("lyrics", "")
    if not isinstance(lyrics, str) or not re.sub(r"\[[^\]]*\]|\s|\ufeff", "", lyrics):
        raise ValidationError("請提供實際演唱的歌詞文字。")
    lyrics = lyrics.lstrip("\ufeff").strip()
    if len(lyrics) > MAX_LYRICS_CHARACTERS:
        raise ValidationError("歌詞限 12,000 字以內。")
    threads = integer(data.get("threads", 4), "threads")
    if threads not in (2, 4):
        raise ValidationError("threads 必須為 2 或 4。")
    return JobInput(name, size, lyrics, threads)


def retry_rows(data, original, duration):
    """Accept only ordered timing edits; lyric text always comes from the saved job."""
    if not isinstance(data, dict) or set(data) - {"timings"}:
        raise ValidationError("補辨識只接受 timings 時間欄位。")
    timings = data.get("timings", [{"start": row["start"], "end": row["end"]} for row in original])
    if not isinstance(timings, list) or len(timings) != len(original):
        raise ValidationError("時間資料須與原歌詞句數一致。")
    rows = copy.deepcopy(original)
    previous_end = 0
    for index, (row, timing) in enumerate(zip(rows, timings), 1):
        if not isinstance(timing, dict) or set(timing) != {"start", "end"}:
            raise ValidationError(f"第 {index} 句須提供開始與結束時間。")
        start, end = timing["start"], timing["end"]
        if start is None and end is None:
            row.update(start=None, end=None, status="unmatched")
            continue
        if any(
            isinstance(value, bool)
            or not isinstance(value, (int, float))
            or not math.isfinite(value)
            for value in (start, end)
        ):
            raise ValidationError(f"第 {index} 句請填入完整有效的時間，或同時清空起訖時間。")
        if not previous_end <= start < end <= duration:
            raise ValidationError(f"第 {index} 句時間倒置、重疊或超過歌曲長度，請先修正。")
        if (start, end) != (row["start"], row["end"]):
            row.update(start=start, end=end, edited=True, status="review")
            row["notes"].append("保留使用者手動設定的時間")
        previous_end = end
    if not any(row["start"] is None for row in rows):
        raise ValidationError("沒有未定位的歌詞可補辨識。")
    return rows
