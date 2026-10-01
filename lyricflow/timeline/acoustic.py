"""Replaceable acoustic adapter; CPU inference in bounded overlapping chunks."""

import wave
from typing import Protocol

from .contract import TimelineError
from .ctc import forced_path
from .normalization import phonetic_tokens
from .runtime import MODEL_DIR


class LyricsAlignmentEngine(Protocol):
    def align(self, audio, lines, progress): ...


class ChineseCTCAligner:
    def __init__(self, model_dir=MODEL_DIR):
        self.model_dir = model_dir

    def align(self, audio, lines, progress):
        import os

        from ..config import PROJECT_ROOT

        os.environ.setdefault("HF_HOME", str(PROJECT_ROOT / ".cache/huggingface"))
        import numpy as np
        import torch
        from transformers import Wav2Vec2CTCTokenizer, Wav2Vec2FeatureExtractor, Wav2Vec2ForCTC

        torch.set_num_threads(4)
        device = "cuda" if torch.cuda.is_available() else "cpu"
        try:
            tokenizer = Wav2Vec2CTCTokenizer.from_pretrained(self.model_dir, local_files_only=True)
            extractor = Wav2Vec2FeatureExtractor.from_pretrained(
                self.model_dir, local_files_only=True
            )
            model = (
                Wav2Vec2ForCTC.from_pretrained(
                    self.model_dir, local_files_only=True, use_safetensors=True
                )
                .to(device)
                .eval()
            )
        except Exception as error:
            raise TimelineError(
                "MODEL_LOAD_FAILED",
                "無法載入歌詞對齊模型。",
                str(error),
                "執行 scripts/setup_alignment.py；若記憶體不足，關閉其他大型程式。",
            ) from error
        units = [unit for line in lines for unit in line["units"]]
        characters = "".join(unit["normalized"] for unit in units)
        vocab = tokenizer.get_vocab()
        groups, targets = phonetic_tokens(vocab, characters)
        groups = [[model.config.pad_token_id], *groups]
        with wave.open(str(audio)) as wav:
            if (wav.getframerate(), wav.getsampwidth(), wav.getnchannels()) != (16000, 2, 1):
                raise TimelineError("INVALID_AUDIO", "對齊需要 16 kHz 單聲道 PCM。")
            samples = (
                np.frombuffer(wav.readframes(wav.getnframes()), dtype="<i2").astype(np.float32)
                / 32768
            )
        duration = len(samples) / 16000
        if np.max(np.abs(samples), initial=0) < 0.0001:
            raise TimelineError("NO_VOCALS", "音訊沒有可對齊的聲音。")
        emissions, times = [], []
        core, context, stride = 320000, 16000, 320
        for start in range(0, len(samples), core):
            left, right = max(0, start - context), min(len(samples), start + core + context)
            if right - left < 400:
                continue
            inputs = extractor(samples[left:right], sampling_rate=16000, return_tensors="pt")
            with torch.inference_mode():
                logits = model(**{key: value.to(device) for key, value in inputs.items()}).logits[0]
                log_probs = logits.log_softmax(-1)
                probabilities = (
                    torch.stack([log_probs[:, group].logsumexp(-1) for group in groups], dim=-1)
                    .cpu()
                    .numpy()
                )
            positions = left + np.arange(len(probabilities)) * stride
            mask = (positions + 200 >= start) & (positions + 200 < min(len(samples), start + core))
            emissions.append(probabilities[mask])
            times.extend(
                (float(position / 16000), min(duration, float((position + stride) / 16000)))
                for position in positions[mask]
            )
            progress("analyzing_audio", 0.2 + 0.55 * min(1, (start + core) / len(samples)))
        progress("alignment", 0.8)
        aligned = forced_path(np.concatenate(emissions), targets)
        words, offset = [], 0
        for unit in units:
            spans = aligned[offset : offset + len(unit["normalized"])]
            words.append(
                {
                    "text": unit["text"],
                    "start": times[spans[0][0]][0],
                    "end": times[spans[-1][1] - 1][1],
                    "confidence": sum(s[2] for s in spans) / len(spans),
                }
            )
            offset += len(spans)
        segments, offset = [], 0
        for index, line in enumerate(lines, 1):
            line_words = words[offset : offset + len(line["units"])]
            offset += len(line_words)
            confidence = sum(word["confidence"] for word in line_words) / len(line_words)
            if confidence < 0.05 or any(word["confidence"] < 0.005 for word in line_words):
                raise TimelineError(
                    "ALIGNMENT_LOW_CONFIDENCE",
                    "部分歌詞缺少足夠聲學支持，未套用字幕。",
                    f"第 {index} 行：{line['text']}",
                    "確認歌詞與演唱一致；可嘗試人聲分離或手動對時。",
                )
            segments.append(
                {
                    "id": index,
                    "text": line["text"],
                    "start": line_words[0]["start"],
                    "end": line_words[-1]["end"],
                    "confidence": confidence,
                    "words": line_words,
                }
            )
        return {
            "version": "1.0.0",
            "mode": "known_lyrics",
            "duration": duration,
            "segments": segments,
        }
