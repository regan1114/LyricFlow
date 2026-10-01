#!/usr/bin/env python3
"""Install the optional CPU lyrics alignment runtime without changing the original environment."""

import argparse
import json
import os
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))
from lyricflow.timeline.runtime import (  # noqa: E402
    ENGINE_VERSION,
    MODEL_DIR,
    MODEL_ID,
    MODEL_REVISION,
    WHISPER_DIR,
    python_path,
)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--download-only",
        action="store_true",
        help="Run inside .venv-alignment after dependency installation",
    )
    parser.add_argument(
        "--ctc", action="store_true", help="Also install experimental Chinese CTC baseline"
    )
    parser.add_argument(
        "--separation", action="store_true", help="Also install Demucs vocal separation"
    )
    args = parser.parse_args()
    if not args.download_only:
        python = python_path()
        if not python.exists():
            subprocess.run(
                [sys.executable, "-m", "venv", str(ROOT / ".venv-alignment")], check=True
            )
        subprocess.run(
            [
                str(python),
                "-m",
                "pip",
                "install",
                "-r",
                str(
                    ROOT
                    / (
                        "requirements-separation.txt"
                        if args.separation
                        else "requirements-alignment.txt"
                    )
                ),
            ],
            check=True,
        )
        subprocess.run(
            [
                str(python),
                str(Path(__file__).resolve()),
                "--download-only",
                *(["--ctc"] if args.ctc else []),
                *(["--separation"] if args.separation else []),
            ],
            check=True,
        )
        return
    os.environ["HF_HOME"] = str(ROOT / ".cache/huggingface")
    import stable_whisper
    import torch
    import whisper

    WHISPER_DIR.mkdir(parents=True, exist_ok=True)
    stable_whisper.load_model("small", device="cpu", download_root=str(WHISPER_DIR))
    (WHISPER_DIR / "manifest.json").write_text(
        json.dumps(
            {
                "model": "whisper-small",
                "sha256": whisper._MODELS["small"].split("/")[-2],
                "engine": ENGINE_VERSION,
                "runtime": sys.version,
                "torch": torch.__version__,
            }
        ),
        encoding="utf-8",
    )
    print(f"Alignment model installed: {WHISPER_DIR}")
    if args.separation:
        os.environ["TORCH_HOME"] = str(ROOT / ".cache/torch")
        from demucs.pretrained import get_model

        get_model("htdemucs")
    if not args.ctc:
        return
    from huggingface_hub import snapshot_download
    from safetensors.torch import save_file

    snapshot = Path(
        snapshot_download(
            MODEL_ID,
            revision=MODEL_REVISION,
            allow_patterns=["*.json", "pytorch_model.bin", "README.md"],
        )
    )
    MODEL_DIR.mkdir(parents=True, exist_ok=True)
    import shutil

    for source in snapshot.iterdir():
        if source.suffix == ".json" or source.name == "README.md":
            shutil.copyfile(source, MODEL_DIR / source.name)
    # No model repository code is executed. Restricted weights-only deserialization.
    weights = torch.load(snapshot / "pytorch_model.bin", map_location="cpu", weights_only=True)
    save_file(
        {key: value.contiguous() for key, value in weights.items()},
        str(MODEL_DIR / "model.safetensors"),
        metadata={"format": "pt"},
    )
    from transformers import Wav2Vec2ForCTC

    Wav2Vec2ForCTC.from_pretrained(MODEL_DIR, local_files_only=True, use_safetensors=True)
    (MODEL_DIR / "manifest.json").write_text(
        json.dumps(
            {
                "model": MODEL_ID,
                "revision": MODEL_REVISION,
                "runtime": sys.version,
                "torch": torch.__version__,
            }
        ),
        encoding="utf-8",
    )
    print(f"Alignment model installed: {MODEL_DIR}")


if __name__ == "__main__":
    main()
