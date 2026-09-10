"""Pure ordered character and homophone alignment; no HTTP or file I/O."""

import re

from pypinyin import lazy_pinyin

from .lyrics import normalized


def transcript_characters(transcription, audio_duration):
    """Preserve ASR token times. Intra-token character times are estimates."""
    chars = []
    for segment in transcription:
        if re.fullmatch(r"\s*[\[【（(].*[\]】）)]\s*", segment["text"]):
            continue
        start = max(0, segment["offsets"]["from"] / 1000)
        end = min(audio_duration, segment["offsets"]["to"] / 1000)
        if end <= start:
            continue
        tokens = [t for t in segment.get("tokens", []) if t["id"] < 50257]
        if not tokens:
            tokens = [{"text": segment["text"]}]
        total = sum(len(normalized(t["text"])) for t in tokens)
        position = 0
        for token in tokens:
            text = normalized(token["text"])
            if not text:
                continue
            bounds = token.get("offsets", {})
            a, b = bounds.get("from", -1) / 1000, bounds.get("to", -1) / 1000
            estimated = not (start <= a < b <= end + 0.05)
            if estimated:
                a = start + (end - start) * position / total
                b = start + (end - start) * (position + len(text)) / total
            a, b = max(start, a), min(end, b)
            for k, char in enumerate(text):
                chars.append(
                    {
                        "char": char,
                        "start": a + (b - a) * k / len(text),
                        "end": a + (b - a) * (k + 1) / len(text),
                        "estimated": estimated or len(text) > 1,
                    }
                )
            position += len(text)
    return chars


def sequence_map(expected, heard):
    """Global ordered edit alignment; identical/homophone substitutions cost less.

    Global order distinguishes repeated choruses when surrounding lyrics provide
    context. It cannot resolve repetitions that the audio recognizer omitted.
    """
    ep = lazy_pinyin(expected, errors=lambda text: list(text))
    hp = lazy_pinyin(heard, errors=lambda text: list(text))
    n, m = len(expected), len(heard)
    trace = [bytearray(m + 1) for _ in range(n + 1)]
    previous = [j * 4 for j in range(m + 1)]
    for i in range(1, n + 1):
        current = [i * 4] + [0] * m
        trace[i][0] = 1
        for j in range(1, m + 1):
            cost = 0 if expected[i - 1] == heard[j - 1] else (1 if ep[i - 1] == hp[j - 1] else 5)
            choices = (previous[j - 1] + cost, previous[j] + 4, current[j - 1] + 4)
            direction = min(range(3), key=choices.__getitem__)
            current[j] = choices[direction]
            trace[i][j] = direction
        previous = current
    result = {}
    i, j = n, m
    while i or j:
        direction = trace[i][j] if i and j else (1 if i else 2)
        if direction == 0:
            strength = (
                1.0 if expected[i - 1] == heard[j - 1] else (0.8 if ep[i - 1] == hp[j - 1] else 0)
            )
            result[i - 1] = (j - 1, strength)
            i -= 1
            j -= 1
        elif direction == 1:
            i -= 1
        else:
            j -= 1
    return result


def align_lines(lines, transcription, duration):
    heard = transcript_characters(transcription, duration)
    texts = [normalized(line) for line in lines]
    mapping = sequence_map("".join(texts), "".join(c["char"] for c in heard))
    rows, offset = [], 0
    for number, (line, text) in enumerate(zip(lines, texts), 1):
        matches = [mapping[k] for k in range(offset, offset + len(text)) if k in mapping]
        score = sum(strength for _, strength in matches) / len(text)
        # A timestamp supported only by unrelated substitutions is not a match.
        supported = sum(strength > 0 for _, strength in matches)
        row = {
            "line": number,
            "text": line,
            "start": None,
            "end": None,
            "text_match_score": round(score, 3),
            "status": "unmatched",
            "notes": [],
        }
        if matches and score >= 0.4 and supported >= min(2, len(text)):
            first, last = heard[matches[0][0]], heard[matches[-1][0]]
            row.update(
                start=round(first["start"], 3), end=round(last["end"], 3), status="automatic"
            )
            if score < 0.75:
                row["notes"].append("辨識文字與原歌詞差異較大")
            if len(matches) < len(text):
                row["notes"].append("部分字未辨識到，句子邊界可能不完整")
            if first["estimated"] or last["estimated"]:
                row["notes"].append("起訖包含 token 內字元時間估計")
            if row["end"] - row["start"] > max(8, len(text) * 1.2):
                row["notes"].append("持續時間偏長，請檢查前奏或間奏")
            if row["end"] <= row["start"]:
                row.update(start=None, end=None, status="unmatched")
                row["notes"].append("辨識時間無效")
            elif row["notes"]:
                row["status"] = "review"
        else:
            row["notes"].append("缺少可靠文字對應，未猜測時間")
        rows.append(row)
        offset += len(text)
    previous = None
    for row in rows:
        if row["start"] is None:
            continue
        if previous and row["start"] < previous["end"]:
            row.update(start=None, end=None, status="unmatched")
            row["notes"].append("辨識時間與上一句重疊，請手動定位")
        else:
            previous = row
    return rows
