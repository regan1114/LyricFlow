"""Shared paths and limits for this single-machine application."""

import sys
from dataclasses import dataclass
from pathlib import Path
from typing import Optional

PROJECT_ROOT = Path(__file__).resolve().parent.parent
MAX_AUDIO_BYTES = 200 * 1024 * 1024
MAX_LYRICS_BYTES = 64 * 1024
MAX_LYRICS_CHARACTERS = 12000
MAX_AUDIO_SECONDS = 1800
AUDIO_EXTENSIONS = frozenset({".wav", ".mp3", ".m4a", ".aac", ".flac", ".aiff", ".aif"})
TERMINAL_STATUSES = frozenset({"done", "error", "cancelled"})
COPY_CHUNK_BYTES = 1024 * 1024


def engine_path(root=PROJECT_ROOT):
    name = "whisper-cli.exe" if sys.platform == "win32" else "whisper-cli"
    return root / ".local" / "bin" / name


@dataclass(frozen=True)
class Settings:
    root: Path = PROJECT_ROOT
    port: int = 8080
    jobs_directory: Optional[Path] = None

    @property
    def jobs_path(self) -> Path:
        return self.jobs_directory or self.root / ".cache/interface"

    @property
    def web_path(self) -> Path:
        return self.root / "web" / "dist"

    @property
    def ready(self) -> bool:
        return (self.root / ".local/models/ggml-small-q5_1.bin").is_file() and engine_path(
            self.root
        ).is_file()
