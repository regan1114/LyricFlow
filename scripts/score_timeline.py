#!/usr/bin/env python3
"""Score timeline predictions against manually reviewed reference projects."""

import argparse
import json
import math
import re
import sys
from collections import defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

from lyricflow.timeline.contract import TimelineError, validate_project  # noqa: E402
from lyricflow.timeline.normalization import lyric_units  # noqa: E402


class BenchmarkError(Exception):
    pass


def read_json(path):
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except (OSError, UnicodeError, json.JSONDecodeError) as error:
        raise BenchmarkError(f"無法讀取 {path}: {error}") from error


def dataset_cases(root):
    manifest_path = root / "manifest.json"
    manifest = read_json(manifest_path)
    if not isinstance(manifest, dict) or manifest.get("version") != 1:
        raise BenchmarkError("manifest.json 的 version 必須是 1。")
    if not isinstance(manifest.get("cases"), list) or not manifest["cases"]:
        raise BenchmarkError("manifest.json 至少需要一筆 cases。")

    cases, seen = [], set()
    for item in manifest["cases"]:
        if not isinstance(item, dict):
            raise BenchmarkError("每筆 case 必須是 JSON 物件。")
        identity = item.get("id")
        if (
            not isinstance(identity, str)
            or not re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9._-]{0,63}", identity)
            or identity in seen
        ):
            raise BenchmarkError("case id 必須是安全、非空且不重複的英文／數字識別碼。")
        seen.add(identity)
        tags = item.get("tags", [])
        if not isinstance(tags, list) or not all(isinstance(tag, str) for tag in tags):
            raise BenchmarkError(f"{identity}: tags 必須是字串陣列。")
        preserve_lines = item.get("preserve_lines", True)
        if type(preserve_lines) is not bool:
            raise BenchmarkError(f"{identity}: preserve_lines 必須是布林值。")

        paths = {}
        for name in ("audio", "lyrics", "reference"):
            value = item.get(name)
            if not isinstance(value, str) or not value:
                raise BenchmarkError(f"{identity}: 缺少 {name} 相對路徑。")
            path = (root / value).resolve()
            if root.resolve() not in path.parents or not path.is_file():
                raise BenchmarkError(f"{identity}: {name} 檔案不存在或超出資料集目錄：{value}")
            paths[name] = path
        try:
            reference = validate_project(read_json(paths["reference"]))
        except TimelineError as error:
            raise BenchmarkError(f"{identity}: reference.json 格式無效：{error}") from error
        if not reference["segments"]:
            raise BenchmarkError(f"{identity}: reference.json 至少需要一段字幕。")
        try:
            lyrics = paths["lyrics"].read_text(encoding="utf-8")
            expected_lines = [line["text"] for line in lyric_units(lyrics, preserve_lines)]
        except (OSError, UnicodeError, TimelineError) as error:
            raise BenchmarkError(f"{identity}: 歌詞檔無法解析：{error}") from error
        reference_lines = [segment["text"] for segment in reference["segments"]]
        if expected_lines != reference_lines:
            raise BenchmarkError(
                f"{identity}: reference.json 歌詞必須逐句符合 lyrics 檔和 preserve_lines 設定。"
            )
        cases.append({"id": identity, "tags": tags, "reference": reference})
    return cases


def empty_totals():
    return {
        "cases": 0,
        "successful_cases": 0,
        "reference_segments": 0,
        "matched_segments": 0,
        "exact_text_segments": 0,
        "reference_words": 0,
        "matched_words": 0,
        "sentence_boundary_errors": [],
        "word_boundary_errors": [],
    }


def add_case(totals, result):
    totals["cases"] += 1
    totals["successful_cases"] += result["success"]
    totals["reference_segments"] += result["reference_segments"]
    totals["matched_segments"] += result["matched_segments"]
    totals["exact_text_segments"] += result["exact_text_segments"]
    totals["reference_words"] += result["reference_words"]
    totals["matched_words"] += result["matched_words"]
    totals["sentence_boundary_errors"].extend(result["sentence_boundary_errors"])
    totals["word_boundary_errors"].extend(result["word_boundary_errors"])


def boundary_stats(errors):
    if not errors:
        return {"count": 0, "mae_seconds": None, "median_seconds": None, "p90_seconds": None}
    ordered = sorted(errors)
    return {
        "count": len(ordered),
        "mae_seconds": round(sum(ordered) / len(ordered), 4),
        "median_seconds": round(ordered[math.ceil(len(ordered) * 0.5) - 1], 4),
        "p90_seconds": round(ordered[math.ceil(len(ordered) * 0.9) - 1], 4),
        "within_0_25_seconds": round(sum(value <= 0.25 for value in ordered) / len(ordered), 4),
        "within_0_5_seconds": round(sum(value <= 0.5 for value in ordered) / len(ordered), 4),
        "within_1_second": round(sum(value <= 1 for value in ordered) / len(ordered), 4),
    }


def summary(totals):
    def ratio(numerator, denominator):
        return round(numerator / denominator, 4) if denominator else None

    return {
        "cases": totals["cases"],
        "successful_case_rate": ratio(totals["successful_cases"], totals["cases"]),
        "segment_coverage": ratio(totals["matched_segments"], totals["reference_segments"]),
        "exact_text_rate": ratio(totals["exact_text_segments"], totals["reference_segments"]),
        "word_coverage": ratio(totals["matched_words"], totals["reference_words"]),
        "sentence_boundaries": boundary_stats(totals["sentence_boundary_errors"]),
        "word_boundaries": boundary_stats(totals["word_boundary_errors"]),
    }


def score_case(case, prediction_path):
    reference = case["reference"]
    result = {
        "id": case["id"],
        "tags": case["tags"],
        "success": False,
        "reference_segments": len(reference["segments"]),
        "matched_segments": 0,
        "exact_text_segments": 0,
        "reference_words": sum(len(segment.get("words", [])) for segment in reference["segments"]),
        "matched_words": 0,
        "sentence_boundary_errors": [],
        "word_boundary_errors": [],
    }
    try:
        predicted = validate_project(read_json(prediction_path))
    except (BenchmarkError, TimelineError) as error:
        result["error"] = str(error) if prediction_path.is_file() else "找不到預測檔案。"
        return result

    actual_segments = predicted["segments"]
    expected_segments = reference["segments"]
    text_mismatches = 0
    for expected, actual in zip(expected_segments, actual_segments):
        result["matched_segments"] += 1
        if expected["text"] != actual["text"]:
            text_mismatches += 1
            continue
        result["exact_text_segments"] += 1
        result["sentence_boundary_errors"].extend(
            [abs(expected["start"] - actual["start"]), abs(expected["end"] - actual["end"])]
        )
        expected_words, actual_words = expected.get("words", []), actual.get("words", [])
        if len(expected_words) != len(actual_words) or any(
            first["text"] != second["text"] for first, second in zip(expected_words, actual_words)
        ):
            continue
        result["matched_words"] += len(expected_words)
        for first, second in zip(expected_words, actual_words):
            result["word_boundary_errors"].extend(
                [abs(first["start"] - second["start"]), abs(first["end"] - second["end"])]
            )
    result["success"] = len(actual_segments) == len(expected_segments) and not text_mismatches
    if len(actual_segments) != len(expected_segments):
        result["error"] = (
            f"字幕段數不同：預測 {len(actual_segments)}，標註 {len(expected_segments)}。"
        )
    elif text_mismatches:
        result["error"] = f"有 {text_mismatches} 段字幕文字與標註不一致。"
    return result


def prediction_runs(root):
    direct = list(root.glob("*.json"))
    if direct:
        return [("default", root)]
    runs = sorted(path for path in root.iterdir() if path.is_dir() and list(path.glob("*.json")))
    if not runs:
        raise BenchmarkError("預測目錄中找不到 JSON；請使用 <預測目錄>/<case-id>.json。")
    return [(path.name, path) for path in runs]


def score_run(name, run_root, cases):
    totals = empty_totals()
    by_tag = defaultdict(empty_totals)
    case_results = []
    for case in cases:
        result = score_case(case, run_root / f"{case['id']}.json")
        case_results.append(result)
        add_case(totals, result)
        for tag in case["tags"]:
            add_case(by_tag[tag], result)
    return {
        "run": name,
        "overall": summary(totals),
        "by_tag": {tag: summary(value) for tag, value in sorted(by_tag.items())},
        "cases": case_results,
    }


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("dataset", type=Path, help="含 manifest.json 的人工標註資料集目錄")
    parser.add_argument("predictions", type=Path, help="預測 JSON 目錄，可用子目錄區分處理設定")
    parser.add_argument("--output", type=Path, help="另存 JSON 評分報告；省略時只輸出到終端機")
    args = parser.parse_args()
    try:
        cases = dataset_cases(args.dataset.resolve())
        reports = [
            score_run(name, folder, cases) for name, folder in prediction_runs(args.predictions)
        ]
    except (BenchmarkError, OSError) as error:
        parser.error(str(error))
    report = {"version": 1, "case_count": len(cases), "runs": reports}
    encoded = json.dumps(report, ensure_ascii=False, indent=2) + "\n"
    if args.output:
        args.output.parent.mkdir(parents=True, exist_ok=True)
        args.output.write_text(encoded, encoding="utf-8")
    print(encoded, end="")


if __name__ == "__main__":
    main()
