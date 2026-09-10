"""Read and normalize sung lyrics without changing the original text."""

import re
from pathlib import Path

from opencc import OpenCC

CC = OpenCC("t2s")


def normalized(text):
    return "".join(c for c in CC.convert(text).lower() if c.isalnum())


def read_lyrics(path):
    lines = []
    for raw in Path(path).read_text(encoding="utf-8-sig").splitlines():
        # Suno square-bracket directions are not sung; keep sung parentheses.
        line = re.sub(r"\[[^\]]*\]", "", raw).strip()
        if normalized(line):
            lines.append(line)
    if not lines:
        raise ValueError("歌詞檔沒有可對齊的歌詞，請先儲存內容。")
    return lines
