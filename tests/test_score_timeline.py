"""Regression tests for manually reviewed timeline scoring."""

import json
import tempfile
import unittest
from pathlib import Path

from scripts.score_timeline import BenchmarkError, dataset_cases, prediction_runs, score_run


def project():
    return {
        "version": "1.0.0",
        "mode": "known_lyrics",
        "duration": 4,
        "segments": [
            {
                "id": 1,
                "start": 1,
                "end": 2,
                "text": "月滿",
                "words": [
                    {"text": "月", "start": 1, "end": 1.5},
                    {"text": "滿", "start": 1.5, "end": 2},
                ],
            }
        ],
    }


class TimelineScoringTests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory()
        self.root = Path(self.temporary.name)
        self.dataset = self.root / "dataset"
        case_folder = self.dataset / "cases" / "song-01"
        case_folder.mkdir(parents=True)
        (case_folder / "audio.wav").write_bytes(b"benchmark audio placeholder")
        (case_folder / "lyrics.txt").write_text("月滿\n", encoding="utf-8")
        (case_folder / "reference.json").write_text(
            json.dumps(project(), ensure_ascii=False), encoding="utf-8"
        )
        (self.dataset / "manifest.json").write_text(
            json.dumps(
                {
                    "version": 1,
                    "cases": [
                        {
                            "id": "song-01",
                            "audio": "cases/song-01/audio.wav",
                            "lyrics": "cases/song-01/lyrics.txt",
                            "reference": "cases/song-01/reference.json",
                            "preserve_lines": True,
                            "tags": ["ballad", "long-instrumental"],
                        }
                    ],
                },
                ensure_ascii=False,
            ),
            encoding="utf-8",
        )
        self.cases = dataset_cases(self.dataset)
        self.predictions = self.root / "predictions"
        self.predictions.mkdir()

    def tearDown(self):
        self.temporary.cleanup()

    def write_prediction(self, value, run="original"):
        folder = self.predictions / run
        folder.mkdir(exist_ok=True)
        path = folder / "song-01.json"
        path.write_text(json.dumps(value, ensure_ascii=False), encoding="utf-8")
        return path

    def report(self, run="original"):
        return next(item for item in prediction_runs(self.predictions) if item[0] == run)

    def test_perfect_prediction_scores_zero_error_and_groups_by_tag(self):
        self.write_prediction(project())

        name, folder = self.report()
        result = score_run(name, folder, self.cases)

        self.assertEqual(result["overall"]["successful_case_rate"], 1)
        self.assertEqual(result["overall"]["segment_coverage"], 1)
        self.assertEqual(result["overall"]["exact_text_rate"], 1)
        self.assertEqual(result["overall"]["sentence_boundaries"]["mae_seconds"], 0)
        self.assertEqual(result["overall"]["word_boundaries"]["mae_seconds"], 0)
        self.assertEqual(result["by_tag"]["ballad"]["cases"], 1)
        self.assertEqual(result["by_tag"]["long-instrumental"]["cases"], 1)

    def test_shifted_boundaries_report_absolute_errors_and_tolerance_rates(self):
        predicted = project()
        segment = predicted["segments"][0]
        segment["start"] += 0.4
        segment["end"] += 0.4
        for word in segment["words"]:
            word["start"] += 0.4
            word["end"] += 0.4
        self.write_prediction(predicted)

        name, folder = self.report()
        result = score_run(name, folder, self.cases)["overall"]

        self.assertEqual(result["sentence_boundaries"]["mae_seconds"], 0.4)
        self.assertEqual(result["sentence_boundaries"]["p90_seconds"], 0.4)
        self.assertEqual(result["sentence_boundaries"]["within_0_25_seconds"], 0)
        self.assertEqual(result["sentence_boundaries"]["within_0_5_seconds"], 1)
        self.assertEqual(result["word_boundaries"]["mae_seconds"], 0.4)

    def test_missing_prediction_counts_as_failed_case_and_zero_coverage(self):
        folder = self.predictions / "original"
        folder.mkdir()

        run = score_run("original", folder, self.cases)

        self.assertEqual(run["overall"]["successful_case_rate"], 0)
        self.assertEqual(run["overall"]["segment_coverage"], 0)
        self.assertEqual(run["cases"][0]["error"], "找不到預測檔案。")

    def test_text_mismatch_fails_case_and_is_excluded_from_timing_errors(self):
        predicted = project()
        predicted["segments"][0]["text"] = "月滿呀"
        predicted["segments"][0]["words"] = [{"text": "月滿呀", "start": 1, "end": 2}]
        self.write_prediction(predicted)

        name, folder = self.report()
        run = score_run(name, folder, self.cases)

        self.assertEqual(run["overall"]["successful_case_rate"], 0)
        self.assertEqual(run["overall"]["segment_coverage"], 1)
        self.assertEqual(run["overall"]["exact_text_rate"], 0)
        self.assertEqual(run["overall"]["sentence_boundaries"]["count"], 0)
        self.assertEqual(run["cases"][0]["error"], "有 1 段字幕文字與標註不一致。")

    def test_word_boundary_scoring_requires_matching_tokenization(self):
        predicted = project()
        predicted["segments"][0]["words"] = [{"text": "月滿", "start": 1, "end": 2}]
        self.write_prediction(predicted)

        name, folder = self.report()
        result = score_run(name, folder, self.cases)["overall"]

        self.assertEqual(result["word_coverage"], 0)
        self.assertEqual(result["word_boundaries"]["count"], 0)
        self.assertEqual(result["sentence_boundaries"]["count"], 2)

    def test_reference_must_match_the_recorded_input_lyrics(self):
        lyrics = self.dataset / "cases/song-01/lyrics.txt"
        lyrics.write_text("月亮\n", encoding="utf-8")

        with self.assertRaisesRegex(BenchmarkError, "逐句符合"):
            dataset_cases(self.dataset)

    def test_prediction_directories_are_separate_runs(self):
        self.write_prediction(project(), "original")
        self.write_prediction(project(), "demucs")

        self.assertEqual(
            [name for name, _ in prediction_runs(self.predictions)], ["demucs", "original"]
        )


if __name__ == "__main__":
    unittest.main()
