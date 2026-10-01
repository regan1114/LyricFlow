"""Explicit source providers. A no-op never claims vocals were separated."""

import subprocess
import sys
from typing import Protocol

from ..config import PROJECT_ROOT
from .contract import TimelineError


class VocalSeparator(Protocol):
    identity: str

    def separate(self, audio, cache): ...


class OriginalAudio:
    identity = "original-v1"

    def separate(self, audio, cache):
        return audio


class DemucsSeparator:
    identity = "demucs-4.0.1-htdemucs-shifts0"

    def separate(self, audio, cache):
        output = cache / "htdemucs" / audio.stem / "vocals.wav"
        if output.is_file():
            return output
        if not (PROJECT_ROOT / ".cache/torch/hub/checkpoints/955717e8-8726e21a.th").is_file():
            raise TimelineError(
                "VOCAL_MODEL_MISSING",
                "人聲分離模型尚未安裝。",
                suggestion="請執行 scripts/setup_alignment.py --separation，或改用原音對齊。",
            )
        try:
            import os

            env = dict(
                os.environ,
                TORCH_HOME=str(PROJECT_ROOT / ".cache/torch"),
                HF_HOME=str(PROJECT_ROOT / ".cache/huggingface"),
            )
            subprocess.run(
                [
                    sys.executable,
                    "-m",
                    "demucs",
                    "--two-stems",
                    "vocals",
                    "--shifts",
                    "0",
                    "-n",
                    "htdemucs",
                    "-d",
                    "cpu",
                    "-o",
                    str(cache),
                    str(audio),
                ],
                check=True,
                env=env,
            )
        except (OSError, subprocess.CalledProcessError) as error:
            output.unlink(missing_ok=True)
            raise TimelineError(
                "VOCAL_SEPARATION_FAILED",
                "人聲分離失敗。",
                str(error),
                "在 alignment 環境安裝 Demucs 4.0.1 及模型，或改用原音對齊。",
            ) from error
        if not output.is_file():
            raise TimelineError("VOCAL_SEPARATION_FAILED", "人聲分離沒有產生音檔。")
        return output
