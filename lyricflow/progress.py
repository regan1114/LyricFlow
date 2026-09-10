"""The progress event contract shared by the CLI and background worker."""

import json

PROGRESS_PREFIX = "LYRIC_FLOW_PROGRESS "
STAGE_MESSAGES = {
    "preparing": "正在準備音訊…",
    "recognizing": "正在辨識歌曲…",
    "cached": "找到歌曲快取，已完成辨識。",
    "aligning": "正在對齊原始歌詞…",
    "retrying": "正在補查未對齊的句子…",
    "exporting": "正在產生字幕檔案…",
}


def report_progress(stage, percent=None, **details):
    print(PROGRESS_PREFIX + json.dumps({"stage": stage, "percent": percent, **details}), flush=True)


def progress_message(event):
    if event["stage"] == "retrying":
        if "end_line" in event:
            return (
                f"正在補辨識第 {event['current']}/{event['total']} 個片段"
                f"（歌詞第 {event['line']}–{event['end_line']} 行）…"
            )
        return f"正在補查第 {event['current']}/{event['total']} 句（歌詞第 {event['line']} 行）…"
    return STAGE_MESSAGES[event["stage"]]
