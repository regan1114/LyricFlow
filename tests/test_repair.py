"""Selective retry, preservation of manual timings and the HTTP retry contract."""

import copy
import json
import math
import tempfile
import unittest
import wave
from pathlib import Path
from unittest.mock import patch

from lyricflow.config import Settings
from lyricflow.errors import ValidationError
from lyricflow.factory import create_app
from lyricflow.repair import repair_missing, restore_offsets
from lyricflow.validation import parse_job_input, retry_rows
from tests.test_alignment import segment


def row(text, start=None, end=None):
    return {
        "line": 1,
        "text": text,
        "start": start,
        "end": end,
        "status": "review" if start is not None else "unmatched",
        "notes": [],
        "text_match_score": 1 if start is not None else 0,
    }


class RepairTests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory()
        self.directory = Path(self.temporary.name)
        self.audio = self.directory / "source.wav"
        with wave.open(str(self.audio), "wb") as audio:
            audio.setparams((1, 2, 16000, 0, "NONE", "not compressed"))
            audio.writeframes(b"\0\0" * 16000 * 60)

    def tearDown(self):
        self.temporary.cleanup()

    def test_recovers_consecutive_missing_lines_without_moving_existing_times(self):
        rows = [
            row("前文", 1, 3),
            row("春風"),
            row("吹來"),
            row("中段", 15, 17),
            row("星光"),
            row("結尾", 22, 24),
        ]
        rows[0]["edited"] = True
        original = copy.deepcopy(rows)
        events = []
        results = [
            {"transcription": [segment("春風吹來", 5)]},
            {"transcription": [segment("星光", 3)]},
        ]

        def decode(*args, **kwargs):
            for percent in (0, 50, 100):
                kwargs["progress"](percent)
            return results.pop(0)

        with patch("lyricflow.repair.recognize", side_effect=decode) as recognize:
            repaired = repair_missing(
                rows,
                self.audio,
                self.directory,
                60,
                progress=lambda *args, **kwargs: events.append((args, kwargs)),
            )
        self.assertEqual(recognize.call_count, 2)
        self.assertEqual(rows, original)
        for index in (0, 3, 5):
            self.assertEqual(repaired[index], original[index])
        self.assertEqual(
            [(repaired[i]["start"], repaired[i]["end"]) for i in (1, 2, 4)],
            [(6, 8), (8, 10), (18, 20)],
        )
        self.assertEqual([repaired[i]["line"] for i in (1, 2, 4)], [2, 3, 5])
        self.assertEqual(events[1][0], ("retrying", 50))
        self.assertEqual(events[-1][1]["total"], 2)

    def test_out_of_gap_candidate_is_not_used(self):
        rows = [row("前文", 0, 10), row("春風"), row("結尾", 20, 22)]
        raw = {"transcription": [segment("春風", 0)]}  # Global 8–10 overlaps the existing line.
        with patch("lyricflow.repair.recognize", return_value=raw):
            repaired = repair_missing(rows, self.audio, self.directory, 60)
        self.assertEqual(repaired, rows)

    def test_all_missing_and_unrecognized_lines_remain_explicit(self):
        rows = [row("春風"), row("星光")]
        with patch("lyricflow.repair.recognize", return_value={"transcription": []}):
            self.assertEqual(repair_missing(rows, self.audio, self.directory, 60), rows)

    def test_manual_retry_is_not_limited_to_three_lines(self):
        rows = []
        for index in range(5):
            rows += [row("前文", index * 10, index * 10 + 2), row("漏句")]
        with patch("lyricflow.repair.recognize", return_value={"transcription": []}) as decode:
            repair_missing(rows, self.audio, self.directory, 60)
        self.assertEqual(decode.call_count, 5)

    def test_unknown_token_offsets_stay_unknown(self):
        transcription = [
            {"offsets": {"from": 0, "to": 1000}, "tokens": [{"offsets": {"from": -1, "to": -1}}]}
        ]
        restore_offsets(transcription, 10000)
        self.assertEqual(transcription[0]["offsets"], {"from": 10000, "to": 11000})
        self.assertEqual(transcription[0]["tokens"][0]["offsets"]["from"], -1)


class RetryApiTests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory()
        self.app = create_app(Settings(jobs_directory=Path(self.temporary.name)))
        self.service = self.app.extensions["alignment_service"]
        self.client = self.app.test_client()
        self.rows = [row("前文", 0, 3), row("漏句"), row("結尾", 10, 12)]
        self.original = self.service.create(
            parse_job_input(
                {
                    "name": "song.wav",
                    "size": 20,
                    "lyrics": "前文\n漏句\n結尾",
                }
            )
        )
        self.identity = self.original["id"]
        folder = self.service.store.folder(self.identity)
        (folder / "source.wav").write_bytes(b"X" * 20)
        self.service.store.update(
            self.identity, status="done", result={"lines": self.rows, "duration": 20}
        )
        self.original = self.service.get(self.identity)
        self.start = patch.object(self.service, "_start")
        self.start.start()

    def tearDown(self):
        self.start.stop()
        self.service.close()
        self.temporary.cleanup()

    def post(self, data):
        return self.client.post(
            f"/api/jobs/{self.identity}/retry", json=data, base_url="http://127.0.0.1:8765"
        )

    def test_retry_creates_separate_job_and_keeps_manual_edits(self):
        response = self.post(
            {
                "timings": [
                    {"start": 0.5, "end": 2.5},
                    {"start": None, "end": None},
                    {"start": 10, "end": 12},
                ]
            }
        )
        self.assertEqual(response.status_code, 202)
        job = response.json
        self.assertNotEqual(job["id"], self.identity)
        self.assertEqual(job["retry_of"], self.identity)
        self.assertEqual(job["retry_missing_count"], 1)
        folder = self.service.store.folder(job["id"])
        data = json.loads((folder / "retry-input.json").read_text(encoding="utf-8"))
        self.assertEqual(data["lines"][0]["start"], 0.5)
        self.assertTrue(data["lines"][0]["edited"])
        self.assertEqual(data["lines"][2], self.rows[2])
        self.service.cancel(job["id"])
        self.assertEqual(self.service.get(self.identity), self.original)
        self.assertEqual((folder / "source.wav").read_bytes(), b"X" * 20)

    def test_busy_retries_share_the_existing_job_limit(self):
        active = self.post({}).json
        response = self.post({})
        self.assertEqual(response.status_code, 409)
        self.assertEqual(response.json["job_id"], active["id"])

    def test_invalid_edits_fail_before_creating_a_job(self):
        invalid_timings = [
            {"start": 3, "end": None},
            {"start": True, "end": 5},
            {"start": 11, "end": 15},
            {"start": -1, "end": 5},
            {"start": 3, "end": 21},
            {"start": 6, "end": 5},
        ]
        for value in invalid_timings:
            with self.subTest(value=value):
                response = self.post(
                    {
                        "timings": [
                            {"start": 0, "end": 3},
                            value,
                            {"start": 10, "end": 12},
                        ]
                    }
                )
                self.assertEqual(response.status_code, 400)
        self.assertEqual(self.post({"timings": []}).status_code, 400)
        self.assertEqual(self.post({"lyrics": "不允許換歌詞"}).status_code, 400)
        self.assertEqual(len(list(Path(self.temporary.name).iterdir())), 1)

    def test_valid_completed_timings_have_nothing_to_retry(self):
        response = self.post(
            {
                "timings": [
                    {"start": 0, "end": 3},
                    {"start": 4, "end": 6},
                    {"start": 10, "end": 12},
                ]
            }
        )
        self.assertEqual(response.status_code, 400)
        self.assertIn("沒有未定位", response.json["error"])

    def test_nonfinite_times_are_rejected(self):
        for value in (math.nan, math.inf):
            with self.assertRaises(ValidationError):
                retry_rows({"timings": [{"start": value, "end": 3}]}, [row("漏句")], 20)
