"""Runs in the isolated alignment environment under the existing process runner."""

import argparse
import json
from pathlib import Path

from .contract import TimelineError
from .pipeline import align_known


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("folder", type=Path)
    args = parser.parse_args()
    folder = args.folder
    job = json.loads((folder / "status.json").read_text(encoding="utf-8"))

    def progress(stage, value):
        print(
            "\nLYRIC_FLOW_PROGRESS "
            + json.dumps({"stage": stage, "progress": value, "percent": round(value * 100)}),
            flush=True,
        )

    try:
        source = folder / ("source" + Path(job["name"]).suffix.lower())
        align_known(
            source,
            job["lyrics"],
            folder / "output",
            job["preserve_lines"],
            job["separation"],
            progress,
        )
    except Exception as error:
        if isinstance(error, TimelineError):
            failure = error.data
        else:
            failure = {
                "code": "ALIGNMENT_FAILED",
                "message": "歌詞對齊失敗。",
                "details": str(error),
                "suggestion": "確認 alignment Python 環境、可用記憶體與模型安裝；詳細紀錄見工作資料夾。",
            }
        (folder / "failure.json").write_text(
            json.dumps(failure, ensure_ascii=False), encoding="utf-8"
        )
        raise SystemExit(1) from error


if __name__ == "__main__":
    main()
