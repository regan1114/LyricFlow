import json
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

from scripts.package_storyboard import build_package

ROOT = Path(__file__).resolve().parent.parent


class StoryboardPackageTests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory()
        self.addCleanup(self.temporary.cleanup)
        self.folder = Path(self.temporary.name)
        self.images = self.folder / "images"
        self.images.mkdir()
        for name in ("001.png", "002.png"):
            (self.images / name).write_bytes(b"image placeholder for filename validation")
        self.lyrics = ["北風吹過", "烽火照山河", "北風吹過"]
        self.alignment = {
            "duration": 20,
            "lines": [
                {"line": i, "text": text, "start": start, "end": end, "status": "automatic"}
                for i, (text, start, end) in enumerate(zip(self.lyrics, (2, 6, 12), (4, 8, 15)), 1)
            ],
        }
        self.storyboard = [{"name": "001.png", "fromLine": 1}, {"name": "002.png", "fromLine": 3}]

    def build(self):
        return build_package(self.alignment, self.lyrics, self.storyboard, self.images)

    def test_all_lyrics_and_repeated_chorus_keep_original_times(self):
        arrangement, srt = self.build()
        self.assertEqual(arrangement["version"], 1)
        self.assertEqual(
            [cue["name"] for cue in arrangement["scenes"]], ["001.png", "001.png", "002.png"]
        )
        self.assertEqual([cue["content"] for cue in arrangement["scenes"]], self.lyrics)
        self.assertEqual(
            srt,
            "1\n00:00:02,000 --> 00:00:04,000\n北風吹過\n\n"
            "2\n00:00:06,000 --> 00:00:08,000\n烽火照山河\n\n"
            "3\n00:00:12,000 --> 00:00:15,000\n北風吹過\n",
        )
        self.assertTrue(
            all(
                set(cue) == {"name", "startTime", "endTime", "content"}
                for cue in arrangement["scenes"]
            )
        )

    def test_api_job_and_cli_alignment_produce_same_package(self):
        self.assertEqual(
            self.build(),
            build_package(
                {"status": "done", "result": self.alignment},
                self.lyrics,
                self.storyboard,
                self.images,
            ),
        )

    def test_missing_or_changed_lyric_is_not_silently_exported(self):
        for text in ("", "   ", None, "改寫的歌詞"):
            with self.subTest(text=text):
                self.alignment["lines"][1]["text"] = text
                with self.assertRaisesRegex(ValueError, "第 2 句"):
                    self.build()

    def test_unmatched_and_dropped_lines_block_export(self):
        self.alignment["lines"][1].update(start=None, end=None, status="unmatched")
        with self.assertRaisesRegex(ValueError, "尚未定位"):
            self.build()
        self.alignment["lines"].pop(1)
        with self.assertRaisesRegex(ValueError, "全部歌詞"):
            self.build()

    def test_overlap_short_out_of_bounds_and_nonfinite_times_block_export(self):
        for start, end in ((3, 7), (6, 6.049), (6, 21), (-1, 7), (6, float("nan"))):
            with self.subTest(start=start, end=end):
                self.alignment["lines"][1].update(start=start, end=end)
                with self.assertRaises(ValueError):
                    self.build()

    def test_invalid_anchors_or_missing_images_block_export(self):
        for storyboard in (
            [],
            [{"name": "001.png", "fromLine": 2}],
            self.storyboard + [{"name": "001.png", "fromLine": 3}],
            self.storyboard + [{"name": "001.png", "fromLine": 4}],
            [{"name": "001.PNG", "fromLine": 1}],
            [{"name": "../001.png", "fromLine": 1}],
        ):
            with self.subTest(storyboard=storyboard):
                with self.assertRaises(ValueError):
                    build_package(self.alignment, self.lyrics, storyboard, self.images)

    def test_cli_writes_utf8_package_and_preserves_existing_output(self):
        (self.folder / "alignment.json").write_text(json.dumps(self.alignment), encoding="utf-8")
        (self.folder / "storyboard.json").write_text(json.dumps(self.storyboard), encoding="utf-8")
        (self.folder / "suno.txt").write_text(
            "[Verse]\n" + "\n".join(self.lyrics), encoding="utf-8"
        )
        command = [
            sys.executable,
            "-m",
            "scripts.package_storyboard",
            "--alignment",
            str(self.folder / "alignment.json"),
            "--lyrics",
            str(self.folder / "suno.txt"),
            "--storyboard",
            str(self.folder / "storyboard.json"),
            "--output",
            str(self.folder),
        ]
        result = subprocess.run(command, cwd=ROOT, capture_output=True, text=True)
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertTrue((self.folder / "lyrics.srt").read_bytes().startswith(b"\xef\xbb\xbf"))
        self.assertEqual(
            json.loads((self.folder / "image-subtitles.json").read_text(encoding="utf-8")),
            self.build()[0],
        )
        (self.folder / "lyrics.srt").write_text("user edit", encoding="utf-8")
        result = subprocess.run(command, cwd=ROOT, capture_output=True, text=True)
        self.assertNotEqual(result.returncode, 0)
        self.assertEqual((self.folder / "lyrics.srt").read_text(encoding="utf-8"), "user edit")


if __name__ == "__main__":
    unittest.main()
