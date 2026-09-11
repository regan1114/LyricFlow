# LyricFlow | Lyrics, Subtitles and Music Visualization

[繁體中文](README.md) | **English**

LyricFlow brings songs, lyrics, images and video into an editable music visualization project. It includes a subtitle timeline, manual lyric timing, scene effects and video export. Use the browser edition online, or install the Python service to enable recognition on your own computer.

**[Open the online visual editor](https://lyric-flow-seven.vercel.app/)**

> **The Vercel edition does not include automatic recognition.**
> It deploys only the Vue frontend, with no Python backend, recognition engine or model. You can import songs and subtitles, edit lyrics, mark their timing manually and export videos. Automatic recognition and automatic lyric alignment require the local edition described below.

## Special thanks: 考拉醬 | 謎謎之音

**Special thanks to [考拉醬 | 謎謎之音](https://www.youtube.com/@meme-koala) for providing the Web visualization tool.**

LyricFlow's visual editor builds on the tool he provided, integrating subtitle editing, media timelines, project saving and the local recognition workflow. Thank you for sharing the tool and helping bring music visualization and lyric subtitles together for creators.

Please visit **[考拉醬 | 謎謎之音 on YouTube](https://www.youtube.com/@meme-koala)** to enjoy and support his work!

## Online and local editions

| Feature                                   | Vercel online edition                                        | Local edition (Vue + Python)                    |
| ----------------------------------------- | ------------------------------------------------------------ | ----------------------------------------------- |
| Access                                    | [Open in your browser](https://lyric-flow-seven.vercel.app/) | Install and open `http://127.0.0.1:8765`        |
| Media import, subtitles and manual timing | Available                                                    | Available                                       |
| Visualization, scenes and video export    | Available, subject to browser support                        | Available, subject to browser support           |
| Project downloads and browser drafts      | Available                                                    | Available                                       |
| Automatic recognition / lyric alignment   | **Not available**                                            | Available after installing the engine and model |
| Python and model installation             | Not required                                                 | Required                                        |

The online edition edits, previews and exports your media in the browser, without sending songs to a Python recognition service. The manual timing feature records timestamps that you mark while listening. Automatic image sequencing, visual effects and spectrum analysis are separate from recognition.

## Features

- **Media timeline:** import audio, images and video; arrange, move, trim, split and duplicate clips; adjust audio levels.
- **Subtitle editing:** import SRT, LRC or TXT; type or paste lyrics, search and replace text, and adjust cue boundaries.
- **Marquee selection:** drag across empty subtitle-track space to select multiple cues, then move, duplicate or delete them together, with undo and redo.
- **Manual lyric timing:** mark each line while listening, undo a mark, insert an empty timestamp and export subtitles.
- **Music visualization:** spectrum and waveform displays, orb and vinyl modes, transitions, atmosphere effects and built-in scenes.
- **Visual layout:** 16:9, 1:1 and 9:16 canvases, song information, fonts, logos, overlays and chroma key.
- **Saving:** download a `.resonance` project containing your media and settings, or use an automatic draft in the current browser.
- **Export:** download SRT/LRC subtitles or record the canvas and audio to MP4/WebM, depending on browser support.

See the [Web frontend guide](web/README.md) for detailed controls (Traditional Chinese).

## Start using the online editor

1. Open the [online tool](https://lyric-flow-seven.vercel.app/) and import a song with **匯入音訊**.
2. Import SRT/LRC/TXT through **匯入字幕**, or open **歌詞編輯 → 逐句字幕** to add and paste lyrics.
3. Use **開始對時** to mark untimed lyrics while listening, or adjust existing timestamps in the timeline.
4. Import visual media and choose your scenes and effects. Use manual timeline mode for video clips and explicitly scheduled visuals.
5. Choose dimensions, frame rate, quality and range under **匯出設定**, then use the player's record button. Use the SRT/LRC buttons for subtitle-only exports.
6. Check the draft status before leaving, or use **儲存專案** to download a `.resonance` backup for another device or future editing.

During manual timing, Space or Right Arrow marks the current line, Left Arrow undoes a mark, `0` inserts an empty timestamp, and Enter finishes. On-screen buttons provide the same actions. Cancelling preserves the original subtitles.

Video export records in real time. Available formats and performance depend on the browser. At approximately 256 MiB of buffered recording data, recording stops and saves the captured portion; reduce quality or export a shorter range for larger projects.

## Drafts, projects and reset

The **專案與草稿** panel can pause automatic saving, save immediately, restore or delete a draft, and show its timestamp, media count and status. After a reload, choose whether to restore the saved draft or replace it with your current work.

Drafts use the current browser's IndexedDB and keep one latest version. Subtitle and settings changes reuse stored media. Failed saves preserve the previous successful draft and show an error; competing edits in different tabs require a choice before replacement.

- Drafts are separate for each browser and website origin, including its port. Local, Vercel preview and production URLs do not share them automatically.
- Clearing website data or confirming **重置** deletes that site's draft. Reset also clears current media, subtitles and editing state.
- A `.resonance` download includes imported assets, subtitles, timelines and settings. Use **開啟專案** to restore it or move your work to another device.
- Reset does not delete source files on your computer, downloaded projects, saved styles or Python recognition job files.

## Run the frontend-only edition locally

Install Node.js 22.12 or later. From the repository root:

```sh
npm ci
npm run build:static
npm run preview:static
```

Open the URL printed in the terminal. This uses the same **recognition-disabled** build mode as Vercel and writes to `web/dist-static/`. Python is not required.

## Deploy your own Vercel site

Push the source to GitHub, select **Add New → Project** in Vercel, import the repository and use these settings:

| Setting               | Value                  |
| --------------------- | ---------------------- |
| Root Directory        | `web`                  |
| Framework Preset      | `Vite`                 |
| Install Command       | `npm ci`               |
| Build Command         | `npm run build:static` |
| Output Directory      | `dist-static`          |
| Environment Variables | None required          |

[web/vercel.json](web/vercel.json) supplies the build settings. Only the static frontend is published; Python is not deployed. After the first deployment, check **Settings → Environments → Production → Branch Tracking**. This project currently uses `master`. Subsequent pushes to the production branch update the site, while other branches can create preview deployments. See [Vercel's Git deployment documentation](https://vercel.com/docs/git#customizing-the-production-branch).

The integrated frontend lives in `web/`. The local `video_visual/` folder is the original imported-tool backup, excluded from Git and not used for deployment.

## Local edition with automatic recognition

Recognition requires the Python service, engine and model on your computer. A regular `npm run build` writes to `web/dist/`, separately from the frontend-only `web/dist-static/` build.

### Requirements

- Node.js 22.12 or later for frontend installation and building.
- Python 3.9–3.12; 3.12 is recommended. The backend currently does not support Python 3.13 or later.
- C/C++ build tools on macOS/Linux. Native Windows x64 uses Visual Studio 2022 Build Tools with the Desktop development with C++ workload.
- Internet access for the initial dependency, whisper.cpp and model downloads. Recognition runs on the local CPU; no GPU is required.

### macOS / Linux

Run from the repository root containing `app.py`. Check that `python3` meets the version requirement. On macOS, use `xcode-select --install` if build tools are missing; on Linux, install build tools and the `venv` package matching your Python version.

```sh
npm ci
npm run build
python3 -m venv .venv
source .venv/bin/activate
python -m pip install -r requirements.txt -r requirements-build.txt
python scripts/setup.py
python app.py --open
```

Setup verifies downloads, builds whisper.cpp and stores the engine and model in `.local/`. After installation, launch with:

```sh
.venv/bin/python app.py --open
```

Open `http://127.0.0.1:8765`. Keep the terminal running while using the app; press Ctrl+C to stop it.

### Windows

Install Node.js, Python 3.12 x64 including the Python Launcher, and Visual Studio 2022 Build Tools. Run `npm ci` and `npm run build` in the repository root, then:

1. Run `setup-windows.cmd` to install Python dependencies, the recognition engine and model.
2. Run `start-windows.cmd` to open the local application.

Native Windows support still needs device verification. Alternatively, use WSL2 and follow the Linux instructions inside Ubuntu. Do not share `.venv/` or `.local/` across operating systems.

### Recognition workflow

1. Import a song and add it to an audio track if needed.
2. Click the top-right recognition icon; its hover label is **自動辨識**.
3. Choose the song, enter one sung lyric line per line, and submit.
4. Existing subtitles require replacement confirmation. Cancelling that confirmation preserves the input without submitting a job.
5. Successful results replace the subtitles. Failed or cancelled recognition preserves the originals. Review and adjust the results in the timeline.

Recognition and lyric matching primarily target Chinese. Sustained notes, instrumental breaks, repeated sections and strong accompaniment can affect alignment, so review the timing by listening. Missing-line retries and integrations are documented in the [API guide](API.md).

The CLI accepts PCM WAV audio and a lyrics text file:

```sh
python lyric_flow.py /path/to/song.wav /path/to/lyrics.txt --threads 2 --output output
```

It produces `.draft.srt`, `.review.txt` and `.alignment.json` files. This `.draft.srt` is a recognition output file, separate from browser drafts.

### Local Python data

Uploaded audio, lyrics, job results and logs default to `.cache/interface/`; conversion and recognition caches use `.cache/lyric-flow/`. Cancelling recognition or resetting the web workspace does not remove these backend files. Back up results and stop the service before deleting the relevant cache directories.

## Development and verification

From the repository root:

```sh
npm ci
npm run dev
```

Development mode retains recognition and proxies `/api` to `http://127.0.0.1:8765`; start Python separately when using it. Rebuild with `npm run build` for the local edition or `npm run build:static` for the frontend-only edition.

```sh
npm run format:check
npm run typecheck
npm run lint
npm test
npm run test:static
```

`test:static` builds the recognition-disabled edition and uses local Google Chrome with a static preview server, without starting Python. With Python dependencies installed, run the complete local-edition checks:

```sh
python -m pip install -r requirements-dev.txt
python scripts/check.py --browser
```

Real recognition tests requiring external song fixtures and a model are skipped by default. See the [architecture and verification guide](ARCHITECTURE.md#開發與驗證) for setup. Keep `tests/` and `web/tests/` in version control; generated test results, private media, models and caches are excluded by `.gitignore`.

## Project layout and credits

| Path                       | Purpose                                       |
| -------------------------- | --------------------------------------------- |
| `web/src/`                 | Vue 3 and TypeScript visual editor            |
| `web/public/`              | Fonts, scenes and asset attribution           |
| `web/vercel.json`          | Frontend-only Vercel deployment configuration |
| `lyricflow/`               | Python API, recognition and lyric alignment   |
| `app.py` / `lyric_flow.py` | Local web server / recognition CLI            |
| `tests/` / `web/tests/`    | Backend / frontend and browser tests          |
| `scripts/`                 | Setup and verification tools                  |

Special thanks again to **[考拉醬 | 謎謎之音](https://www.youtube.com/@meme-koala)** for the Web visualization tool. Third-party code licenses are retained in [THIRD-PARTY-LICENSES](web/public/THIRD-PARTY-LICENSES). Font and scene licenses and attribution remain in [web/public/](web/public/).

Visit [ReganOba on YouTube](https://www.youtube.com/@ReganOba) for more music.
