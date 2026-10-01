"""Known lyrics only: decode, optional separation, acoustic alignment, export."""

import hashlib
import json
import subprocess
import wave
from pathlib import Path

from imageio_ffmpeg import get_ffmpeg_exe

from ..config import PROJECT_ROOT
from .attention import WhisperLyricsAligner
from .contract import TimelineError, export_project, validate_project
from .normalization import lyric_units
from .runtime import ALIGNMENT_REVISION, ENGINE_VERSION
from .separation import DemucsSeparator, OriginalAudio


def decode(source, target):
    try:
        subprocess.run(
            [
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
                str(target),
            ],
            check=True,
        )
    except (OSError, RuntimeError, subprocess.CalledProcessError) as error:
        raise TimelineError(
            "AUDIO_DECODE_FAILED",
            "音訊轉換失敗。",
            str(error),
            "確認 FFmpeg 已安裝，並使用可正常播放的 WAV、MP3 或 M4A。",
        ) from error


def align_known(
    audio,
    lyrics,
    output,
    preserve_lines=True,
    separation="original",
    progress=lambda *args: None,
    engine=None,
    cache_root=None,
):
    progress("preparing", 0.02)
    lines = lyric_units(lyrics, preserve_lines)
    digest = hashlib.sha256()
    with Path(audio).open("rb") as source:
        for chunk in iter(lambda: source.read(1024 * 1024), b""):
            digest.update(chunk)
    provider = DemucsSeparator() if separation == "demucs" else OriginalAudio()
    audio_hash = digest.hexdigest()
    settings = {
        "audio": audio_hash,
        "lyrics": lyrics,
        "engine": ENGINE_VERSION,
        "model": ALIGNMENT_REVISION,
        "preserve_lines": preserve_lines,
        "separation": provider.identity,
    }
    key = hashlib.sha256(
        json.dumps(settings, ensure_ascii=False, sort_keys=True).encode()
    ).hexdigest()
    root = cache_root or PROJECT_ROOT / ".cache/lyrics-engine"
    cache = root / key
    cache.mkdir(parents=True, exist_ok=True, mode=0o700)
    result_path = cache / "lyrics.json"
    if result_path.exists():
        try:
            result = validate_project(json.loads(result_path.read_text(encoding="utf-8")))
        except (ValueError, TimelineError):
            result_path.unlink()
        else:
            progress("timeline_cached", 0.95)
            export_project(result, output)
            return result
    prepared = cache / "audio.wav"
    decode(audio, prepared)
    with wave.open(str(prepared)) as wav:
        duration = wav.getnframes() / wav.getframerate()
    if not 0 < duration <= 600:
        raise TimelineError(
            "ALIGNMENT_LIMIT",
            "精準對齊目前支援 10 分鐘以內的音訊。",
            suggestion="請以歌曲段落分開對齊。",
        )
    progress("separating_vocals" if separation == "demucs" else "original_audio", 0.1)
    separation_cache = root / (audio_hash + "-" + provider.identity)
    # Stable basename makes the separation cache reusable when lyrics change.
    separation_cache.mkdir(parents=True, exist_ok=True, mode=0o700)
    stable_audio = separation_cache / ("source" + Path(audio).suffix.lower())
    if separation == "demucs" and not stable_audio.exists():
        import shutil

        shutil.copyfile(audio, stable_audio)
    vocal = provider.separate(
        stable_audio if separation == "demucs" else prepared, separation_cache
    )
    if vocal != prepared:
        decode(vocal, prepared)
        with wave.open(str(prepared)) as wav:
            separated_duration = wav.getnframes() / wav.getframerate()
        if abs(separated_duration - duration) > 0.05:
            raise TimelineError(
                "VOCAL_DURATION_MISMATCH", "分離音訊的長度與原曲不一致，無法安全套用時間。"
            )
    result = (engine or WhisperLyricsAligner(separated=separation == "demucs")).align(
        prepared, lines, progress
    )
    # The source duration is authoritative even if a separator added a few samples.
    result["duration"] = duration
    validate_project(result)
    progress("exporting", 0.95)
    export_project(result, output)
    temporary = result_path.with_suffix(".partial")
    temporary.write_text(json.dumps(result, ensure_ascii=False), encoding="utf-8")
    temporary.replace(result_path)
    return result
