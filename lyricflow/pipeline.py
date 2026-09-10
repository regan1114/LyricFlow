"""Coordinate recognition, lyric matching, bounded retries and export."""

import json
import wave
from pathlib import Path

from .alignment import align_lines
from .config import PROJECT_ROOT
from .lyrics import read_lyrics
from .recognition import recognize, transcribe
from .subtitles import export

ROOT = PROJECT_ROOT


def align_song(audio, lyrics, output, threads=4, transcript=None, retry=True, progress=None):
    """Run one alignment through the same workflow used by the API worker."""
    audio, lyrics, output = Path(audio), Path(lyrics), Path(output)
    lines = read_lyrics(lyrics)
    if progress:
        progress("preparing")
    with wave.open(str(audio)) as wav:
        duration = wav.getnframes() / wav.getframerate()
    wav_path = cache = None
    if transcript:
        raw = json.loads(Path(transcript).read_text(encoding="utf-8"))
    else:
        raw, wav_path, cache = transcribe(audio, threads, progress)
    if progress:
        progress("aligning")
    rows = align_lines(lines, raw["transcription"], duration)
    if wav_path and retry:
        rows = retry_unmatched(lines, rows, wav_path, cache, duration, threads, progress)
    if progress:
        progress("exporting")
    export(rows, output, audio.resolve(), duration)
    return rows


def retry_unmatched(lines, rows, wav_path, cache, duration, threads, progress=None):
    """Retry at most three missed lines with shorter unprompted audio windows."""
    indices = [i for i, row in enumerate(rows) if row["start"] is None][:3]
    for attempt, i in enumerate(indices, 1):
        before = next((r for r in reversed(rows[:i]) if r["start"] is not None), None)
        after = next((r for r in rows[i + 1 :] if r["start"] is not None), None)
        if before is None and after is None:
            continue
        start = max(0, before["start"] - 4 if before else after["start"] - 15)
        end = min(duration, after["end"] + 4 if after else before["end"] + 15)
        if end - start > 45:
            continue

        def on_progress(percent):
            progress("retrying", percent, current=attempt, total=len(indices), line=i + 1)

        if progress:
            on_progress(0)
        name = cache / f"retry-{round(start * 1000)}-{round(end * 1000)}-beam5"
        raw_path = name.with_suffix(".json")
        if raw_path.exists():
            raw = json.loads(raw_path.read_text(encoding="utf-8"))
            if progress:
                on_progress(100)
        else:
            print(f"局部重試第 {i + 1} 行：{start:.1f}–{end:.1f} 秒。", flush=True)
            clip = name.with_suffix(".wav")
            with wave.open(str(wav_path), "rb") as src, wave.open(str(clip), "wb") as dst:
                dst.setparams(src.getparams())
                src.setpos(round(start * src.getframerate()))
                dst.writeframes(src.readframes(round((end - start) * src.getframerate())))
            raw = recognize(clip, name, threads, beam=5, progress=on_progress if progress else None)
        for segment in raw["transcription"]:
            for item in [segment] + segment.get("tokens", []):
                if "offsets" in item:
                    item["offsets"] = {
                        k: v + round(start * 1000) for k, v in item["offsets"].items()
                    }
        left, right = max(0, i - 1), min(len(lines), i + 2)
        candidate = align_lines(lines[left:right], raw["transcription"], duration)[i - left]
        if candidate["start"] is None:
            continue
        lower, upper = (before["end"] if before else 0), (after["start"] if after else duration)
        # Small overlap between independent decoding windows is marked and clipped.
        # Larger disagreements remain unmatched instead of guessing a time.
        if candidate["start"] < lower - 0.5 or candidate["end"] > upper + 0.5:
            continue
        candidate["start"] = max(lower, candidate["start"])
        candidate["end"] = min(upper, candidate["end"])
        if candidate["end"] <= candidate["start"]:
            continue
        candidate["line"] = i + 1
        candidate["status"] = "review"
        candidate["notes"].append("局部重辨識補回；邊界限制在前後句之間，請試聽")
        candidate["retry_source"] = str(raw_path.relative_to(ROOT))
        rows[i] = candidate
    return rows
