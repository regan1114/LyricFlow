#!/usr/bin/env python3
"""Install the pinned CPU engine and model into the ignored .local directory."""

import argparse
import hashlib
import platform
import shutil
import subprocess
import sys
import tarfile
import tempfile
from pathlib import Path
from urllib.request import Request, urlopen

ROOT = Path(__file__).resolve().parent.parent
WHISPER_COMMIT = "371b5a7561823ab2bb32142d2751e35e7534727b"
SOURCE_URL = f"https://codeload.github.com/ggml-org/whisper.cpp/tar.gz/{WHISPER_COMMIT}"
SOURCE_SHA256 = "89051d8fca516a3ad1f5c2f8f9d2fccb089afbaec338fca3f8731999babc6f81"
MODEL_NAME = "ggml-small-q5_1.bin"
MODEL_URL = f"https://huggingface.co/ggerganov/whisper.cpp/resolve/main/{MODEL_NAME}"
MODEL_SHA256 = "ae85e4a935d7a567bd102fe55afc16bb595bdb618e11b2fc7591bc08120411bb"


def sha256(path):
    digest = hashlib.sha256()
    with path.open("rb") as source:
        for chunk in iter(lambda: source.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def download_verified(url, target, expected):
    if target.is_file() and sha256(target) == expected:
        print(f"Already installed: {target.name}", flush=True)
        return
    target.parent.mkdir(parents=True, exist_ok=True)
    temporary = target.with_name(target.name + ".partial")
    print(f"Downloading {target.name}…", flush=True)
    try:
        request = Request(url, headers={"User-Agent": "Lyric-Flow-Setup"})
        with urlopen(request, timeout=60) as response, temporary.open("wb") as output:
            shutil.copyfileobj(response, output, 1024 * 1024)
        if sha256(temporary) != expected:
            raise RuntimeError(f"SHA-256 verification failed: {target.name}")
        temporary.replace(target)
    finally:
        temporary.unlink(missing_ok=True)


def extract_source(archive_path, destination):
    with tarfile.open(archive_path) as archive:
        members = archive.getmembers()
        for member in members:
            path = (destination / member.name).resolve()
            if destination.resolve() not in path.parents or not (member.isfile() or member.isdir()):
                raise RuntimeError("Unsafe source archive entry")
        archive.extractall(destination, members=members)
    return destination / f"whisper.cpp-{WHISPER_COMMIT}"


def install_engine(local, jobs, rebuild=False):
    windows = sys.platform == "win32"
    executable = "whisper-cli.exe" if windows else "whisper-cli"
    engine = local / "bin" / executable
    if engine.is_file() and not rebuild:
        subprocess.run([str(engine), "--help"], check=True, capture_output=True)
        print("CPU engine is already installed.", flush=True)
        return
    bundled_cmake = Path(sys.executable).parent / ("cmake.exe" if windows else "cmake")
    cmake = str(bundled_cmake) if bundled_cmake.is_file() else shutil.which("cmake")
    if not cmake:
        raise RuntimeError("Install build tools: python -m pip install -r requirements-build.txt")
    with tempfile.TemporaryDirectory(prefix="lyric-flow-build-") as temporary:
        directory = Path(temporary)
        archive = directory / "whisper.cpp.tar.gz"
        download_verified(SOURCE_URL, archive, SOURCE_SHA256)
        source = extract_source(archive, directory)
        build = directory / "build"
        if windows:
            # Explicit generator avoids an accidental MinGW/MSVC mix. VS discovers
            # the compiler without requiring a Developer Command Prompt.
            platform_args = [
                "-G",
                "Visual Studio 17 2022",
                "-A",
                "x64",
                "-DCMAKE_POLICY_DEFAULT_CMP0091=NEW",
                "-DCMAKE_MSVC_RUNTIME_LIBRARY=MultiThreaded",
                "-DGGML_NATIVE=OFF",
            ]
        else:
            # Keep local build paths out of the packaged executable. Quote the map
            # because CMake splits flags and temporary paths can contain spaces.
            flags = f'"-ffile-prefix-map={directory}=lyric-flow-build"'
            platform_args = [f"-DCMAKE_C_FLAGS={flags}", f"-DCMAKE_CXX_FLAGS={flags}"]
        subprocess.run(
            [
                cmake,
                "-S",
                str(source),
                "-B",
                str(build),
                "-DCMAKE_BUILD_TYPE=Release",
                "-DBUILD_SHARED_LIBS=OFF",
                "-DWHISPER_BUILD_TESTS=OFF",
                "-DGGML_METAL=OFF",
                "-DWHISPER_COREML=OFF",
                "-DGGML_OPENMP=OFF",
                *platform_args,
            ],
            check=True,
        )
        subprocess.run(
            [
                cmake,
                "--build",
                str(build),
                "--config",
                "Release",
                "--target",
                "whisper-cli",
                "--parallel",
                str(jobs),
            ],
            check=True,
        )
        candidates = [build / "bin" / "Release" / executable, build / "bin" / executable]
        binary = next((path for path in candidates if path.is_file()), None)
        if binary is None:
            raise RuntimeError(f"Build did not produce {executable}")
        subprocess.run([str(binary), "--help"], check=True, capture_output=True)
        engine.parent.mkdir(parents=True, exist_ok=True)
        staged = engine.with_name(executable + ".partial")
        shutil.copy2(binary, staged)
        staged.replace(engine)
        licenses = local / "licenses"
        licenses.mkdir(exist_ok=True)
        shutil.copyfile(source / "LICENSE", licenses / "whisper.cpp.txt")
    print("CPU engine installed; temporary source and build files removed.", flush=True)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--jobs", type=int, choices=range(1, 9), default=2, metavar="1–8")
    parser.add_argument("--rebuild", action="store_true", help="rebuild the installed CPU engine")
    args = parser.parse_args()
    if not (3, 9) <= sys.version_info[:2] < (3, 13):
        parser.error("Use Python 3.9–3.12 (3.12 recommended); audioop was removed in 3.13.")
    if sys.platform not in ("darwin", "win32") and not sys.platform.startswith("linux"):
        parser.error("Use macOS, Linux, or Windows x64.")
    if sys.platform == "win32" and (
        platform.machine().lower() not in ("amd64", "x86_64") or sys.maxsize <= 2**32
    ):
        parser.error("Native Windows requires x64 Windows and 64-bit Python; use WSL2 otherwise.")
    try:
        install_engine(ROOT / ".local", args.jobs, args.rebuild)
        download_verified(MODEL_URL, ROOT / ".local/models" / MODEL_NAME, MODEL_SHA256)
    except (OSError, RuntimeError, subprocess.CalledProcessError) as error:
        raise SystemExit(f"Setup failed: {error}") from error
    print("Ready. Start the app with: python app.py --open")


if __name__ == "__main__":
    main()
