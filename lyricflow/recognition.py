"""Local whisper.cpp execution, audio preparation and recognition cache."""

import hashlib
import json
import re
import subprocess
import time
import wave
from pathlib import Path

from .config import PROJECT_ROOT, engine_path

ROOT = PROJECT_ROOT
ENGINE = engine_path(ROOT)
MODEL = ROOT / ".local/models/ggml-small-q5_1.bin"


def prepare_wav(source, target):
    # The bundled environment uses Python 3.9. audioop is available through 3.12.
    import audioop

    state = None
    temporary = target.with_name(target.name + ".partial")
    with wave.open(str(source), "rb") as src, wave.open(str(temporary), "wb") as dst:
        if src.getnchannels() not in (1, 2) or src.getcomptype() != "NONE":
            raise ValueError("目前支援單聲道或雙聲道 PCM WAV。")
        dst.setparams((1, 2, 16000, 0, "NONE", "not compressed"))
        while True:
            data = src.readframes(src.getframerate())
            if not data:
                break
            width = src.getsampwidth()
            if width == 1:
                data = audioop.bias(data, 1, -128)
            if width != 2:
                data = audioop.lin2lin(data, width, 2)
            if src.getnchannels() == 2:
                data = audioop.tomono(data, 2, 0.5, 0.5)
            data, state = audioop.ratecv(data, 2, 1, src.getframerate(), 16000, state)
            dst.writeframesraw(data)
    temporary.replace(target)


def recognize(wav_path, output, threads=4, offset=0, duration=0, beam=1, progress=None):
    args = [
        str(ENGINE),
        "-m",
        str(MODEL),
        "-f",
        str(wav_path),
        "-l",
        "zh",
        "-t",
        str(threads),
        "-ng",
        "-bs",
        str(beam),
        "-bo",
        str(beam),
        "-ojf",
        "-of",
        str(output) + ".pending",
    ]
    if offset:
        args += ["-ot", str(round(offset * 1000))]
    if duration:
        args += ["-d", str(round(duration * 1000))]
    if progress:
        args.append("-pp")
        progress(0)
    started = time.monotonic()
    with output.with_suffix(".log").open("w", encoding="utf-8") as log:
        with subprocess.Popen(
            args,
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            text=True,
            encoding="utf-8",
            errors="replace",
        ) as process:
            for line in process.stdout:
                log.write(line)
                match = re.search(r"^whisper_print_progress_callback: progress =\s*(\d+)%", line)
                if progress and match:
                    progress(min(100, int(match[1])))
            if process.wait():
                raise subprocess.CalledProcessError(process.returncode, args)
    elapsed = round(time.monotonic() - started, 2)
    output.with_suffix(".timing.json").write_text(
        json.dumps({"seconds": elapsed}), encoding="utf-8"
    )
    pending = Path(str(output) + ".pending.json")
    result = json.loads(pending.read_text(encoding="utf-8"))
    pending.replace(output.with_suffix(".json"))
    if progress:
        progress(100)
    return result


def transcribe(audio_path, threads, progress=None):
    digest = hashlib.sha256()
    with audio_path.open("rb") as source:
        for chunk in iter(lambda: source.read(1024 * 1024), b""):
            digest.update(chunk)
    digest.update(b"whisper-b4938-small-q5_1-zh-beam1")
    cache = ROOT / ".cache/lyric-flow" / digest.hexdigest()[:16]
    cache.mkdir(parents=True, exist_ok=True, mode=0o700)
    wav_path = cache / "audio.wav"
    if not wav_path.exists():
        prepare_wav(audio_path, wav_path)
    output = cache / "transcript"
    if output.with_suffix(".json").exists():
        print("重用本機辨識快取。", flush=True)
        result = json.loads(output.with_suffix(".json").read_text(encoding="utf-8"))
        if progress:
            progress("cached", 100)
    else:
        print("正在本機辨識，使用 4 執行緒設定時仍可能使 CPU 忙碌。", flush=True)
        callback = (lambda percent: progress("recognizing", percent)) if progress else None
        result = recognize(wav_path, output, threads, progress=callback)
    return result, wav_path, cache
