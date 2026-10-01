"""Compact quiet gaps in a separated vocal stem, retaining exact source offsets.

This is an amplitude gate on separated vocals, not a singing/speech classifier.
Never apply it to a music mix, where instrument energy would be mistaken for vocals.
"""

from .contract import TimelineError


def compact_vocals(samples, sample_rate=16000):
    import numpy as np

    frame = sample_rate // 10
    padded = np.pad(samples, (0, (-len(samples)) % frame))
    rms = np.sqrt(np.mean(padded.reshape(-1, frame) ** 2, axis=1))
    threshold = max(0.0001, float(np.quantile(rms, 0.99)) * 0.02)
    active = np.flatnonzero(rms >= threshold)
    groups = np.split(active, np.flatnonzero(np.diff(active) > 20) + 1)
    parts, mapping, cursor = [], [], 0
    for group in groups:
        if len(group) < 3:
            continue
        start = max(0, int(group[0] * frame - sample_rate // 2))
        end = min(len(samples), int((group[-1] + 1) * frame + sample_rate // 2))
        parts.append(samples[start:end])
        mapping.append(
            (cursor / sample_rate, (cursor + end - start) / sample_rate, start / sample_rate)
        )
        cursor += end - start
    if not parts:
        raise TimelineError(
            "NO_VOCALS",
            "分離音訊中未找到足夠的人聲訊號。",
            suggestion="請確認歌曲版本，或改用原音對齊。",
        )
    return np.concatenate(parts), mapping


def source_time(timestamp, mapping, *, end=False):
    matches = [span for span in mapping if span[0] <= timestamp <= span[1] + 1e-6]
    if not matches:
        raise TimelineError("ALIGNMENT_INCOMPLETE", "對齊時間超出人聲音訊範圍。")
    compact_start, _, source_start = matches[0 if end else -1]
    return round(timestamp - compact_start + source_start, 6)
