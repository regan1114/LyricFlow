"""Keep display text and per-character model text separate, including repetitions."""

import re

from opencc import OpenCC

from .contract import TimelineError


def phonetic_tokens(vocabulary, characters):
    """Pool Mandarin homophones without decoding or replacing the target lyrics."""
    from pypinyin import lazy_pinyin

    def sound(char):
        return "zh:" + lazy_pinyin(char)[0] if "\u4e00" <= char <= "\u9fff" else char

    groups = {}
    for char, identity in vocabulary.items():
        if len(char) == 1 and char.isalnum():
            groups.setdefault(sound(char), []).append(identity)
    targets = [sound(char) for char in characters]
    unknown = sorted({char for char, key in zip(characters, targets) if key not in groups})
    if unknown:
        raise TimelineError(
            "UNSUPPORTED_LYRICS",
            "模型不支援部分歌詞字元。",
            "、".join(unknown),
            "請用實際演唱的中文文字表達數字，或改用手動對時。",
        )
    keys = list(dict.fromkeys(targets))
    return [groups[key] for key in keys], [keys.index(key) + 1 for key in targets]


def lyric_units(raw, preserve_lines=True):
    converter = OpenCC("t2s")
    lines = []
    for raw_line in raw.lstrip("\ufeff").splitlines():
        pieces = [raw_line] if preserve_lines else re.split(r"(?<=[。！？；.!?;])", raw_line)
        for text in pieces:
            if not text.strip():
                continue
            units, pending = [], ""
            for char in text:
                normalized = "".join(c for c in converter.convert(char).upper() if c.isalnum())
                if normalized:
                    units.append({"text": pending + char, "normalized": normalized})
                    pending = ""
                elif units:
                    units[-1]["text"] += char
                else:
                    pending += char
            if not units:
                raise TimelineError("UNSUPPORTED_LYRICS", "歌詞包含沒有可演唱字元的行。", text)
            lines.append({"text": text, "units": units})
    if not lines:
        raise TimelineError("INVALID_LYRICS", "請提供實際演唱的歌詞。")
    return lines
