# LyricFlow Windows

Windows compatibility revision of [regan1114/LyricFlow](https://github.com/regan1114/LyricFlow). See [UPSTREAM.md](UPSTREAM.md) for provenance and [SECURITY-REVIEW.md](SECURITY-REVIEW.md) for audit scope. Native Windows support is pending Windows CI/device verification.

[繁體中文](README.md) | **English**

Align songs with supplied lyrics and create SRT subtitles on your own computer.

## Why this project exists

LyricFlow helps creators make subtitles for songs without setting every timestamp by hand. Supply an audio file and the lyrics actually sung in it, then review and export the resulting timeline.
It accepts ordinary lyrics and Suno-style lyrics, runs on your local CPU, and requires no paid recognition service. After the initial installation, it can run offline.

- **Web interface:** upload a song, paste or import lyrics, preview individual lines, and download SRT.
- **Progress and cancellation:** see the current processing stage and stop a job when needed.
- **Retry missing lines:** recognize unmatched sections again while preserving existing and manually edited timestamps.
- **Timestamp editing:** adjust line boundaries, with checks for overlaps, reversed times, and audio duration.

The current interface is in Traditional Chinese, and recognition is configured for Chinese. Suno section markers such as `[Verse]` and `[Chorus]` are removed; sung text and repeated choruses are preserved.

## Native Windows x64 (pending verification)

Install Python 3.12 x64 with the `py` launcher and Visual Studio 2022 Build Tools with the Desktop development with C++ workload (MSVC v143 and Windows SDK). Extract a fresh source copy, run `setup-windows.cmd`, then `start-windows.cmd`. Do not reuse a macOS/WSL virtual environment or engine. Python 3.13+, ARM64 and 32-bit Windows are not supported by this installer. See the [Chinese README](README.md) for full troubleshooting instructions.

The macOS/Linux and WSL2 installation routes remain available alongside native Windows.

## Requirements

- **Python 3.9–3.12; 3.12 is recommended.** The current audio pipeline uses `audioop`, which was removed in Python 3.13, so Python 3.13 and later are not supported. [Python documentation](https://docs.python.org/3/library/audioop.html)
- **Windows x64, macOS or Linux**. Native Windows needs Visual Studio 2022 Build Tools; macOS/Linux need a C/C++ compiler and Make. This revision has passed Linux checks, while native Windows is pending CI/device verification. [WSL2](#windows-wsl2) remains an alternative.
- Internet access for the initial Python packages, whisper.cpp source, and model downloads.
- No GPU required. Processing uses four CPU threads by default, or two in economy mode.

On macOS, install the command-line build tools if needed:

```sh
xcode-select --install
```

On Linux, install your distribution's C/C++ build tools, Make, and the `venv` package matching your Python version.

## Installation

### macOS / Linux

Download or clone this repository and open a terminal in its root directory, where `app.py` is located. Check that `python3 --version` is within the supported range, then run:

```sh
python3 -m venv .venv
source .venv/bin/activate
python -m pip install --upgrade pip
python -m pip install -r requirements.txt -r requirements-build.txt
python scripts/setup.py
```

The setup script will:

1. Download a [pinned whisper.cpp revision](https://github.com/ggml-org/whisper.cpp/tree/371b5a7561823ab2bb32142d2751e35e7534727b), verify its SHA-256 checksum, and build the CPU engine.
2. Download and verify the multilingual `small` Q5_1 model, approximately 181 MiB.
3. Store the executable, model, and engine license in `.local/`, then remove temporary source and build files.

Running setup again keeps the installed engine and verifies the existing model. Use `python scripts/setup.py --rebuild` to rebuild the engine, or add `--jobs 1` to reduce compilation load.
CMake is only needed for building. You may remove it afterward with `python -m pip uninstall cmake`; reinstall `requirements-build.txt` before rebuilding.

### Windows (WSL2)

On Windows, install and run the project in Ubuntu 24.04 through WSL2. Recognition still runs on your own computer and can work offline after the initial installation.
These steps apply to Windows 11 or Windows 10 version 2004 (build 19041) and later. [Microsoft WSL installation guide](https://learn.microsoft.com/en-us/windows/wsl/install)

**1. Install WSL2 and Ubuntu**

Open **PowerShell as Administrator** and run:

```powershell
wsl --install -d Ubuntu-24.04
```

Restart Windows if prompted, then open **Ubuntu 24.04** from the Start menu and create a Linux username and password. You can also open Ubuntu from PowerShell with:

```powershell
wsl -d Ubuntu-24.04
```

**2. Install the required tools**

From this step onward, run all installation commands in the **Ubuntu terminal**:

```bash
sudo apt update
sudo apt install -y python3 python3-venv python3-pip build-essential
```

Ubuntu 24.04 provides Python 3.12 by default, which meets this project's requirements. [Ubuntu package information](https://packages.ubuntu.com/noble/python3)

**3. Copy the project source**

Download the source from GitHub and extract it to `C:\LyricFlow` on Windows, with `app.py` directly inside that folder.
If copying from another computer, bring only the source files. Exclude `.venv/`, `.local/`, and `.cache/`; the Python environment and recognition engine need to be installed again inside Ubuntu.

In Ubuntu, copy the project into your Linux home directory and enter it:

```bash
mkdir -p ~/LyricFlow
cp -r /mnt/c/LyricFlow/. ~/LyricFlow/
cd ~/LyricFlow
```

**4. Install the packages, recognition engine, and model**

```bash
python3 -m venv .venv
source .venv/bin/activate
python -m pip install --upgrade pip
python -m pip install -r requirements.txt -r requirements-build.txt
python scripts/setup.py --jobs 1
```

`--jobs 1` uses a single build job to reduce installation load. The setup script downloads and builds the CPU engine and downloads the model, approximately 181 MiB.

## Run and use

### macOS / Linux

With the virtual environment activated:

```sh
python app.py --open
```

Alternatively, run directly from the project root without activating the environment:

```sh
.venv/bin/python app.py --open
```

The browser opens **http://127.0.0.1:8765**. If it does not open automatically, visit that address manually. Keep the terminal open while using the app; press **Control+C** to stop it.

### Windows / WSL2

Each time you want to use the app, open the **Ubuntu terminal** and run:

```bash
cd ~/LyricFlow
.venv/bin/python app.py
```

Then open **http://127.0.0.1:8765** in **Chrome or Edge on Windows**. Windows can access a web service running inside WSL through the local address. [Microsoft WSL networking guide](https://learn.microsoft.com/en-us/windows/wsl/networking)
Keep the Ubuntu terminal open while using the app; press **Ctrl+C** to stop it.

### Web interface

1. Select a song: WAV, MP3, M4A, AAC, FLAC, or AIFF; up to 200 MB and 30 minutes.
2. Paste lyrics or import a UTF-8 `.txt` file, with one sung line per line, and click **開始對齊** (Align).
3. Preview and adjust the timestamps. For unmatched lines, click **補辨識漏句** (Retry missing lines).
4. Click **下載 SRT** (Download SRT) to export the current timestamps.

Lyrics are limited to 12,000 characters and text files to 64 KB. One song is processed at a time. Audio uploads and recognition stay on the local machine.
Progress percentages describe the current stage; recognition, retries, and export are separate stages.

### Command line

The CLI accepts PCM WAV audio. Use the web interface for other formats; the FFmpeg binary supplied by the Python dependency converts them locally.
Replace the example paths with your own files:

```sh
python lyric_flow.py /path/to/song.wav /path/to/lyrics.txt --threads 2 --output output
```

Outputs include `.draft.srt`, `.review.txt`, and `.alignment.json`. Add `--no-retry` to disable automatic missing-line retries during the initial alignment.

## Data and accuracy

- `.venv/` holds the local Python environment; `.local/` holds the engine and model. Both are excluded by `.gitignore`.
- `.cache/` stores uploaded materials, job results, and recognition caches. `output/` stores CLI exports. Private songs, lyrics, and generated results are not included in the repository.
- The browser remembers the last job and timestamp edits. Download your SRT to keep a copy; clearing the site's browser data removes those local edits.
- After stopping the server, you can delete `.cache/` and `output/`. Previous jobs will no longer be restorable, and future runs will need to recognize the audio again.
- Keep `.gitignore` when publishing and use `git status --short` to check that inputs, environments, credentials, and caches are excluded.

The timeline is produced by speech recognition and ordered lyric matching, rather than a dedicated singing forced-alignment model. Sustained notes, instrumental breaks, repeated sections, and accompaniment can affect the result.
`text_match_score` measures text similarity, not timing accuracy. Unmatched lines are left without timestamps. Preview automatic and retried timestamps before using the subtitles.

## Development and tests

After installation, add the development tools. Node.js 22 or later and npm are only needed for frontend checks, not for normal application use:

```sh
python -m pip install -r requirements-dev.txt
npm ci
python scripts/check.py
```

Checks cover Python formatting and linting, frontend behavior, the Flask backend, job management, and missing-line retries.
The test server uses a separate port and temporary job directory, and shuts down and removes test uploads when finished.
Seven integration tests requiring external song fixtures are skipped by default. See [ARCHITECTURE.md](ARCHITECTURE.md#開發與驗證) for fixture configuration (Traditional Chinese).

Project layout: `lyricflow/` contains the backend and alignment pipeline; `web/` the interface; `tests/` the tests; and `scripts/` the setup and checking tools.

## YouTube

Visit the [YouTube channel](https://www.youtube.com/@ReganOba) for more music.
