# LyricFlow｜歌詞字幕與音樂視覺化工具

**繁體中文** | [English](README.en.md)

LyricFlow 將歌曲、歌詞、圖片與影片整合成可編輯的音樂視覺化作品，提供字幕時間軸、手動歌詞對時、場景特效與影片匯出。你可以直接使用線上工具，也可以在自己的電腦安裝 Python 辨識服務。

**[開啟線上視覺化工具](https://lyric-flow-seven.vercel.app/)**

> **Vercel 線上版為「無自動辨識版本」。**
> 線上網站只部署 Vue 前端，沒有 Python 後端、辨識引擎或模型。你可以匯入歌曲與字幕、編輯歌詞、手動對時及匯出影片，但不提供自動辨識或自動歌詞對齊。需要辨識時，請使用下方的本機版。

## 特別感謝：考拉醬 | 謎謎之音

**特別感謝 [考拉醬 | 謎謎之音](https://www.youtube.com/@meme-koala) 提供 Web 視覺化工具。**

LyricFlow 的 Web 視覺化編輯器以他提供的工具為基礎，整合字幕編輯、影音時間軸、專案保存與本機辨識流程。謝謝考拉醬的分享，讓這個專案能將歌詞字幕與音樂視覺化結合，提供創作者更多製作音樂影片的方式。

歡迎前往 **[考拉醬 | 謎謎之音的 YouTube 頻道](https://www.youtube.com/@meme-koala)**，看看他的作品並支持他！

## 線上版與本機版

| 項目                         | Vercel 線上版                                        | 本機版（Vue + Python）                |
| ---------------------------- | ---------------------------------------------------- | ------------------------------------- |
| 使用方式                     | [直接開啟網站](https://lyric-flow-seven.vercel.app/) | 安裝後於 `http://127.0.0.1:8080` 使用 |
| 影音素材、字幕編輯與手動對時 | 支援                                                 | 支援                                  |
| 視覺化、場景特效與影片匯出   | 支援，依瀏覽器能力                                   | 支援，依瀏覽器能力                    |
| 專案下載與瀏覽器草稿         | 支援                                                 | 支援                                  |
| 自動辨識／歌詞對齊           | **不提供**                                           | 安裝辨識引擎與模型後提供              |
| Python 與模型                | 不需要                                               | 需要                                  |

線上版的素材編輯、預覽與匯出在瀏覽器執行，不會將歌曲送往 Python 辨識服務。「開始對時」是由使用者邊聽歌曲、邊標記歌詞時間的手動功能；自動圖片編排、頻譜與視覺特效也不代表自動辨識。

## 主要功能

- **影音素材與時間軸**：匯入音訊、圖片、影片，編排畫面與音軌，支援片段移動、裁切、分割、複製及音量調整。
- **字幕編輯**：匯入 SRT、LRC、TXT，逐句輸入或貼上歌詞，搜尋取代，調整字幕起訖時間。
- **圖片與歌詞對齊**：先匯入圖片，再用只含檔名、時間與歌詞的 JSON 建立字幕和連續圖片片段，涵蓋前奏、間奏與片尾。
- **拖曳框選**：在字幕軌道空白處框選多句，整批移動、複製或刪除，並支援復原／重做。
- **手動歌詞對時**：播放歌曲並逐句標記，可復原上一句、插入空白時間點，完成後匯出字幕。
- **音樂視覺化**：頻譜、波形、光球、黑膠、背景轉場、氛圍特效及內建沉浸場景。
- **畫面配置**：16:9、1:1、9:16 比例，支援歌曲資訊、字型、Logo、疊圖與色度去背。
- **作品保存**：下載包含素材與設定的 `.resonance` 專案，或使用目前瀏覽器中的自動草稿。
- **匯出**：下載 SRT／LRC 字幕，或錄製畫面與音訊，依瀏覽器支援輸出 MP4／WebM。

操作與功能細節見 [Web 前端文件](web/README.md)。

## 線上版快速開始

1. 開啟 [LyricFlow 線上工具](https://lyric-flow-seven.vercel.app/)，按「匯入音訊」加入歌曲。
2. 已有字幕時，使用「匯入字幕」加入 SRT／LRC／TXT；也可開啟「歌詞編輯」，在「逐句字幕」中新增或貼上歌詞。
3. 歌詞尚未對時時，按「開始對時」，邊聽歌曲邊標記；已有時間的字幕可直接在下方時間軸微調。
4. 匯入圖片／影片，調整畫面、場景與特效。影片與指定片段編排可使用「手動時間軸」模式。
5. 在「匯出設定」選擇尺寸、幀率、畫質與範圍，再按播放器錄影鍵輸出影片；只需要字幕時，使用歌詞編輯區的 SRT／LRC 按鈕。
6. 離開前確認草稿狀態；需要備份或換裝置編輯時，按「儲存專案」下載 `.resonance` 檔案。

手動對時期間：空白鍵或右方向鍵標記目前歌詞、左方向鍵復原、`0` 插入空白時間點、Enter 完成；也可使用畫面按鈕。取消對時會保留原字幕。

影片目前採即時錄製，錄製所需時間會隨選定區段長度增加。支援直接存檔的瀏覽器（例如桌面 Chrome／Edge）會在錄影前讓你選擇儲存位置，並邊錄邊寫入檔案，可匯出超過 256 MiB 的影片。停止後請等待存檔完成。其他瀏覽器使用記憶體暫存，累積至約 256 MiB 時仍會停止並保存已錄內容。MP4／WebM 格式支援與實際效能取決於瀏覽器。

## 用歌曲資料夾製作完整素材

每首歌建立一個資料夾，放入一首音檔與一份 UTF-8 TXT 完整歌詞。可使用下列位置（不存在時自行建立），也可指定其他本機資料夾：

```text
input/我的歌曲/
  我的歌曲.mp3
  歌詞.txt
  專輯名稱.txt       # 選填，固定此檔名，內容為單行專輯名稱
```

音檔與歌詞檔可自行命名。Suno 的 `[Verse]`、`[Chorus]` 等標記可保留，但重複副歌須完整列出。交給 Codex 或其他 AI 時，可直接說：

> 請先讀此專案的 AGENTS.md 與 WORKFLOW.md，處理 input/我的歌曲，產出 SRT、獨立分鏡圖、歌詞與圖片對齊 JSON，以及含專輯名稱的封面。若已有 output，請核對來源與進度後接續製作。

這是由 AI 接到指令後執行的工作流，放入檔案不會自動開始。AI 需能讀寫資料夾、使用本機對時服務或 CLI，以及生成和檢視圖片；本機辨識安裝方式見下方。Python 輔助腳本負責輸入檢查與字幕／JSON 匯出，圖片由 AI 的影像工具生成。

預設分鏡為 **16:9 橫式、同一套人物與畫風、不含文字、保留字幕空間**；封面為 **1:1 方形並印上專輯名稱**。可在指令中指定畫風、張數、比例與名稱；未指定名稱則由 AI 依歌詞命名。成果放在歌曲資料夾的 `output/`：

| 產物                                             | 用途                                                 |
| ------------------------------------------------ | ---------------------------------------------------- |
| `lyrics.srt`                                     | 完整歌詞與逐句時間，可用於其他剪輯工具               |
| `images/`                                        | 每個分鏡的獨立圖檔                                   |
| `image-subtitles.json`                           | 依 `name` 對應圖檔，同時匯入字幕和圖片編排           |
| `cover/album-cover.png`、`album.md`              | 含專輯名稱的封面、名稱與命名理由；封面不自動插入影片 |
| `storyboard.md`、`storyboard.json`、`prompts.md` | 分鏡表、切換起點與生成提示詞                         |
| `source.json`、`PROGRESS.md`、對時與歌詞紀錄     | 來源、使用者需求、進度及接手所需資料                 |

[AGENTS.md](AGENTS.md) 是 AI 的任務入口，[WORKFLOW.md](WORKFLOW.md) 定義完整流程、交付格式與驗收條件；每首歌的 `output/PROGRESS.md` 記錄實際進度。換 AI 時讓它先讀這些文件，再核對 `source.json` 與現有成果即可接續。`input/` 與 `output/` 不納入 Git，請另行備份或提供給接手者。

## 匯入圖片與歌詞 JSON

線上版與本機版都可使用已製作完成的圖片 JSON：

1. 匯入原始歌曲，確認已加入音軌且長度正確。
2. 在「歌詞編輯 → 素材」加入 `images/` 中的圖片，保留檔名，避免同名素材。
3. 按「匯入圖片字幕 JSON」開啟 `image-subtitles.json`。它會切換至手動時間軸，取代 V1 畫面片段與整份字幕，保留音訊、素材庫和樣式；無需再匯入 SRT。
4. 預覽字幕和切換位置，再依一般匯出流程錄製影片。

JSON 的 `version` 固定為 `1`；每段包含 `name`、`startTime`、`endTime`、`content`。`name` 必須與素材庫唯一圖檔名稱完全一致（含副檔名及大小寫），不需 `image` 或 Base64。時間為整首歌曲的秒數，每段至少 0.05 秒且不可重疊；`content` 必須是非空白歌詞。檔案上限 **64 MiB、1～500 個段落**，多句可共用同一張圖。

第一張圖從 0 秒顯示，之後每張延續到下一段開始，最後一張延伸至現有音軌或最後一句字幕結尾，以較晚者為準。間奏無須建立空白字幕；若錯誤指出某段 `content` 空白，應檢查並補回該段原歌詞。後續延長音軌時，重新匯入 JSON 或手動延長最後一張圖。

格式或圖片驗證失敗會保留目前作品。可下載 [JSON 範例](web/public/examples/image-subtitles.json)，欄位與舊格式相容說明見 [圖片字幕格式](web/public/examples/image-subtitles.md)。

## 常用畫面設定

- **圖片隨音樂放大縮小**：將「作品設定 → 畫面與背景 → 背景律動」設為 `0`；若啟用了整個畫面的衝擊效果，再關閉「氛圍特效 → 節奏鏡頭衝擊」。
- **Logo**：新作品自動載入內建的 `web/public/logo.png`，預設右下角、尺寸 `20%`，可在「Logo 與疊圖」調整、更換或清除；開啟舊專案或恢復草稿會沿用其儲存內容。
- **圖片切換與歌曲同步**：預設「自動編排圖片」使用獨立輪播時鐘，播放、暫停或跳轉不會重設它；依歌詞換頁也只使用字幕間距作為輪播節奏。需要固定歌詞對應固定圖片時，使用上述 JSON 或手動時間軸。切回自動編排會清空 V1 畫面片段。

## 草稿、專案與重置

「專案與草稿」可開關自動儲存、立即儲存、恢復或刪除草稿，並查看儲存時間、素材數與狀態。重新整理後會先讓你選擇恢復或以目前作品取代，避免直接覆寫既有草稿。

草稿保存在目前瀏覽器的 IndexedDB，只保留最新一份。修改字幕或設定時會沿用已儲存的素材；儲存失敗會提示，並保留前一次成功的草稿。多分頁修改同一份草稿時會要求選擇要保留的版本。

- 草稿依網站網址、連接埠與瀏覽器分開，本機、Vercel 正式網站與預覽網址不會自動共用。
- 清除網站資料或確認「重置」會刪除該網站的草稿；重置也會清空目前媒體、字幕與編輯內容。
- `.resonance` 專案包含匯入素材、字幕、時間軸與設定，可用「開啟專案」還原，是換裝置或長期保存的方式。
- 重置不會刪除電腦上的原始檔、已下載專案、收藏風格或 Python 後端工作資料。

## 在本機使用純前端版

只使用視覺化工具不需要 Python。安裝 Node.js 22.12 以上，下載或 clone 專案後，在專案根目錄執行：

```sh
npm ci
npm run build:static
npm run preview:static
```

開啟終端機顯示的網址。此版本與 Vercel 使用相同的靜態建置模式，**不提供自動辨識**，輸出目錄為 `web/dist-static/`。

## 部署自己的 Vercel 網站

將原始碼推送至 GitHub，於 Vercel 選擇 **Add New → Project** 匯入倉庫，設定：

| 設定                  | 值                     |
| --------------------- | ---------------------- |
| Root Directory        | `web`                  |
| Framework Preset      | `Vite`                 |
| Install Command       | `npm ci`               |
| Build Command         | `npm run build:static` |
| Output Directory      | `dist-static`          |
| Environment Variables | 不需要新增             |

[web/vercel.json](web/vercel.json) 已包含建置設定，Vercel 只發布靜態前端，不部署 Python。首次部署後，到 **Settings → Environments → Production → Branch Tracking** 確認正式分支；此專案目前使用 `master`。之後推送到正式分支會自動更新網站，其他分支可產生預覽部署。詳見 [Vercel Git 部署說明](https://vercel.com/docs/git#customizing-the-production-branch)。

`web/` 是整合後的前端原始碼。`video_visual/` 是本機匯入時的原始工具備份，不作為部署目錄，也不需要推送。

## 本機版：啟用自動辨識

只有安裝並啟動 Python 服務的本機版提供自動辨識。前端一般建置 `npm run build` 輸出至 `web/dist/`，與無辨識版的 `web/dist-static/` 分開。

### 環境需求

- Node.js 22.12 以上：用於前端安裝與建置。
- Python 3.9–3.12，建議 3.12；目前後端不支援 Python 3.13 以上。
- macOS／Linux 的 C/C++ 編譯工具；Windows x64 使用 Visual Studio 2022 Build Tools 的「使用 C++ 的桌面開發」工作負載。
- 初次安裝需要網路下載相依套件、whisper.cpp 與模型，辨識使用本機 CPU，不需要 GPU。

### macOS / Linux

在能看到 `app.py` 的專案根目錄執行。請確認 `python3` 符合上述版本需求；macOS 若缺少編譯工具，先執行 `xcode-select --install`，Linux 則需安裝編譯工具及對應版本的 `venv`。

```sh
npm ci
npm run build
python3 -m venv .venv
source .venv/bin/activate
python -m pip install -r requirements.txt -r requirements-build.txt
python scripts/setup.py
python app.py --open
```

安裝腳本會驗證下載檔、編譯 whisper.cpp，並將引擎與模型放在 `.local/`。已完成安裝後，日常啟動可直接執行：

```sh
.venv/bin/python app.py --open
```

瀏覽器開啟 `http://127.0.0.1:8080`。使用期間保留終端機，按 Ctrl+C 關閉服務。

### Windows

先安裝 Node.js、Python 3.12 x64（含 Python Launcher）及 Visual Studio 2022 Build Tools。在專案根目錄執行 `npm ci`、`npm run build`，再依序執行：

1. 雙擊 `setup-windows.cmd` 安裝 Python 相依套件、辨識引擎與模型。
2. 安裝完成後，雙擊 `start-windows.cmd` 開啟本機網頁。

原生 Windows 支援仍待實機驗證。也可透過 WSL2，在 Ubuntu 中依照上方 Linux 流程安裝與啟動。不要跨作業系統共用 `.venv/` 或 `.local/`。

### 辨識操作

1. 匯入歌曲；若有多首，先將要辨識的歌曲加入音軌。
2. 點右上角自動辨識圖示，滑鼠停留時會顯示「自動辨識」。
3. 在彈窗選擇歌曲，每行輸入一句實際演唱的歌詞，按「送出」。
4. 已有字幕時會先確認取代；取消確認會保留輸入並暫停送出。
5. 辨識成功後才套用字幕；失敗或取消會保留原字幕。完成後在時間軸檢查及微調。

本機辨識支援 WAV、MP3、M4A、AAC、FLAC、AIFF；音檔上限 **200 MiB、30 分鐘**，歌詞最多 **12,000 字元**，上傳的 UTF-8 歌詞文字檔最多 **64 KiB**。這些是辨識服務限制，與圖片 JSON、錄影容量限制不同。

辨識與歌詞比對主要針對中文。長音、間奏、重複段落或較強的伴奏都可能影響對齊，結果仍需試聽確認。未定位句不會放入辨識輸出的 SRT，請檢查未定位／待檢查句數，補辨識或人工確認後再製作完整素材。補辨識與其他程式串接方式見 [API 文件](API.md)。

CLI 使用 PCM WAV 與歌詞文字檔：

```sh
python lyric_flow.py /path/to/song.wav /path/to/lyrics.txt --threads 2 --output output
```

輸出包含 `.draft.srt`、`.review.txt` 與 `.alignment.json`；這裡的 `.draft.srt` 是辨識輸出檔，與瀏覽器草稿不同。

### Python 本機資料

本機版的上傳歌曲、歌詞、工作結果與紀錄預設位於 `.cache/interface/`，轉檔與辨識快取位於 `.cache/lyric-flow/`。取消辨識或按網頁「重置」不會清除這些後端檔案。需要清理時，先備份結果並停止服務，再刪除對應快取。

## 開發與驗證

在專案根目錄執行：

```sh
npm ci
npm run dev
```

開發模式保留辨識功能，`/api` 會轉接至本機 `http://127.0.0.1:8080`；使用辨識時另開終端機啟動 Python。修改後執行 `npm run build` 更新本機版，或 `npm run build:static` 更新純前端版。

```sh
npm run format:check
npm run typecheck
npm run lint
npm test
npm run test:static
```

`test:static` 會建置無辨識版，使用本機 Google Chrome 與靜態預覽伺服器檢查操作，不啟動 Python。若已安裝 Python 相依套件，可再執行完整本機版檢查：

```sh
python -m pip install -r requirements-dev.txt
python scripts/check.py --browser
```

需要外部歌曲與模型的實際辨識測試預設略過，設定方式見 [架構與驗證文件](ARCHITECTURE.md#開發與驗證)。`tests/` 與 `web/tests/` 是應保留在版本控制中的測試原始碼；測試產物、私人素材、模型與快取由 `.gitignore` 排除。

## 專案結構與來源

| 路徑                        | 用途                                       |
| --------------------------- | ------------------------------------------ |
| `web/src/`                  | Vue 3、TypeScript 視覺化編輯器             |
| `web/public/`               | 字型、場景與相關素材署名                   |
| `web/vercel.json`           | Vercel 純前端部署設定                      |
| `lyricflow/`                | Python API、辨識與歌詞對齊流程             |
| `app.py` / `lyric_flow.py`  | 本機網頁服務 / 辨識 CLI                    |
| `lyric_flow_client.py`      | 本機辨識 API 的 Python 客戶端              |
| `tests/` / `web/tests/`     | 後端 / 前端與瀏覽器測試                    |
| `scripts/`                  | 安裝、檢查、歌曲資料夾準備與分鏡匯出工具   |
| `AGENTS.md` / `WORKFLOW.md` | AI 任務入口 / 歌曲製作與交付規格           |
| `input/` / `output/`        | 私人歌曲與生成成果，依需求建立，不納入 Git |

Web 視覺化工具特別致謝 **[考拉醬 | 謎謎之音](https://www.youtube.com/@meme-koala)**。第三方程式授權保留於 [THIRD-PARTY-LICENSES](web/public/THIRD-PARTY-LICENSES)，字型與場景素材的授權、來源署名保留在 [web/public/](web/public/)。

也歡迎到 [Regan 的 YouTube 頻道](https://www.youtube.com/@ReganOba) 看更多音樂作品。
