"""Recognize missing lyric ranges again without moving existing timestamps."""

import copy
import json
import wave
from pathlib import Path

from .alignment import align_lines
from .recognition import prepare_wav, recognize
from .subtitles import export


def missing_ranges(rows):
    first = None
    for index, row in enumerate(rows):
        if row["start"] is None:
            if first is None:
                first = index
        elif first is not None:
            yield first, index
            first = None
    if first is not None:
        yield first, len(rows)


def restore_offsets(transcription, offset):
    for segment in transcription:
        for item in [segment] + segment.get("tokens", []):
            if "offsets" in item:
                item["offsets"] = {
                    key: value + offset if value >= 0 else value
                    for key, value in item["offsets"].items()
                }


def repair_missing(rows, wav_path, directory, duration, threads=4, progress=None):
    repaired = copy.deepcopy(rows)
    ranges = list(missing_ranges(rows))
    for attempt, (first, stop) in enumerate(ranges, 1):
        before = rows[first - 1] if first else None
        after = rows[stop] if stop < len(rows) else None
        lower = before["end"] if before else 0
        upper = after["start"] if after else duration
        if upper <= lower:
            continue
        # Use a tighter crop than the initial automatic retry, with context at both ends.
        start, end = max(0, lower - 2), min(duration, upper + 2)
        name = directory / f"gap-{first + 1}-{stop}"
        clip = name.with_suffix(".wav")
        with wave.open(str(wav_path), "rb") as source, wave.open(str(clip), "wb") as target:
            rate = source.getframerate()
            start_frame = round(start * rate)
            target.setparams(source.getparams())
            source.setpos(start_frame)
            target.writeframes(source.readframes(round(end * rate) - start_frame))

        def on_progress(percent):
            if progress:
                progress(
                    "retrying",
                    percent,
                    current=attempt,
                    total=len(ranges),
                    line=first + 1,
                    end_line=stop,
                )

        # Always run the decoder: a manual retry must not just return the old transcript.
        raw = recognize(clip, name, threads, beam=5, progress=on_progress)
        restore_offsets(raw["transcription"], round(start_frame / rate * 1000))
        left, right = max(0, first - 1), min(len(rows), stop + 1)
        candidates = align_lines(
            [row["text"] for row in rows[left:right]], raw["transcription"], duration
        )
        previous_end = lower
        for index in range(first, stop):
            candidate = candidates[index - left]
            if candidate["start"] is None:
                continue
            if candidate["start"] < previous_end - 0.5 or candidate["end"] > upper + 0.5:
                continue
            candidate["start"] = max(previous_end, candidate["start"])
            candidate["end"] = min(upper, candidate["end"])
            if candidate["end"] <= candidate["start"]:
                continue
            candidate.update(line=index + 1, status="review")
            candidate["notes"].append("由手動觸發的補辨識找回，請試聽確認時間")
            repaired[index] = candidate
            previous_end = candidate["end"]
    return repaired


def repair_song(audio, previous, output, threads=4, progress=None):
    audio, previous, output = Path(audio), Path(previous), Path(output)
    rows = json.loads(previous.read_text(encoding="utf-8"))["lines"]
    if progress:
        progress("preparing")
    directory = output.parent / "retry"
    directory.mkdir(parents=True, exist_ok=True)
    wav_path = directory / "audio.wav"
    prepare_wav(audio, wav_path)
    with wave.open(str(wav_path)) as source:
        duration = source.getnframes() / source.getframerate()
    rows = repair_missing(rows, wav_path, directory, duration, threads, progress)
    if progress:
        progress("exporting")
    export(rows, output, audio.resolve(), duration)
    return rows
