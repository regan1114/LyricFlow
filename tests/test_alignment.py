import tempfile
import unittest
from pathlib import Path

from lyricflow.alignment import align_lines, sequence_map
from lyricflow.lyrics import read_lyrics
from lyricflow.subtitles import srt_timestamp


def segment(text, start):
    return {
        "text": text,
        "offsets": {"from": start * 1000, "to": (start + len(text)) * 1000},
        "tokens": [
            {
                "text": c,
                "id": 1,
                "offsets": {"from": (start + i) * 1000, "to": (start + i + 1) * 1000},
            }
            for i, c in enumerate(text)
        ],
    }


class AlignmentTests(unittest.TestCase):
    def test_suno_directions_and_original_text(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "lyrics.txt"
            path.write_text(
                "[Intro]\n[Low Strings, War Drums]\n\n微風吹過，樹影輕搖\n（一起出發）\n",
                encoding="utf-8",
            )
            self.assertEqual(read_lyrics(path), ["微風吹過，樹影輕搖", "（一起出發）"])

    def test_empty_lyrics_fail(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "lyrics.txt"
            path.write_text("[Instrumental]\n")
            with self.assertRaises(ValueError):
                read_lyrics(path)

    def test_merged_recognition_is_split_at_lyric_boundaries(self):
        rows = align_lines(["清晨的微風", "窗邊的樹影"], [segment("清晨的微風窗邊的樹影", 10)], 30)
        self.assertEqual([(r["start"], r["end"]) for r in rows], [(10, 15), (15, 20)])

    def test_repeated_choruses_follow_audio_order(self):
        raw = [segment("山河", 1), segment("北風", 5), segment("山河", 9), segment("回家", 13)]
        rows = align_lines(["山河", "北風", "山河", "回家"], raw, 20)
        self.assertEqual([r["start"] for r in rows], [1, 5, 9, 13])

    def test_missing_line_keeps_later_lines_in_place(self):
        rows = align_lines(["春風", "銀針", "山河"], [segment("春風", 0), segment("山河", 10)], 20)
        self.assertIsNone(rows[1]["start"])
        self.assertEqual(rows[2]["start"], 10)

    def test_homophones_and_simplified_chinese(self):
        rows = align_lines(["晨光灑落"], [segment("晨光撒落", 3)], 10)
        self.assertEqual(rows[0]["start"], 3)
        self.assertGreater(rows[0]["text_match_score"], 0.8)
        self.assertEqual(rows[0]["text"], "晨光灑落")

    def test_mixed_latin_text_keeps_character_indices(self):
        mapping = sequence_map("hello山河", "hello山河")
        self.assertEqual(mapping[6], (6, 1.0))

    def test_srt_rounding_carries_to_next_minute(self):
        self.assertEqual(srt_timestamp(59.9996), "00:01:00,000")


if __name__ == "__main__":
    unittest.main()
