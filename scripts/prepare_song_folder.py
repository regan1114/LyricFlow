"""Prepare one song folder for the Codex storyboard and album-cover workflow."""

import argparse
import json
from pathlib import Path

from lyricflow.config import AUDIO_EXTENSIONS, MAX_LYRICS_BYTES
from lyricflow.lyrics import read_lyrics
from lyricflow.validation import parse_job_input

TITLE_FILE = "專輯名稱.txt"
PROGRESS_TEMPLATE = """# 歌曲製作進度

製作規格：專案根目錄 WORKFLOW.md。每完成一階段，核對實際檔案後更新本紀錄。

## 使用者指定需求

- 請在執行前記錄本次指定的畫風、張數、比例或專輯名稱；未指定時沿用 WORKFLOW.md 預設。
- 原始來源與初始設定：source.json；完整歌詞：suno-lyrics.txt；行號：lyrics-index.json。

## 完成項目

- [x] 確認單首音檔與歌詞，保留原始歌詞及來源紀錄。
- [ ] 提交或接續對時工作，保存 alignment-job.json 與 alignment.json。
- [ ] 核對全部歌詞，處理漏句及需複查的時間。
- [ ] 完成 storyboard.json 與 storyboard.md。
- [ ] 生成並檢視 images/ 中每張獨立分鏡圖，保存 prompts.md。
- [ ] 確定 album.md 的專輯名稱，生成並檢視 cover/album-cover.png。
- [ ] 執行匯出檢查，產生 lyrics.srt 與 image-subtitles.json。
- [ ] 核對全部交付物，提供路徑及 LyricFlow 匯入步驟。

## 接手紀錄

- 最後完成：準備輸入資料；尚未提交對時或生成圖片。
- 對時工作編號：尚未提交；提交後見 alignment-job.json。
- 下一步：記錄使用者指定需求，確認本機對時服務與影像工具可用。
- 待確認／受阻事項：尚未檢查歌曲對時與圖片生成。

## 成果與驗證紀錄

尚未產生最終素材。每階段請補上成果路徑、檢查結果及仍需確認的位置。
"""


def prepare_folder(folder):
    folder = folder.resolve()
    files = sorted(
        path for path in folder.iterdir() if path.is_file() and not path.name.startswith(".")
    )
    audio = [path for path in files if path.suffix.lower() in AUDIO_EXTENSIONS]
    lyrics = [path for path in files if path.suffix.lower() == ".txt" and path.name != TITLE_FILE]
    if len(audio) != 1 or len(lyrics) != 1:
        raise ValueError(
            "每個歌曲資料夾須有且僅有一首音檔及一份 TXT 歌詞；"
            f"目前找到 {len(audio)} 首音檔、{len(lyrics)} 份歌詞。"
            f"可另放 {TITLE_FILE} 指定專輯名稱。"
        )
    audio, lyrics = audio[0], lyrics[0]
    if lyrics.stat().st_size > MAX_LYRICS_BYTES:
        raise ValueError("歌詞檔須小於或等於 64 KiB。")
    raw = lyrics.read_bytes()
    parse_job_input(
        {"name": audio.name, "size": audio.stat().st_size, "lyrics": raw.decode("utf-8-sig")}
    )
    lines = read_lyrics(lyrics)
    if len(lines) > 500:
        raise ValueError("圖片字幕匯入最多支援 500 句歌詞，請先分段製作。")
    title_file = folder / TITLE_FILE
    album_title = (
        title_file.read_text(encoding="utf-8-sig").strip() if title_file.is_file() else None
    )
    if title_file.is_file() and (not album_title or len(album_title.splitlines()) != 1):
        raise ValueError(f"{TITLE_FILE} 請填入單行、非空白的專輯名稱。")
    output = folder / "output"
    if output.exists():
        raise ValueError(
            "output 已存在；請依其中的來源紀錄與工作編號繼續製作，或使用新的歌曲資料夾。"
        )
    source = {
        "audio": str(audio),
        "lyrics": str(lyrics),
        "lyricCount": len(lines),
        "albumTitle": album_title,
        "storyboardAspectRatio": "16:9",
        "coverAspectRatio": "1:1",
    }
    output.mkdir()
    (output / "images").mkdir()
    (output / "cover").mkdir()
    (output / "suno-lyrics.txt").write_bytes(raw)
    (output / "source.json").write_text(
        json.dumps(source, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )
    (output / "lyrics-index.json").write_text(
        json.dumps(
            [{"line": i, "text": text} for i, text in enumerate(lines, 1)],
            ensure_ascii=False,
            indent=2,
        )
        + "\n",
        encoding="utf-8",
    )
    (output / "PROGRESS.md").write_text(PROGRESS_TEMPLATE, encoding="utf-8")
    return output, source


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("folder", type=Path, help="內含一首音檔與一份 TXT 歌詞的資料夾")
    args = parser.parse_args()
    try:
        output, source = prepare_folder(args.folder)
    except (OSError, ValueError) as error:
        parser.exit(1, f"準備失敗：{error}\n")
    print(f"已準備：{output}（{source['lyricCount']} 句歌詞）")
    print(f"專輯名稱：{source['albumTitle'] or '由 Codex 依歌詞命名'}")
    print("接續依 WORKFLOW.md 進行對時、分鏡與封面生成；目前尚未產生 SRT 或圖片。")


if __name__ == "__main__":
    main()
