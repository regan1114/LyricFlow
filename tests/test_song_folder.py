import json
import tempfile
import unittest
from pathlib import Path

from scripts.prepare_song_folder import prepare_folder


class SongFolderTests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory()
        self.addCleanup(self.temporary.cleanup)
        self.folder = Path(self.temporary.name)
        # Preparation validates metadata; the alignment service decodes the real audio later.
        self.audio = self.folder / "我的歌曲.MP3"
        self.audio.write_bytes(b"audio metadata fixture")
        self.lyrics = self.folder / "歌詞.txt"
        self.raw = "[Verse]\n北風吹過\n[Chorus]\n烽火照山河\n北風吹過\n".encode("utf-8-sig")
        self.lyrics.write_bytes(self.raw)

    def test_prepares_original_lyrics_and_ordered_index_without_fake_deliverables(self):
        (self.folder / "放檔說明.md").write_text("使用說明", encoding="utf-8")
        (self.folder / "參考").mkdir()
        (self.folder / "參考" / "舊版.mp3").write_bytes(b"old audio")
        output, source = prepare_folder(self.folder)
        self.assertEqual(source["lyricCount"], 3)
        self.assertIsNone(source["albumTitle"])
        self.assertEqual(Path(source["audio"]), self.audio.resolve())
        self.assertEqual((output / "suno-lyrics.txt").read_bytes(), self.raw)
        self.assertEqual(self.lyrics.read_bytes(), self.raw)
        self.assertEqual(self.audio.read_bytes(), b"audio metadata fixture")
        self.assertEqual(
            json.loads((output / "lyrics-index.json").read_text(encoding="utf-8")),
            [
                {"line": 1, "text": "北風吹過"},
                {"line": 2, "text": "烽火照山河"},
                {"line": 3, "text": "北風吹過"},
            ],
        )
        self.assertEqual(
            sorted(path.name for path in output.iterdir()),
            [
                "PROGRESS.md",
                "cover",
                "images",
                "lyrics-index.json",
                "source.json",
                "suno-lyrics.txt",
            ],
        )
        self.assertEqual(list((output / "images").iterdir()), [])
        self.assertEqual(list((output / "cover").iterdir()), [])

    def test_optional_album_title_is_not_mistaken_for_lyrics(self):
        (self.folder / "專輯名稱.txt").write_text("\ufeff北風與山河\n", encoding="utf-8")
        output, source = prepare_folder(self.folder)
        self.assertEqual(source["albumTitle"], "北風與山河")
        self.assertEqual(json.loads((output / "source.json").read_text(encoding="utf-8")), source)

    def test_existing_output_is_preserved(self):
        output, _ = prepare_folder(self.folder)
        cover = output / "cover" / "album-cover.png"
        cover.write_bytes(b"existing cover")
        progress = output / "PROGRESS.md"
        progress.write_text("使用者指定水墨風格；已完成分鏡 001。", encoding="utf-8")
        with self.assertRaisesRegex(ValueError, "output 已存在"):
            prepare_folder(self.folder)
        self.assertEqual(cover.read_bytes(), b"existing cover")
        self.assertEqual((output / "suno-lyrics.txt").read_bytes(), self.raw)
        self.assertEqual(
            progress.read_text(encoding="utf-8"), "使用者指定水墨風格；已完成分鏡 001。"
        )

    def test_ambiguous_audio_or_lyrics_does_not_create_output(self):
        for name in ("另一版.wav", "另一份歌詞.txt"):
            with self.subTest(name=name):
                extra = self.folder / name
                extra.write_bytes(b"extra input")
                with self.assertRaisesRegex(ValueError, "有且僅有"):
                    prepare_folder(self.folder)
                self.assertFalse((self.folder / "output").exists())
                extra.unlink()

    def test_missing_audio_does_not_create_output(self):
        self.audio.unlink()
        with self.assertRaisesRegex(ValueError, "0 首音檔"):
            prepare_folder(self.folder)
        self.assertFalse((self.folder / "output").exists())

    def test_invalid_lyrics_do_not_create_output(self):
        for raw in (b"", b"[Instrumental]", b"\xff", ("風\n" * 501).encode("utf-8")):
            with self.subTest(raw=raw[:20]):
                self.lyrics.write_bytes(raw)
                with self.assertRaises(ValueError):
                    prepare_folder(self.folder)
                self.assertFalse((self.folder / "output").exists())

    def test_empty_or_multiline_album_title_does_not_create_output(self):
        for title in (" ", "第一個名稱\n第二個名稱"):
            with self.subTest(title=title):
                (self.folder / "專輯名稱.txt").write_text(title, encoding="utf-8")
                with self.assertRaisesRegex(ValueError, "單行、非空白"):
                    prepare_folder(self.folder)
                self.assertFalse((self.folder / "output").exists())


if __name__ == "__main__":
    unittest.main()
