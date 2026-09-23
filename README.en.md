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
| Access                                    | [Open in your browser](https://lyric-flow-seven.vercel.app/) | Install and open `http://127.0.0.1:8080`        |
| Media import, subtitles and manual timing | Available                                                    | Available                                       |
| Visualization, scenes and video export    | Available, subject to browser support                        | Available, subject to browser support           |
| Project downloads and browser drafts      | Available                                                    | Available                                       |
| Automatic recognition / lyric alignment   | **Not available**                                            | Available after installing the engine and model |
| Python and model installation             | Not required                                                 | Required                                        |

The online edition edits, previews and exports your media in the browser, without sending songs to a Python recognition service. The manual timing feature records timestamps that you mark while listening. Automatic image sequencing, visual effects and spectrum analysis are separate from recognition.

## Features

- **Media timeline:** import audio, images and video; arrange, move, trim, split and duplicate clips; adjust audio levels.
- **Subtitle editing:** import SRT, LRC or TXT; type or paste lyrics, search and replace text, and adjust cue boundaries.
- **Image and lyric alignment:** import images, then load a JSON file containing filenames, timestamps and lyrics to create subtitles and continuous visuals covering the intro, instrumental gaps and outro.
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

Video export records in real time. Browsers that support saving directly to a file, such as desktop Chrome and Edge, ask for a save location before recording and write chunks to disk as they arrive, allowing videos larger than 256 MiB. Wait for saving to finish after stopping. Other browsers still use a 256 MiB memory buffer and stop to download the captured portion when it fills. Available formats and performance depend on the browser.

## Create assets from a song folder

Create one folder per song with one audio file and one UTF-8 TXT file containing the complete lyrics. You can use the following location (create it if missing) or provide another local folder:

```text
input/我的歌曲/
  song.mp3
  lyrics.txt
  專輯名稱.txt       # Optional; use this exact filename and a single-line album title
```

Audio and lyric filenames are otherwise unrestricted. Suno markers such as `[Verse]` and `[Chorus]` may remain, but write out repeated choruses in full. Ask Codex or another AI:

> Read this project's AGENTS.md and WORKFLOW.md, then process input/我的歌曲. Produce a complete SRT, individual storyboard images, a JSON file aligning lyrics with image filenames, and an album cover bearing its title. If output already exists, verify the sources and progress before resuming.

The AI starts this workflow when instructed; adding files does not trigger it automatically. It needs access to the folder, the local alignment service or CLI, and image generation and inspection tools. See the local installation instructions below. The Python helpers validate inputs and export subtitles/JSON; the AI's image tools generate the artwork.

Defaults are **16:9 storyboard images with consistent characters and style, no text, and room for subtitles**, plus a **square 1:1 cover bearing the album title**. Specify a style, image count, aspect ratio or title in your request if desired. Otherwise, the AI chooses a title from the lyrics. Results go into the song folder's `output/`:

| Output                                                    | Purpose                                                                                         |
| --------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| `lyrics.srt`                                              | Complete lyrics and cue times, also usable in other editors                                     |
| `images/`                                                 | Individual storyboard image files                                                               |
| `image-subtitles.json`                                    | Matches image filenames through `name` and imports subtitles and visuals together               |
| `cover/album-cover.png`, `album.md`                       | Album cover, title and naming rationale; the cover is not automatically inserted into the video |
| `storyboard.md`, `storyboard.json`, `prompts.md`          | Storyboard, image change points and generation prompts                                          |
| `source.json`, `PROGRESS.md`, alignment and lyric records | Sources, user requirements, progress and handoff records                                        |

[AGENTS.md](AGENTS.md) is the AI entry point; [WORKFLOW.md](WORKFLOW.md) defines the complete process, deliverables and acceptance checks (Traditional Chinese). Each song's `output/PROGRESS.md` records its actual progress. A replacement AI should read these files and verify `source.json` and existing outputs before resuming. `input/` and `output/` are excluded from Git; back them up or share them separately when handing off work.

## Import image and lyric JSON

Both editions can import prepared image JSON:

1. Import the original song and check that it is on an audio track with the correct duration.
2. Add the files in `images/` through **歌詞編輯 → 素材**, preserving filenames and avoiding duplicate asset names.
3. Use **匯入圖片字幕 JSON** to open `image-subtitles.json`. This switches to manual timeline mode and replaces V1 visuals and all subtitles, preserving audio, assets and styles. A separate SRT import is unnecessary.
4. Preview the subtitles and image changes, then record using the normal export controls.

Use `version: 1` and include `name`, `startTime`, `endTime` and `content` in each scene. `name` must match a unique imported image filename exactly, including its extension and letter case. No `image` field or Base64 data is required. Times are absolute seconds within the song; each cue must last at least 0.05 seconds, cues cannot overlap, and `content` must contain nonblank lyrics. Limits are **64 MiB and 1–500 scenes**. Multiple cues may share an image.

The first image starts at zero, each image continues until the next scene starts, and the final image extends to the end of the existing audio tracks or final subtitle, whichever is later. Instrumental gaps need no blank subtitle scenes. If an error reports blank `content`, check that scene and restore its missing lyrics. After extending the audio track, reimport the JSON or extend the final image clip manually.

Validation failures preserve the current project. Download the [example JSON](web/public/examples/image-subtitles.json); see the [format guide](web/public/examples/image-subtitles.md) for field details and legacy compatibility.

## Common visual settings

- **Images zooming with the music:** set **作品設定 → 畫面與背景 → 背景律動** to `0`. If the whole-screen impact effect is enabled, also disable **氛圍特效 → 節奏鏡頭衝擊**.
- **Logo:** new projects load the bundled `web/public/logo.png` at the bottom-right corner with `20%` size. Adjust, replace or clear it under **Logo 與疊圖**. Opening a project or restoring a draft retains its saved content.
- **Synchronizing images to lyrics:** automatic image sequencing uses an independent clock; playback, pause and seeking do not reset it. Its lyric mode uses cue intervals as a repeating rhythm. For fixed lyric-to-image matches, use JSON import or the manual timeline. Switching back to automatic sequencing clears V1 clips.

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

Open `http://127.0.0.1:8080`. Keep the terminal running while using the app; press Ctrl+C to stop it.

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

Local recognition accepts WAV, MP3, M4A, AAC, FLAC and AIFF audio, up to **200 MiB and 30 minutes**. Lyrics are limited to **12,000 characters**; uploaded UTF-8 lyric text files are limited to **64 KiB**. These service limits are separate from image JSON and recording limits.

Recognition and lyric matching primarily target Chinese. Sustained notes, instrumental breaks, repeated sections and strong accompaniment can affect alignment, so review the timing by listening. Unmatched lines are omitted from recognition SRT output. Check the unmatched and review counts, then retry or resolve the timing manually before assembling complete assets. Missing-line retries and integrations are documented in the [API guide](API.md).

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

Development mode retains recognition and proxies `/api` to `http://127.0.0.1:8080`; start Python separately when using it. Rebuild with `npm run build` for the local edition or `npm run build:static` for the frontend-only edition.

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

| Path                        | Purpose                                                                 |
| --------------------------- | ----------------------------------------------------------------------- |
| `web/src/`                  | Vue 3 and TypeScript visual editor                                      |
| `web/public/`               | Fonts, scenes and asset attribution                                     |
| `web/vercel.json`           | Frontend-only Vercel deployment configuration                           |
| `lyricflow/`                | Python API, recognition and lyric alignment                             |
| `app.py` / `lyric_flow.py`  | Local web server / recognition CLI                                      |
| `lyric_flow_client.py`      | Python client for the local recognition API                             |
| `tests/` / `web/tests/`     | Backend / frontend and browser tests                                    |
| `scripts/`                  | Setup, verification, song-folder preparation and storyboard export      |
| `AGENTS.md` / `WORKFLOW.md` | AI entry point / song production and delivery specification             |
| `input/` / `output/`        | Private songs and generated assets; create as needed, excluded from Git |

Special thanks again to **[考拉醬 | 謎謎之音](https://www.youtube.com/@meme-koala)** for the Web visualization tool. Third-party code licenses are retained in [THIRD-PARTY-LICENSES](web/public/THIRD-PARTY-LICENSES). Font and scene licenses and attribution remain in [web/public/](web/public/).

Visit [ReganOba on YouTube](https://www.youtube.com/@ReganOba) for more music.
