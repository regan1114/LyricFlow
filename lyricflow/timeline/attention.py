"""Known-text Whisper attention/DTW alignment. Never calls transcribe()."""

import os
import wave

from ..config import PROJECT_ROOT
from .activity import compact_vocals, source_time
from .contract import TimelineError
from .runtime import WHISPER_DIR


def check_word_boundaries(words, line):
    """Reject unsupported bridges across long gaps; never invent replacement times."""
    previous = None
    for word in words:
        if word.end - word.start > 12 or (previous is not None and word.start - previous > 8):
            raise TimelineError(
                "ALIGNMENT_LONG_GAP",
                "歌詞行跨越過長空檔，無法確認歌唱邊界。",
                f"{line}（{word.start:.2f}–{word.end:.2f} 秒）",
                "請試用人聲分離；若一句中有長間奏，將間奏前後歌詞分成不同行再對齊。",
            )
        previous = word.end


class WhisperLyricsAligner:
    def __init__(self, separated=False):
        self.separated = separated

    def align(self, audio, lines, progress):
        os.environ.setdefault("NUMBA_CACHE_DIR", str(PROJECT_ROOT / ".cache/numba"))
        import numpy as np
        import stable_whisper
        import torch

        with wave.open(str(audio)) as wav:
            samples = (
                np.frombuffer(wav.readframes(wav.getnframes()), dtype="<i2").astype(np.float32)
                / 32768
            )
        duration = len(samples) / 16000
        if np.max(np.abs(samples), initial=0) < 0.0001:
            raise TimelineError("NO_VOCALS", "音訊沒有可對齊的聲音。")
        mapping = None
        if self.separated:
            progress("vocal_activity", 0.16)
            samples, mapping = compact_vocals(samples)
        progress("loading_alignment", 0.18)
        torch.set_num_threads(4)
        model_path = WHISPER_DIR / "small.pt"
        if not model_path.is_file():
            raise TimelineError(
                "MODEL_LOAD_FAILED",
                "找不到本機對齊模型。",
                str(model_path),
                "請執行 scripts/setup_alignment.py。",
            )
        try:
            model = stable_whisper.load_model(
                str(model_path), device="cuda" if torch.cuda.is_available() else "cpu"
            )
        except Exception as error:
            raise TimelineError(
                "MODEL_LOAD_FAILED",
                "歌詞對齊模型無法載入。",
                str(error),
                "重新安裝對齊引擎；若記憶體不足，請先關閉其他大型程式。",
            ) from error
        expected = ["".join(unit["normalized"] for unit in line["units"]) for line in lines]
        progress("alignment", 0.2)
        result = model.align(
            samples,
            "\n".join(line["text"] for line in lines),
            language="zh",
            original_split=True,
            regroup=False,
            # stable-ts updates its progress counter only while tqdm is enabled.
            verbose=False,
            max_word_dur=None if self.separated else 3,
            word_dur_factor=None if self.separated else 2,
            failure_threshold=0.15,
            progress_callback=lambda seek, total: progress(
                "alignment", 0.2 + 0.7 * min(1, seek / max(total, 0.001))
            ),
        )
        if result is None or len(result.segments) != len(lines):
            raise TimelineError(
                "ALIGNMENT_INCOMPLETE",
                "未能定位所有歌詞行，原有字幕已保留。",
                suggestion="請確認歌詞只包含實際演唱內容，並試用人聲分離或手動對時。",
            )
        segments = []
        from opencc import OpenCC

        converter = OpenCC("t2s")

        def normalized(text):
            return "".join(
                c for char in text for c in converter.convert(char).upper() if c.isalnum()
            )

        for index, (source, segment, target) in enumerate(zip(lines, result.segments, expected), 1):
            if mapping:
                for word in segment.words:
                    word.start = source_time(word.start, mapping)
                    word.end = source_time(word.end, mapping, end=True)
            check_word_boundaries(segment.words, source["text"])
            actual = normalized(segment.text)
            if actual != target or not 0 <= segment.start < segment.end <= duration:
                raise TimelineError(
                    "ALIGNMENT_INCOMPLETE",
                    "部分歌詞未取得有效時間。",
                    f"第 {index} 行：{source['text']}",
                )
            scores = [word.probability for word in segment.words if word.probability is not None]
            confidence = sum(scores) / len(scores) if scores else None
            if confidence is not None and confidence < 0.02:
                raise TimelineError(
                    "ALIGNMENT_LOW_CONFIDENCE",
                    "部分歌詞缺少足夠聲學支持。",
                    f"第 {index} 行：{source['text']}",
                    "請核對音訊與歌詞，或改用人聲分離／手動對時。",
                )
            words, position = [], 0
            for word in segment.words:
                token_text = normalized(word.word)
                if not token_text:
                    continue
                matched, text = "", ""
                while position < len(source["units"]) and len(matched) < len(token_text):
                    unit = source["units"][position]
                    position += 1
                    matched += unit["normalized"]
                    text += unit["text"]
                if matched != token_text or word.end <= word.start:
                    words = []
                    break
                item = {"text": text, "start": word.start, "end": word.end}
                if word.probability is not None:
                    item["confidence"] = word.probability
                words.append(item)
            item = {"id": index, "start": segment.start, "end": segment.end, "text": source["text"]}
            if confidence is not None:
                item["confidence"] = confidence
            if words and "".join(word["text"] for word in words) == source["text"]:
                item["words"] = words
            segments.append(item)
        return {
            "version": "1.0.0",
            "mode": "known_lyrics",
            "duration": duration,
            "segments": segments,
        }
