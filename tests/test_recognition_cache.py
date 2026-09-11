"""Cached audio recognition must never reuse previously supplied lyric text."""

import json
import tempfile
import unittest
import wave
from pathlib import Path
from unittest.mock import patch

from lyricflow.pipeline import align_song


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
