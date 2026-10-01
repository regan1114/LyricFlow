"""Paths shared by the light HTTP process and optional heavy model worker."""

import os
import sys
from pathlib import Path

from ..config import PROJECT_ROOT

MODEL_ID = "jonatasgrosman/wav2vec2-large-xlsr-53-chinese-zh-cn"
MODEL_REVISION = "99ccb2737be22b8bb50dcfcc39ad4d567fb90cfd"
ENGINE_VERSION = "whisper-align-small-stable-ts-2.19.1-v4"
ALIGNMENT_REVISION = "9ecf779972d90ba49c06d968637d720dd632c55bbf19d441fb42bf17a411e794"
MODEL_DIR = PROJECT_ROOT / ".local/models/lyrics-ctc"
WHISPER_DIR = PROJECT_ROOT / ".local/models/whisper-alignment"


def python_path(root=PROJECT_ROOT):
    relative = "Scripts/python.exe" if sys.platform == "win32" else "bin/python"
    return Path(os.environ.get("LYRICS_ENGINE_PYTHON", str(root / ".venv-alignment" / relative)))


def readiness(root=PROJECT_ROOT):
    model = root / ".local/models/whisper-alignment"
    ready = python_path(root).is_file() and all(
        (model / name).is_file() for name in ("small.pt", "manifest.json")
    )
    return {
        "ready": ready,
        "mode": "known_lyrics",
        "engine_version": ENGINE_VERSION,
        "message": "對齊引擎已安裝；歌唱結果需試聽校正。"
        if ready
        else "請執行 scripts/setup_alignment.py 安裝本機對齊引擎。",
    }
