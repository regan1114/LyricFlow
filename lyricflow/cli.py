"""Command-line arguments for the offline alignment workflow."""

import argparse
from pathlib import Path

from .config import PROJECT_ROOT
from .pipeline import align_song
from .progress import report_progress
from .repair import repair_song


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("audio", type=Path)
    parser.add_argument("lyrics", type=Path, nargs="?", default=PROJECT_ROOT / "lyric.txt")
    parser.add_argument("--threads", type=int, default=4)
    source = parser.add_mutually_exclusive_group()
    source.add_argument("--transcript", type=Path, help="重用 whisper.cpp 完整 JSON")
    source.add_argument(
        "--retry-from", type=Path, help="保留既有時間，只補辨識 JSON 中未定位的句子"
    )
    parser.add_argument("--no-retry", action="store_true", help="停用未定位句子的局部重試")
    parser.add_argument("--output", type=Path, default=PROJECT_ROOT / "output")
    parser.add_argument("--progress-json", action="store_true", help="即時輸出介面使用的階段與進度")
    args = parser.parse_args()
    if args.threads < 1:
        parser.error("--threads 必須大於 0")
    if args.retry_from:
        repair_song(
            args.audio,
            args.retry_from,
            args.output,
            threads=args.threads,
            progress=report_progress if args.progress_json else None,
        )
        return
    align_song(
        args.audio,
        args.lyrics,
        args.output,
        threads=args.threads,
        transcript=args.transcript,
        retry=not args.no_retry,
        progress=report_progress if args.progress_json else None,
    )
