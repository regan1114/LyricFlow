"""Contract, normalization, independent known-lyrics API and cache regression tests."""

import io
import tempfile
import unittest
import wave
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch

from lyricflow.config import Settings
from lyricflow.factory import create_app
from lyricflow.timeline.attention import check_word_boundaries
from lyricflow.timeline.contract import TimelineError, to_srt, validate_project
from lyricflow.timeline.normalization import lyric_units
from lyricflow.timeline.pipeline import align_known
from lyricflow.validation import parse_job_input


def project():
    return {
        "version": "1.0.0",
        "mode": "known_lyrics",
        "duration": 40,
        "segments": [
            {
                "id": 1,
                "start": 14.7,
                "end": 19.9,
                "text": "月滿，歸來。",
                "words": [
                    {"text": "月滿，", "start": 14.7, "end": 16},
                    {"text": "歸來。", "start": 18, "end": 19.9},
                ],
            }
        ],
    }


class TimelineTests(unittest.TestCase):
    def test_long_instrumental_is_rejected_instead_of_stretched_into_a_sentence(self):
        words = [SimpleNamespace(start=23.7, end=26), SimpleNamespace(start=75.2, end=76)]
        with self.assertRaises(TimelineError) as caught:
            check_word_boundaries(words, "而我只剩一杯")
        self.assertEqual(caught.exception.data["code"], "ALIGNMENT_LONG_GAP")
        # Sustained notes remain valid; these limits do not allocate artificial timestamps.
        check_word_boundaries([SimpleNamespace(start=14.7, end=20.1)], "歸")

    def test_original_display_and_repeated_lyrics(self):
        original = " 月滿，歸來。 \n"
        job = parse_job_input(
            {"name": "song.wav", "size": 10, "lyrics": original, "mode": "known_lyrics"}
        )
        self.assertEqual(job.lyrics, original)
        lines = lyric_units(" 一江歸宋，千帆過盡。\n\n 一江歸宋，千帆過盡。")
        self.assertEqual(lines[0]["text"], " 一江歸宋，千帆過盡。")
        self.assertEqual(lines[0], lines[1])
        self.assertEqual("".join(u["text"] for u in lines[0]["units"]), lines[0]["text"])
        self.assertEqual("".join(u["normalized"] for u in lines[0]["units"]), "一江归宋千帆过尽")
        self.assertEqual(len(lyric_units("歸來。月滿！", False)), 2)

    def test_contract_and_srt(self):
        p = project()
        self.assertIn("00:00:14,700 --> 00:00:19,900", to_srt(p))
        self.assertIn(p["segments"][0]["text"], to_srt(p))
        p["segments"][0]["words"][1]["end"] = 30
        with self.assertRaises(TimelineError):
            validate_project(p)
        for value in (float("nan"), -1, True):
            p = project()
            p["duration"] = value
            with self.assertRaises(TimelineError):
                validate_project(p)

    def test_cache_changes_with_original_lyrics_and_segmentation(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            audio = root / "song.wav"
            with wave.open(str(audio), "wb") as wav:
                wav.setparams((1, 2, 16000, 0, "NONE", "not compressed"))
                wav.writeframes(bytes(40 * 16000 * 2))
            calls = []

            class Engine:
                def align(self, audio, lines, progress):
                    calls.append(lines)
                    p = project()
                    p["segments"][0].pop("words")
                    p["segments"][0]["text"] = lines[0]["text"]
                    return p

            for lyrics, preserve in [
                ("月滿。", True),
                ("月滿。", True),
                ("月滿！", True),
                ("月滿！", False),
            ]:
                align_known(
                    audio,
                    lyrics,
                    root / "out",
                    preserve,
                    engine=Engine(),
                    cache_root=root / "cache",
                )
            self.assertEqual(len(calls), 3)
            self.assertTrue((root / "out/lyrics.srt").is_file())

    def test_known_api_readiness_error_and_original_routes(self):
        with tempfile.TemporaryDirectory() as directory:
            app = create_app(
                Settings(root=Path(directory), jobs_directory=Path(directory) / "jobs")
            )
            client = app.test_client()
            base = "http://127.0.0.1:8080"
            try:
                response = client.get("/health", base_url=base)
                self.assertFalse(response.json["alignment"]["ready"])
                response = client.post(
                    "/lyrics/align",
                    data={"audio": (io.BytesIO(b"wav"), "song.wav"), "lyrics": "月滿。"},
                    base_url=base,
                )
                self.assertEqual(response.status_code, 503)
                self.assertEqual(response.json["code"], "ENGINE_UNAVAILABLE")
                self.assertIn("suggestion", response.json)
                for preserve in ["yes", "0"]:
                    response = client.post(
                        "/api/lyrics/align",
                        data={
                            "audio": (io.BytesIO(b"wav"), "song.wav"),
                            "lyrics": "月滿。",
                            "preserve_lines": preserve,
                        },
                        base_url=base,
                    )
                    self.assertEqual(response.status_code, 400)
                service = app.extensions["alignment_service"]
                with (
                    patch("lyricflow.routes.readiness", return_value={"ready": True}),
                    patch.object(service, "_start"),
                ):
                    response = client.post(
                        "/api/lyrics/align",
                        data={
                            "audio": (io.BytesIO(b"wav"), "song.wav"),
                            "lyrics": "月滿。",
                            "preserve_lines": "false",
                        },
                        base_url=base,
                    )
                    self.assertEqual(response.status_code, 202)
                    job = response.json
                    self.assertEqual(job["mode"], "known_lyrics")
                    self.assertFalse(job["preserve_lines"])
                    cancelled = client.post(f"/api/jobs/{job['id']}/cancel", base_url=base)
                    self.assertEqual(cancelled.json["status"], "cancelled")
            finally:
                app.extensions["alignment_service"].close()


if __name__ == "__main__":
    unittest.main()
