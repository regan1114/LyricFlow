"""Cached audio recognition must never reuse previously supplied lyric text."""

import json
import struct
import tempfile
import unittest
import wave
from pathlib import Path
from unittest.mock import patch

from lyricflow.pipeline import align_song
from lyricflow.recognition import prepare_wav


class AudioPreparationTests(unittest.TestCase):
    def test_pcm_widths_channels_and_rates_produce_the_same_16khz_mono_samples(self):
        # Exercises stdlib audioop on 3.12 and audioop-lts on 3.13+, including
        # unsigned 8-bit PCM and resampling state across one-second chunks.
        with tempfile.TemporaryDirectory() as directory:
            source = Path(directory) / "source.wav"
            target = Path(directory) / "prepared.wav"
            for width in (1, 2, 3, 4):
                for channels in (1, 2):
                    for rate in (8000, 44100, 48000):
                        with self.subTest(width=width, channels=channels, rate=rate):
                            amplitude = 1 << (width * 8 - 3)
                            values = (amplitude,) if channels == 1 else (amplitude, -amplitude)
                            frame = b"".join(
                                (value + 128 if width == 1 else value).to_bytes(
                                    width, "little", signed=width != 1
                                )
                                for value in values
                            )
                            frames = rate + 17
                            with wave.open(str(source), "wb") as wav:
                                wav.setparams((channels, width, rate, 0, "NONE", "not compressed"))
                                wav.writeframes(frame * frames)
                            prepare_wav(source, target)
                            with wave.open(str(target), "rb") as wav:
                                self.assertEqual(
                                    (wav.getnchannels(), wav.getsampwidth(), wav.getframerate()),
                                    (1, 2, 16000),
                                )
                                self.assertEqual(wav.getnframes(), (frames - 1) * 16000 // rate + 1)
                                samples = struct.iter_unpack("<h", wav.readframes(wav.getnframes()))
                                self.assertEqual(
                                    {sample for (sample,) in samples},
                                    {8192 if channels == 1 else 0},
                                )
                            self.assertFalse(target.with_name(target.name + ".partial").exists())


class RecognitionCacheTests(unittest.TestCase):
    def test_changed_lyrics_are_realigned_and_exported_with_cached_audio(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            audio = root / "song.wav"
            with wave.open(str(audio), "wb") as wav:
                wav.setparams((1, 2, 16000, 0, "NONE", "not compressed"))
                wav.writeframes(b"\0\0" * 16000 * 8)
            lyrics = root / "lyrics.txt"
            transcript = {
                "transcription": [
                    {"text": "春風吹過山河", "offsets": {"from": 1000, "to": 3000}},
                    {"text": "月光照著窗邊", "offsets": {"from": 4000, "to": 6000}},
                ]
            }

            def recognize(wav_path, output, threads, progress=None):
                output.with_suffix(".json").write_text(json.dumps(transcript), encoding="utf-8")
                return transcript

            with (
                patch("lyricflow.recognition.ROOT", root),
                patch("lyricflow.recognition.recognize", side_effect=recognize) as engine,
            ):
                lyrics.write_text("春風吹過山河\n月光照著窗邊", encoding="utf-8")
                first = align_song(audio, lyrics, root / "first", retry=False)
                # Same file name and audio, changed line boundaries and punctuation.
                lyrics.write_text("春風吹過\n山河\n月光照著窗邊！", encoding="utf-8")
                events = []
                second = align_song(
                    audio,
                    lyrics,
                    root / "second",
                    retry=False,
                    progress=lambda *args: events.append(args),
                )
                self.assertEqual(engine.call_count, 1)
                self.assertIn(("cached", 100), events)
                self.assertEqual(len(first), 2)
                self.assertEqual(
                    [row["text"] for row in second], ["春風吹過", "山河", "月光照著窗邊！"]
                )
                srt = (root / "second/song.draft.srt").read_text(encoding="utf-8-sig")
                self.assertIn("月光照著窗邊！", srt)
                self.assertNotIn("春風吹過山河", srt)
