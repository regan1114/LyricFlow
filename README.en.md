# LyricFlow | Lyric Timing and Music Video Creation

[繁體中文](README.md) | **English**

Turn songs, lyrics, images and video into music videos. LyricFlow combines a subtitle timeline, manual timing, music visualization, scene effects and video export. Install the local service to add automatic recognition and alignment against supplied lyrics.

**[Open the online editor](https://lyric-flow-seven.vercel.app/)** · [Quick start](#quick-start) · [Local installation](#local-installation) · [Song-folder workflow](#create-assets-from-a-song-folder) · [FAQ](#faq) · [Documentation](#documentation)

> The online edition supports media editing, manual timing and video export. **Automatic recognition and lyric alignment require the local Python service and the corresponding models.**

The visual editor builds on the tool provided by **[考拉醬 | 謎謎之音](https://www.youtube.com/@meme-koala)**. Special thanks for sharing it.

## Choose an edition

| Edition                                                 | Use it for                                                       | Installation                                    |
| ------------------------------------------------------- | ---------------------------------------------------------------- | ----------------------------------------------- |
| [Online](https://lyric-flow-seven.vercel.app/)          | Subtitle editing, manual timing and video creation               | None                                            |
| [Local frontend only](#local-frontend-only)             | Running the same visual editor on your computer                  | Node.js                                         |
| [Local service](#local-recognition-and-lyric-alignment) | Recognition, alignment against correct lyrics or API integration | Node.js, Python and the required engines/models |

All editions support media import, timeline editing, scenes, project saving and video export. The online edition edits, previews and exports media in the browser without sending songs to a Python recognition service.

## Features

- **Subtitles and timing:** import SRT/LRC/TXT/Timeline JSON, edit lines, search and replace, mark timing manually, select and move multiple cues, and undo/redo.
- **Media timeline:** arrange images, video and multiple audio tracks; move, trim, split and duplicate clips; adjust volume and link subtitle movement.
- **Image subtitles:** use image filenames, timestamps and lyrics to build a storyboard covering intros, instrumental gaps and outros.
- **Music visualization:** spectrum, waveform, orb and vinyl displays, transitions and immersive scenes; 16:9, 1:1 and 9:16 layouts, Chinese fonts, logos, overlays and chroma key.
- **Saving and export:** browser drafts, `.resonance` projects containing media, SRT/LRC/Timeline JSON, and MP4/WebM video depending on browser support.
- **Local lyric processing:** ASR-based lyric matching and alignment that preserves supplied lyrics with available word timestamps, accessible through the UI, API or CLI.

## Quick start

1. **Add a song:** open the [online editor](https://lyric-flow-seven.vercel.app/) and select **匯入音訊**. The first imported song is added to an audio track automatically.
2. **Add lyrics:** use **匯入字幕**, or open **歌詞編輯 → 逐句字幕** to type or paste lyrics.
3. **Set timing:** use **開始對時** to mark untimed lyrics while listening, or adjust existing cues in the timeline. The local edition also supports the automatic modes described below.
4. **Arrange visuals:** import images/video and select scenes and effects. Use **手動時間軸** or image-subtitle JSON when visuals must follow fixed song timestamps.
5. **Export:** choose dimensions, frame rate, quality and range under **匯出設定**, then select **開始錄影**. Use the subtitle editor's download buttons for subtitles alone.
6. **Save:** check that the draft is saved. Select **儲存專案** to download a `.resonance` backup or transfer the project to another device.

Manual timing shortcuts: **Space/→** marks a line, **←** undoes a mark, **0** inserts an empty timestamp and **Enter** finishes. Cancelling preserves the original subtitles.

Video export records **in real time**, so its duration depends on the selected range. Browsers supporting direct file saving write to disk while recording; other browsers use an approximately **256 MiB** memory buffer and stop to save the recorded portion when it fills. Wait for saving to finish after stopping. Formats and performance depend on the browser.

## Local installation

Run the following commands from the repository root containing `app.py` and `package.json`.

### Local frontend only

Requires **Node.js 22.12 or later**. Python is not required.

```sh
npm ci
npm run build:static
npm run preview:static
```

Open the URL printed in the terminal. This uses the same recognition-disabled mode as the online edition and builds to `web/dist-static/`.

### Local recognition and lyric alignment

Requires **Node.js 22.12 or later**. The commands below use **Python 3.12** for both the main service and alignment setup. The main service supports Python 3.12 or later, but alignment currently pins NumPy 1.26.4, which [supports Python 3.9–3.12](https://numpy.org/devdocs/release/1.26.4-notes.html). Do not create a new alignment environment with Python 3.13/3.14 under these pinned dependencies.

Initial setup downloads dependencies and models. The engines can run on the local CPU without an NVIDIA GPU.

**1. Build the frontend and create the Python environment**

macOS/Linux:

```sh
npm ci
npm run build
python3.12 -m venv .venv
source .venv/bin/activate
python -m pip install -r requirements.txt
```

<details>
<summary>Windows: create the environment</summary>

Install Python x64 with the Python Launcher, then run in PowerShell:

```powershell
npm ci
npm run build
py -3.12 -m venv .venv
.venv\Scripts\python.exe -m pip install -r requirements.txt
```

Replace `python` in the following commands with `.venv\Scripts\python.exe`.

Native Windows support still needs device verification. Alternatively, follow the Linux instructions in WSL2. Create separate `.venv/`, `.venv-alignment/` and `.local/` directories for each operating system.

</details>

**2. Install either or both engines**

| Mode                             | UI entry         | Behavior                                                               | Maximum audio duration |
| -------------------------------- | ---------------- | ---------------------------------------------------------------------- | ---------------------- |
| Alignment against correct lyrics | **精準歌詞對齊** | Locates supplied lyrics, preserving text and available word timestamps | 10 minutes             |
| ASR-based lyric matching         | **自動辨識**     | Recognizes audio, then matches it to supplied lyrics                   | 30 minutes             |

Alignment against correct lyrics:

```sh
python scripts/setup_alignment.py --separation
```

This creates a separate `.venv-alignment/` and installs alignment and vocal separation models, requiring several GB of storage. Omit `--separation` to install alignment on the original audio alone. This engine does not depend on whisper.cpp below. See the [lyrics timeline guide](LYRICS_ENGINE.md) for operation and MyCut integration.

ASR-based lyric matching:

```sh
python -m pip install -r requirements-build.txt
python scripts/setup.py
```

This builds whisper.cpp and places its engine and model in `.local/`. macOS requires Command Line Tools (`xcode-select --install`); Linux requires C/C++ build tools and the matching `venv` package. Windows requires Visual Studio 2022 Build Tools with **Desktop development with C++**; `setup-windows.cmd` can also perform ASR setup.

**3. Start the service**

```sh
python app.py --open
```

Open `http://127.0.0.1:8080`. Keep the terminal running and press **Ctrl+C** to stop the service. On later visits, launch without reinstalling:

```sh
# macOS / Linux
.venv/bin/python app.py --open
```

On Windows, use `.venv\Scripts\python.exe app.py --open`. With the ASR engine installed, you can also launch through `start-mac.command` or `start-windows.cmd`.

<details>
<summary>Upgrade an existing Python environment</summary>

Stop the service, rename the old `.venv` as a backup, then recreate it and reinstall dependencies. Use Python 3.12 when installing the alignment engine. Virtual environments do not upgrade with system Python. Existing engines and models in `.local/` can be reused. The main service alone can use newer Python versions; Python 3.13 or later automatically installs `audioop-lts`.

</details>

### Use the local alignment modes

1. Import a song and check that it is on an audio track.
2. Open the entry for your installed engine and paste the complete lyrics, one line at a time. Write out repeated choruses in full.
3. For alignment against correct lyrics, remove unsung markers such as `[Verse]`. Select vocal separation (**分離人聲**) when handling long intros, instrumental breaks or strong accompaniment.
4. Submit and monitor progress. Replacing existing subtitles requires confirmation; they remain intact until success and are preserved on failure or cancellation.
5. Listen to each line and adjust its timing. Download **Timeline JSON** to retain word timestamps; SRT/LRC cannot store them.

Both modes accept WAV, MP3, M4A, AAC, FLAC and AIFF, with limits of **200 MiB** of audio and **12,000 lyric characters**. UTF-8 lyric files uploaded through the API are limited to **64 KiB**. Sustained notes, harmonies, instrumental breaks and repeated sections can affect alignment. ASR output omits unmatched lines from SRT; retry or resolve their timing manually before creating complete assets.

If a submission finds an existing job after a reload, the dialog lets you inspect, stop or download it when complete. Jobs that **have not started uploading audio within 5 minutes** release their slot on the next lookup or submission. Active uploads and recognition are unaffected. See [API.md](API.md) for job management, missing-line retries and the Python client.

## Create assets from a song folder

Create one folder per song containing one audio file and one UTF-8 TXT file with the complete lyrics. Audio and lyric filenames are unrestricted:

```text
input/我的歌曲/
  song.mp3
  lyrics.txt
  專輯名稱.txt       # Optional; use this exact filename and a single-line album title
```

For an AI with local file access, alignment access and image generation/inspection tools, use:

> Read this project's AGENTS.md and WORKFLOW.md, then process input/我的歌曲. Produce a complete SRT, individual storyboard images, image-subtitle JSON and an album cover bearing its title. If output already exists, verify sources and progress before resuming.

This workflow uses results from the ASR engine; install that engine and start the local service first. Adding files does not start production automatically. Suno section markers may remain in the source lyrics, but write repeated choruses in full.

Defaults are **16:9 storyboard images with consistent characters and style, no text and room for subtitles**, plus a **1:1 cover bearing the album title**. Specify a style, image count, aspect ratio or title in your request.

The song's `output/` contains `lyrics.srt`, `images/`, `image-subtitles.json`, the cover, storyboard and source/progress records. To resume, read `output/PROGRESS.md`, then verify sources and actual deliverables. [WORKFLOW.md](WORKFLOW.md) defines the complete output and acceptance requirements. Private inputs and outputs are excluded from Git; back them up separately.

### Import the storyboard

1. Import the original song and check the audio-track duration.
2. Import the files in `images/`, preserving filenames and avoiding duplicate names.
3. Select **匯入圖片字幕 JSON** and open `image-subtitles.json`. This switches to manual timeline mode and **replaces V1 visuals and all subtitles**, preserving audio, assets and styles. A separate SRT import is unnecessary.
4. Preview the timing and record the video. The cover is not inserted automatically.

Image-subtitle JSON uses `version: 1` and is **different from Timeline JSON**, which stores word timestamps. Filenames must match imported images exactly, and lyrics cannot be blank. The first image starts at zero and the last extends to the existing audio or subtitle endpoint. Download the [example JSON](web/public/examples/image-subtitles.json); see the [format guide](web/public/examples/image-subtitles.md) for fields, limits and compatibility.

## Saving and data locations

| Data                    | Location and purpose                                                                                                                           |
| ----------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| Browser draft           | IndexedDB in the current browser; keeps one latest version, prompts to restore after reload and preserves the previous version on save failure |
| `.resonance` project    | Download with **儲存專案**; contains media, subtitles, timelines and settings for backup or transfer                                           |
| Local recognition jobs  | `.cache/interface/`, including uploaded audio, lyrics, results and logs                                                                        |
| Local caches and models | `.cache/` and `.local/`, with conversion, recognition/alignment caches and models depending on the engine                                      |

Drafts are separate for each browser and website origin, including its port. Online and local editions do not share them automatically. Conflicting edits across tabs require a choice before replacement.

**重置** clears the current work and that site's draft; clearing browser site data also deletes drafts. Neither deletes source files on disk, downloaded projects or Python job files. Back up results and stop the service before clearing backend caches.

## FAQ

| Question                                                 | Answer                                                                                                                                                                  |
| -------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Why is automatic recognition missing online?             | The online edition provides manual timing. Automatic modes require the local service and the corresponding engine.                                                      |
| Why does the local homepage ask for a build?             | Run `npm ci` and `npm run build` at the repository root. Flask serves `web/dist/`.                                                                                      |
| Why do images keep cycling when playback stops or seeks? | Automatic sequencing uses an independent clock. Use image-subtitle JSON or the manual timeline for fixed song timestamps. Switching back to automatic mode clears V1.   |
| How do I stop images zooming with the music?             | Set **作品設定 → 畫面與背景 → 背景律動** to `0`; also disable **氛圍特效 → 節奏鏡頭衝擊** if needed.                                                                    |
| How do I change or remove the default logo?              | Use **Logo 與疊圖**. Loading the logo alone does not create an empty draft; the first draft save includes it.                                                           |
| Where is my project in another browser/device?           | Drafts do not sync across devices. Download a `.resonance` file in the original environment and use **開啟專案** in the new one.                                        |
| Why did word highlighting disappear after SRT import?    | SRT stores sentence timing only. Use Timeline JSON to retain word timestamps. Text edits or trimming invalidate affected word data and fall back to sentence subtitles. |

## Development and deployment

Development mode:

```sh
npm ci
npm run dev
```

`/api` is proxied to `http://127.0.0.1:8080`. Start the Python service in another terminal when using recognition.

| Command                                                     | Purpose                                                      |
| ----------------------------------------------------------- | ------------------------------------------------------------ |
| `npm run build`                                             | Build `web/dist/` for local Flask                            |
| `npm run build:static`                                      | Build the recognition-disabled edition to `web/dist-static/` |
| `npm run format:check`, `npm run typecheck`, `npm run lint` | Frontend formatting, type and lint checks                    |
| `npm test`                                                  | Frontend unit tests                                          |
| `npm run test:e2e`                                          | Browser tests using Vite and local Google Chrome             |
| `npm run test:static`                                       | Build and test the frontend-only edition without Python      |

Full local checks, using `.venv` with dependencies installed:

```sh
.venv/bin/python -m pip install -r requirements-dev.txt
.venv/bin/python scripts/check.py --browser
```

On Windows, substitute `.venv\Scripts\python.exe`. The script builds the frontend, starts a temporary service and cleans up afterward. Local Google Chrome is required. Real-song tests need separate fixtures, and optional engines have their own tests; see [architecture and verification](ARCHITECTURE.md#開發與驗證).

For Vercel, set Root Directory to **`web`**, use `npm run build:static`, and publish `dist-static`. [web/vercel.json](web/vercel.json) supplies the build settings. Python and API keys are not required. See the [frontend deployment guide](web/README.md#vercel只部署-vue-前端) for details.

## Documentation

The detailed guides below are primarily in Traditional Chinese.

| Document/directory                                              | Contents                                                             |
| --------------------------------------------------------------- | -------------------------------------------------------------------- |
| [web/README.md](web/README.md)                                  | Editor controls, scenes, export, frontend development and deployment |
| [LYRICS_ENGINE.md](LYRICS_ENGINE.md)                            | Alignment against correct lyrics, word timing and MyCut integration  |
| [API.md](API.md)                                                | Local API, job management, retries and Python client                 |
| [WORKFLOW.md](WORKFLOW.md) / [AGENTS.md](AGENTS.md)             | AI song production, acceptance checks and handoff rules              |
| [ARCHITECTURE.md](ARCHITECTURE.md)                              | Module responsibilities, job lifecycle and verification              |
| [Image-subtitle format](web/public/examples/image-subtitles.md) | Storyboard JSON fields, limits and examples                          |
| `web/src/` / `lyricflow/`                                       | Vue editor / Python service and lyric processing                     |
| `scripts/` / `tests/` / `web/tests/`                            | Setup and workflow scripts / backend and frontend tests              |

## Credits and licenses

Special thanks to **[考拉醬 | 謎謎之音](https://www.youtube.com/@meme-koala)** for providing the Web visualization tool. LyricFlow builds on it with subtitle editing, media timelines, project saving and local recognition. Visit the channel to explore his work.

Third-party code licenses are retained in [THIRD-PARTY-LICENSES](web/public/THIRD-PARTY-LICENSES). Font and scene licenses and attribution are in [web/public/](web/public/). Visit [Regan on YouTube](https://www.youtube.com/@ReganOba) for more music.
