"""Build matching SRT and name-only image JSON from aligned lyrics and storyboard anchors."""

import argparse
import json
import math
from pathlib import Path

from lyricflow.lyrics import read_lyrics
from lyricflow.subtitles import srt_timestamp


def build_package(alignment, lyrics, storyboard, images):
    """Validate all lyrics and assets before producing either import file."""
    data = alignment.get("result", alignment)
    if not isinstance(data, dict):
        raise ValueError("尚未取得完成的對時結果。")
    rows = data.get("lines", [])
    if not 1 <= len(rows) <= 500 or len(rows) != len(lyrics):
        raise ValueError("對時結果須包含全部歌詞，且為 1～500 句；不可略過未定位句子。")
    duration = data.get("duration")
    if type(duration) not in (int, float) or not math.isfinite(duration) or duration <= 0:
        raise ValueError("對時結果缺少有效的歌曲長度。")
    cues = []
    previous_end = 0
    for number, (row, lyric) in enumerate(zip(rows, lyrics), 1):
        label = f"第 {number} 句"
        text = row.get("text")
        if not isinstance(text, str) or not text.strip():
            raise ValueError(f"{label}缺少歌詞，請依原始歌詞補正。")
        if row.get("line") != number or text != lyric:
            raise ValueError(f"{label}與原始歌詞或順序不同，請重新核對。")
        start, end = row.get("start"), row.get("end")
        if row.get("status") == "unmatched" or any(
            type(value) not in (int, float) or not math.isfinite(value) for value in (start, end)
        ):
            raise ValueError(f"{label}「{text}」尚未定位，請補辨識或校正時間後再匯出。")
        start_ms, end_ms = round(start * 1000), round(end * 1000)
        if start < 0 or start_ms < previous_end or end_ms - start_ms < 50:
            raise ValueError(f"{label}時間重疊、為負數或不足 0.05 秒。")
        if end_ms > math.ceil(duration * 1000):
            raise ValueError(f"{label}超出歌曲長度。")
        cues.append({"startTime": start_ms / 1000, "endTime": end_ms / 1000, "content": text})
        previous_end = end_ms

    if not isinstance(storyboard, list) or not storyboard:
        raise ValueError("分鏡須為包含 name 與 fromLine 的陣列。")
    filenames = {path.name for path in images.iterdir() if path.is_file() and path.stat().st_size}
    previous_line = 0
    for shot in storyboard:
        line, name = shot.get("fromLine"), shot.get("name")
        if type(line) is not int or not previous_line < line <= len(cues):
            raise ValueError("fromLine 須依歌詞順序遞增，且不得超出歌詞句數。")
        if previous_line == 0 and line != 1:
            raise ValueError("第一張分鏡的 fromLine 必須為 1，以涵蓋全部歌詞。")
        if (
            not isinstance(name, str)
            or name != name.strip()
            or any(char in name for char in "/\\:")
            or Path(name).suffix.lower() not in (".png", ".jpg", ".jpeg", ".webp")
            or name not in filenames
        ):
            raise ValueError(f"分鏡圖片 {name!r} 不存在、為空檔或檔名不符。")
        previous_line = line

    scenes, blocks = [], []
    shot_index = 0
    for number, cue in enumerate(cues, 1):
        if shot_index + 1 < len(storyboard) and number >= storyboard[shot_index + 1]["fromLine"]:
            shot_index += 1
        scenes.append({"name": storyboard[shot_index]["name"], **cue})
        blocks.append(
            f"{number}\n{srt_timestamp(cue['startTime'])} --> "
            f"{srt_timestamp(cue['endTime'])}\n{cue['content']}"
        )
    return {"version": 1, "scenes": scenes}, "\n\n".join(blocks) + "\n"


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--alignment", required=True, type=Path, help="API 工作或 alignment JSON")
    parser.add_argument("--lyrics", required=True, type=Path, help="原始 Suno 歌詞 UTF-8 檔")
    parser.add_argument("--storyboard", required=True, type=Path, help="name / fromLine 分鏡陣列")
    parser.add_argument("--output", required=True, type=Path, help="已含 images/ 圖檔的交付資料夾")
    args = parser.parse_args()
    try:
        alignment = json.loads(args.alignment.read_text(encoding="utf-8-sig"))
        storyboard = json.loads(args.storyboard.read_text(encoding="utf-8-sig"))
        arrangement, srt = build_package(
            alignment, read_lyrics(args.lyrics), storyboard, args.output / "images"
        )
        targets = [args.output / "lyrics.srt", args.output / "image-subtitles.json"]
        if any(path.exists() for path in targets):
            raise ValueError("交付檔案已存在；請先保留舊版，再移除舊的 SRT／JSON 後重建。")
        targets[0].write_text(srt, encoding="utf-8-sig")
        targets[1].write_text(
            json.dumps(arrangement, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
        )
    except (OSError, ValueError, AttributeError, TypeError) as error:
        parser.exit(1, f"匯出失敗：{error}\n")
    print(f"已匯出 {len(arrangement['scenes'])} 句歌詞，使用 {len(storyboard)} 個分鏡安排。")
    print(f"交付目錄：{args.output}")
    print("時間來自對時結果；匯入前仍須試聽核對，自動對時不代表已人工確認。")


if __name__ == "__main__":
    main()
