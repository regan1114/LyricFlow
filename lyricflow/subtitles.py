"""Export the original lyric lines as SRT and review files."""

import json


def srt_timestamp(seconds):
    ms = round(seconds * 1000)
    hours, ms = divmod(ms, 3600000)
    minutes, ms = divmod(ms, 60000)
    seconds, ms = divmod(ms, 1000)
    return f"{hours:02}:{minutes:02}:{seconds:02},{ms:03}"


def export(rows, output, audio, duration):
    output.mkdir(parents=True, exist_ok=True)
    stem = output / audio.stem
    timed = [r for r in rows if r["start"] is not None]
    srt = (
        "\n\n".join(
            f"{i}\n{srt_timestamp(r['start'])} --> {srt_timestamp(r['end'])}\n{r['text']}"
            for i, r in enumerate(timed, 1)
        )
        + "\n"
    )
    stem.with_suffix(".draft.srt").write_text(srt, encoding="utf-8-sig")
    data = {
        "audio": str(audio),
        "duration": duration,
        "method": "ASR + ordered character/homophone matching",
        "notice": "自動時間為草稿；text_match_score 是文字匹配分數，不是時間正確機率。未對齊行保留在此報告，不匯出虛構時間。",
        "lines": rows,
    }
    stem.with_suffix(".alignment.json").write_text(
        json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    report = [
        "歌詞對齊檢查表（時間為自動估計，請試聽）",
        f"共 {len(rows)} 行；匯出 {len(timed)} 行；未定位 {len(rows) - len(timed)} 行。",
        "",
    ]
    for row in rows:
        span = (
            f"{srt_timestamp(row['start'])} → {srt_timestamp(row['end'])}"
            if row["start"] is not None
            else "未定位"
        )
        report.append(f"{row['line']:02} [{row['status']}] {span}  {row['text']}")
        if row["notes"]:
            report.append("   " + "；".join(row["notes"]))
    stem.with_suffix(".review.txt").write_text("\n".join(report) + "\n", encoding="utf-8")
    print(report[1], flush=True)
    print(f"SRT：{stem.with_suffix('.draft.srt')}", flush=True)
