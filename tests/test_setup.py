"""Installer checks for corrupted downloads and unsafe archive contents."""

import hashlib
import io
import tarfile
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from scripts.setup import WHISPER_COMMIT, download_verified, extract_source, install_engine


class SetupTests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory()
        self.directory = Path(self.temporary.name)

    def tearDown(self):
        self.temporary.cleanup()

    def test_download_verification_keeps_previous_file_on_failure(self):
        target = self.directory / "model.bin"
        target.write_bytes(b"previous file")
        with patch("scripts.setup.urlopen", return_value=io.BytesIO(b"corrupt data")):
            with self.assertRaisesRegex(RuntimeError, "SHA-256"):
                download_verified("https://example.invalid/model", target, "0" * 64)
        self.assertEqual(target.read_bytes(), b"previous file")
        self.assertFalse(target.with_name("model.bin.partial").exists())

    def test_verified_download_can_be_reused_without_network(self):
        target = self.directory / "model.bin"
        data = b"verified model fixture"
        checksum = hashlib.sha256(data).hexdigest()
        with patch("scripts.setup.urlopen", return_value=io.BytesIO(data)) as fetch:
            download_verified("https://example.invalid/model", target, checksum)
            download_verified("https://example.invalid/model", target, checksum)
        self.assertEqual(fetch.call_count, 1)
        self.assertEqual(target.read_bytes(), data)

    def test_archive_rejects_traversal_and_links_before_extracting(self):
        for name, kind in [("../outside", tarfile.REGTYPE), ("source/link", tarfile.SYMTYPE)]:
            with self.subTest(name=name):
                archive_path = self.directory / "source.tar.gz"
                with tarfile.open(archive_path, "w:gz") as archive:
                    entry = tarfile.TarInfo(name)
                    entry.type = kind
                    entry.linkname = "../../outside" if kind == tarfile.SYMTYPE else ""
                    archive.addfile(entry)
                with self.assertRaisesRegex(RuntimeError, "Unsafe"):
                    extract_source(archive_path, self.directory / "extracted")
                self.assertFalse((self.directory / "extracted").exists())

    def test_safe_archive_extracts_into_the_expected_source_directory(self):
        archive_path = self.directory / "source.tar.gz"
        with tarfile.open(archive_path, "w:gz") as archive:
            data = b"source fixture"
            entry = tarfile.TarInfo(f"whisper.cpp-{WHISPER_COMMIT}/CMakeLists.txt")
            entry.size = len(data)
            archive.addfile(entry, io.BytesIO(data))
        source = extract_source(archive_path, self.directory / "extracted")
        self.assertEqual((source / "CMakeLists.txt").read_bytes(), data)

    def test_windows_build_installs_release_exe_and_reuses_it(self):
        source = self.directory / "source"
        source.mkdir()
        (source / "LICENSE").write_text("engine license", encoding="utf-8")
        calls = []

        def command(args, **kwargs):
            calls.append(args)
            if "--build" in args:
                output = Path(args[args.index("--build") + 1]) / "bin/Release/whisper-cli.exe"
                output.parent.mkdir(parents=True)
                output.write_bytes(b"test executable")

        local = self.directory / "Windows 中文 space" / ".local"
        with (
            patch("scripts.setup.sys.platform", "win32"),
            patch("scripts.setup.shutil.which", return_value="cmake.exe"),
            patch("scripts.setup.download_verified"),
            patch("scripts.setup.extract_source", return_value=source),
            patch("scripts.setup.subprocess.run", side_effect=command),
        ):
            install_engine(local, 1)
            install_engine(local, 1)
        self.assertEqual((local / "bin/whisper-cli.exe").read_bytes(), b"test executable")
        configure = next(args for args in calls if "-S" in args)
        self.assertIn("Visual Studio 17 2022", configure)
        self.assertIn("-DCMAKE_MSVC_RUNTIME_LIBRARY=MultiThreaded", configure)
        self.assertFalse(any("ffile-prefix-map" in arg for arg in configure))
        builds = [args for args in calls if "--build" in args]
        self.assertEqual(len(builds), 1)
        self.assertEqual(builds[0][builds[0].index("--config") + 1], "Release")
        self.assertEqual(calls[-1], [str(local / "bin/whisper-cli.exe"), "--help"])

    def test_windows_readiness_requires_the_windows_executable(self):
        from lyricflow.config import Settings, engine_path

        model = self.directory / ".local/models/ggml-small-q5_1.bin"
        model.parent.mkdir(parents=True)
        model.write_bytes(b"fixture")
        bin_dir = self.directory / ".local/bin"
        bin_dir.mkdir()
        (bin_dir / "whisper-cli").write_bytes(b"not a Windows executable")
        with patch("lyricflow.config.sys.platform", "win32"):
            settings = Settings(root=self.directory)
            self.assertFalse(settings.ready)
            engine_path(self.directory).write_bytes(b"fixture exe")
            self.assertTrue(settings.ready)
