# LyricFlow｜歌詞對時與音樂影片製作

**繁體中文** | [English](README.en.md)

將歌曲、歌詞、圖片與影片組合成音樂影片。LyricFlow 提供字幕時間軸、手動對時、音樂視覺化、場景特效與影片匯出；安裝本機服務後，也能使用自動辨識與精準歌詞對齊。

**[開啟線上工具](https://lyric-flow-seven.vercel.app/)** · [快速開始](#快速開始) · [本機安裝](#本機安裝) · [歌曲資料夾工作流](#用歌曲資料夾製作完整素材) · [常見問題](#常見問題) · [文件導覽](#文件導覽)

> 線上版可編輯影音、手動對時與匯出影片，**不提供自動辨識或自動歌詞對齊**。這兩項功能需要在自己的電腦安裝 Python 服務及對應模型。

Web 視覺化編輯器以 **[考拉醬 | 謎謎之音](https://www.youtube.com/@meme-koala)** 提供的工具為基礎，特別感謝他的分享。

## 選擇使用方式

| 使用方式                                       | 適合情境                             | 需要安裝                        |
| ---------------------------------------------- | ------------------------------------ | ------------------------------- |
| [線上版](https://lyric-flow-seven.vercel.app/) | 直接編輯字幕、手動對時、製作影片     | 不需要                          |
| [本機純前端版](#本機純前端版)                  | 在自己的電腦執行相同的視覺化工具     | Node.js                         |
| [本機完整服務](#本機辨識與歌詞對齊)            | 自動辨識、依正確歌詞對齊，或串接 API | Node.js、Python、所需引擎與模型 |

三種方式都支援素材匯入、時間軸編輯、場景、專案保存與影片匯出。線上版的素材編輯、預覽與匯出在瀏覽器內執行，不會將歌曲送往 Python 辨識服務。

## 主要功能

- **字幕與對時**：匯入 SRT／LRC／TXT／Timeline JSON，逐句編輯、搜尋取代、手動標記、拖曳框選與整批調時，支援復原／重做。
- **影音時間軸**：編排圖片、影片與多音軌，移動、裁切、分割、複製片段，調整音量及連動字幕。
- **圖片字幕匯入**：以圖片檔名、時間與歌詞建立分鏡，讓畫面涵蓋前奏、間奏與片尾。
- **音樂視覺化**：頻譜、波形、光球、黑膠、轉場與沉浸場景；支援 16:9、1:1、9:16、中文字型、Logo、疊圖與色度去背。
- **保存與匯出**：瀏覽器自動草稿、包含素材的 `.resonance` 專案、SRT／LRC／Timeline JSON，以及依瀏覽器支援輸出的 MP4／WebM。
- **本機歌詞處理**：既有 ASR 歌詞比對，以及保留原文、提供可用逐字時間的精準歌詞對齊；可透過 API 或 CLI 使用。

## 快速開始

1. **加入歌曲**：開啟[線上工具](https://lyric-flow-seven.vercel.app/)，按「匯入音訊」。首次匯入會將第一首歌曲加入音軌。
2. **加入歌詞**：按「匯入字幕」，或開啟「歌詞編輯 → 逐句字幕」輸入／貼上歌詞。
3. **調整時間**：尚未對時的歌詞使用「開始對時」，邊聽邊標記；已有時間的字幕可直接在時間軸微調。本機版也可使用下方的自動對齊功能。
4. **編排畫面**：匯入圖片／影片，選擇場景與特效。需要畫面固定跟隨歌曲時間時，使用「手動時間軸」或圖片字幕 JSON。
5. **匯出影片**：在「匯出設定」選擇尺寸、幀率、畫質與範圍，再按播放器的「開始錄影」。只需字幕時，使用歌詞編輯區的下載按鈕。
6. **保存作品**：確認草稿已儲存；要備份或換裝置，按「儲存專案」下載 `.resonance`。

手動對時快捷鍵：**空白鍵／→** 標記、**←** 復原、**0** 插入空白時間點、**Enter** 完成。取消對時會保留原字幕。

影片採**即時錄製**，所需時間取決於選定區段長度。支援直接存檔的瀏覽器可邊錄邊寫入磁碟；其他瀏覽器使用約 **256 MiB** 記憶體暫存，達上限時會停止並保存已錄內容。停止後請等待存檔完成，格式與效能依瀏覽器而異。

## 本機安裝

以下指令皆在專案根目錄執行，也就是能看到 `app.py` 與 `package.json` 的資料夾。

### 本機純前端版

需要 **Node.js 22.12 以上**，不需要 Python。

```sh
npm ci
npm run build:static
npm run preview:static
```

開啟終端機顯示的網址。此模式與線上版相同，不提供自動辨識，建置輸出為 `web/dist-static/`。

### 本機辨識與歌詞對齊

需要 **Node.js 22.12 以上**。以下使用 **Python 3.12**，供主服務與對齊引擎共用安裝流程。主服務可使用 3.12 以上，但對齊依賴目前固定為 NumPy 1.26.4，其[支援範圍為 Python 3.9–3.12](https://numpy.org/devdocs/release/1.26.4-notes.html)，請勿直接以 Python 3.13／3.14 建立新的對齊環境。

初次安裝需連網下載套件與模型；引擎可使用本機 CPU，不需要 NVIDIA GPU。

**1. 建立前端與 Python 環境**

macOS／Linux：

```sh
npm ci
npm run build
python3.12 -m venv .venv
source .venv/bin/activate
python -m pip install -r requirements.txt
```

<details>
<summary>Windows：建立環境</summary>

安裝 Python x64（含 Python Launcher），在 PowerShell 執行：

```powershell
npm ci
npm run build
py -3.12 -m venv .venv
.venv\Scripts\python.exe -m pip install -r requirements.txt
```

下方指令中的 `python` 請改用 `.venv\Scripts\python.exe`。

原生 Windows 仍待實機驗證；也可在 WSL2 中依 Linux 步驟操作。不同作業系統請各自建立 `.venv/`、`.venv-alignment/` 與 `.local/`。

</details>

**2. 安裝需要的引擎，可擇一或兩者都裝**

| 功能              | 操作入口         | 處理方式                                       | 音檔長度上限 |
| ----------------- | ---------------- | ---------------------------------------------- | ------------ |
| 精準歌詞對齊      | 「精準歌詞對齊」 | 依提供的正確歌詞定位，保留原文與可用的逐字時間 | 10 分鐘      |
| 既有 ASR 歌詞比對 | 「自動辨識」     | 先辨識音訊，再與提供的歌詞比對                 | 30 分鐘      |

精準歌詞對齊：

```sh
python scripts/setup_alignment.py --separation
```

會建立獨立的 `.venv-alignment/`，安裝對齊模型及人聲分離，需要數 GB 空間。省略 `--separation` 可只安裝原音對齊。此引擎不依賴下方的 whisper.cpp；詳細操作與 MyCut 串接見[歌詞時間軸文件](LYRICS_ENGINE.md)。

既有 ASR 歌詞比對：

```sh
python -m pip install -r requirements-build.txt
python scripts/setup.py
```

此步驟編譯 whisper.cpp，將引擎與模型放入 `.local/`。macOS 需 Command Line Tools（`xcode-select --install`），Linux 需 C/C++ 編譯工具與對應的 `venv` 套件；Windows 需 Visual Studio 2022 Build Tools 的「使用 C++ 的桌面開發」工作負載，也可雙擊 `setup-windows.cmd` 完成 ASR 安裝。

**3. 啟動服務**

```sh
python app.py --open
```

開啟 `http://127.0.0.1:8080`，使用期間保留終端機，按 **Ctrl+C** 關閉。下次啟動不必重新安裝：

```sh
# macOS / Linux
.venv/bin/python app.py --open
```

Windows 使用 `.venv\Scripts\python.exe app.py --open`。已安裝 ASR 引擎時，也可使用 `start-mac.command` 或 `start-windows.cmd` 啟動。

<details>
<summary>升級既有 Python 環境</summary>

先停止服務，將舊 `.venv` 改名備份，再重建環境並安裝相依套件；需要安裝對齊引擎時請使用 Python 3.12。虛擬環境不會隨系統 Python 自動升級；`.local/` 的既有引擎與模型可繼續使用。僅執行主服務時可使用較新的 Python，3.13 以上會自動安裝 `audioop-lts`。

</details>

### 使用本機對齊功能

1. 匯入歌曲，確認要處理的歌曲已加入音軌。
2. 開啟已安裝引擎的操作入口，貼上完整歌詞，每行一句，重複副歌也完整列出。
3. 精準歌詞對齊請移除未唱出的 `[Verse]` 等標記；長前奏、間奏或伴奏較強時可選擇「分離人聲」。
4. 送出後查看進度。已有字幕會先確認取代；成功前、失敗或取消時，原字幕都會保留。
5. 完成後逐句試聽與微調。需要保留逐字時間時下載 **Timeline JSON**，SRT／LRC 不保存逐字資訊。

兩種模式皆支援 WAV、MP3、M4A、AAC、FLAC、AIFF，音檔上限 **200 MiB**，歌詞上限 **12,000 字元**；API 上傳的 UTF-8 歌詞檔上限 **64 KiB**。長音、和聲、間奏與重複段落可能影響對齊，結果仍需試聽。ASR 未定位句不會放入輸出的 SRT，請補辨識或手動確認後再製作完整素材。

重整後若遇到既有工作，可在彈窗查看狀態、停止或下載完成結果。建立後 **5 分鐘仍未開始上傳音訊**的工作，會在下次查詢或提交時釋放名額；正常上傳與辨識不受此期限影響。API、補辨識與 Python 客戶端見 [API.md](API.md)。

## 用歌曲資料夾製作完整素材

每首歌準備一個資料夾，放入一首音檔及一份 UTF-8 TXT 完整歌詞；音檔與歌詞檔名可自行命名：

```text
input/我的歌曲/
  我的歌曲.mp3
  歌詞.txt
  專輯名稱.txt       # 選填，固定此檔名，內容為單行專輯名稱
```

交給能讀寫本機檔案、使用對時服務並生成／檢視圖片的 AI，可直接使用：

> 請先讀此專案的 AGENTS.md 與 WORKFLOW.md，處理 input/我的歌曲，產出完整 SRT、獨立分鏡圖、圖片字幕 JSON，以及含專輯名稱的封面。若已有 output，請核對來源與進度後接續製作。

本工作流使用既有 ASR 引擎的對時結果；開始前請先安裝該引擎並啟動本機服務。放入檔案不會自動開始製作。來源歌詞可保留 Suno 段落標記，但重複副歌須完整列出。

預設為 **16:9 分鏡圖、人物與畫風一致、不含文字並保留字幕空間**，以及 **1:1、含專輯名稱的封面**。可在指令中指定畫風、張數、比例與名稱。

成果放在該歌曲的 `output/`，包含 `lyrics.srt`、`images/`、`image-subtitles.json`、封面、分鏡與來源／進度紀錄。接手時先讀 `output/PROGRESS.md`，再核對來源及實際成果。完整交付與驗收規格見 [WORKFLOW.md](WORKFLOW.md)；私人素材與成果不納入 Git，請另行備份。

### 把分鏡匯入編輯器

1. 匯入原始歌曲，確認音軌長度。
2. 匯入 `images/` 中的圖片，保留檔名，避免同名素材。
3. 按「匯入圖片字幕 JSON」開啟 `image-subtitles.json`。它會切換至手動時間軸，**取代 V1 畫面片段與整份字幕**，保留音訊、素材庫與樣式，不必再匯入 SRT。
4. 試聽字幕與圖片切換，再錄製影片。封面不會自動插入影片。

圖片字幕 JSON 使用 `version: 1`，與保存逐字時間的 **Timeline JSON 是不同格式**。檔名須與已匯入圖片完全相符，歌詞不可空白；第一張圖從 0 秒顯示，最後一張延伸至現有音軌或字幕結尾。下載[範例 JSON](web/public/examples/image-subtitles.json)，欄位、限制與相容格式見[圖片字幕格式](web/public/examples/image-subtitles.md)。

## 保存與資料位置

| 資料              | 保存位置與用途                                                                   |
| ----------------- | -------------------------------------------------------------------------------- |
| 瀏覽器草稿        | 目前瀏覽器的 IndexedDB，只保留最新一份；重整後選擇恢復，儲存失敗保留前次成功內容 |
| `.resonance` 專案 | 使用「儲存專案」下載，包含素材、字幕、時間軸與設定，適合備份或換裝置             |
| 本機辨識工作      | `.cache/interface/`，包含上傳音檔、歌詞、結果與紀錄                              |
| 本機快取與模型    | `.cache/`、`.local/`，依引擎保存轉檔、辨識／對齊快取與模型                       |

草稿依瀏覽器與網站網址（含連接埠）分開，線上版與本機版不會自動共用。多分頁編輯發生衝突時，需選擇保留的版本。

「重置」會清空目前作品與該網站的草稿；清除瀏覽器網站資料也會刪除草稿。兩者都不會刪除電腦原始檔、已下載專案或 Python 後端工作資料。清理後端快取前，請先備份結果並停止服務。

## 常見問題

| 問題                         | 處理方式                                                                                                 |
| ---------------------------- | -------------------------------------------------------------------------------------------------------- |
| 線上版找不到自動辨識？       | 線上版只提供手動對時；自動功能請使用本機服務並安裝對應引擎。                                             |
| 本機首頁提示尚未建置？       | 在專案根目錄執行 `npm ci`、`npm run build`；Flask 使用 `web/dist/`。                                     |
| 圖片沒有跟隨播放／跳轉？     | 自動編排採獨立輪播時鐘；固定歌詞配圖請用圖片字幕 JSON 或手動時間軸。切回自動模式會清空 V1。              |
| 如何關閉圖片隨音樂縮放？     | 將「作品設定 → 畫面與背景 → 背景律動」設為 `0`，並視需要關閉「氛圍特效 → 節奏鏡頭衝擊」。                |
| 如何更換或移除預設 Logo？    | 在「Logo 與疊圖」調整。單純載入 Logo 不會建立空白草稿，首次保存草稿會包含它。                            |
| 換瀏覽器／裝置後找不到作品？ | 草稿不跨裝置同步；在原環境下載 `.resonance`，再到新環境「開啟專案」。                                    |
| SRT 匯入後沒有逐字高亮？     | SRT 只保存逐句時間；需保留逐字資訊時使用 Timeline JSON。修改文字或裁切後，失效的逐字資訊會退回逐句字幕。 |

## 開發與部署

開發模式：

```sh
npm ci
npm run dev
```

`/api` 會轉接至 `http://127.0.0.1:8080`；需要辨識時，另開終端機啟動 Python 服務。

| 指令                                                        | 用途                                        |
| ----------------------------------------------------------- | ------------------------------------------- |
| `npm run build`                                             | 建置 `web/dist/`，供本機 Flask 使用         |
| `npm run build:static`                                      | 建置無辨識版至 `web/dist-static/`           |
| `npm run format:check`、`npm run typecheck`、`npm run lint` | 前端格式、型別與靜態檢查                    |
| `npm test`                                                  | 前端單元測試                                |
| `npm run test:e2e`                                          | 以 Vite 與本機 Google Chrome 執行瀏覽器測試 |
| `npm run test:static`                                       | 建置並驗證純前端版，不啟動 Python           |

完整本機檢查（使用已安裝相依套件的 `.venv`）：

```sh
.venv/bin/python -m pip install -r requirements-dev.txt
.venv/bin/python scripts/check.py --browser
```

Windows 請改用 `.venv\Scripts\python.exe`。檢查腳本會建置前端、啟動暫時服務並在結束後清理；需要本機 Google Chrome。真實歌曲測試需另設素材，選用引擎有獨立測試，見[架構與驗證](ARCHITECTURE.md#開發與驗證)。

部署 Vercel 時，Root Directory 設為 **`web`**，使用 `npm run build:static` 與輸出目錄 `dist-static`。[web/vercel.json](web/vercel.json) 已提供建置設定，不需要 Python 或 API Key。完整步驟見[前端部署文件](web/README.md#vercel只部署-vue-前端)。

## 文件導覽

| 文件／目錄                                             | 內容                                       |
| ------------------------------------------------------ | ------------------------------------------ |
| [web/README.md](web/README.md)                         | 編輯器操作、場景、影片匯出、前端開發與部署 |
| [LYRICS_ENGINE.md](LYRICS_ENGINE.md)                   | 精準歌詞對齊、逐字字幕與 MyCut 串接        |
| [API.md](API.md)                                       | 本機 API、工作管理、補辨識與 Python 客戶端 |
| [WORKFLOW.md](WORKFLOW.md)／[AGENTS.md](AGENTS.md)     | AI 歌曲製作、交付驗收與接手規則            |
| [ARCHITECTURE.md](ARCHITECTURE.md)                     | 模組責任、工作生命週期與完整驗證流程       |
| [圖片字幕格式](web/public/examples/image-subtitles.md) | 分鏡 JSON 欄位、限制與範例                 |
| `web/src/`／`lyricflow/`                               | Vue 編輯器／Python 服務與歌詞處理          |
| `scripts/`／`tests/`／`web/tests/`                     | 安裝與工作流腳本／後端與前端測試           |

## 致謝與授權

特別感謝 **[考拉醬 | 謎謎之音](https://www.youtube.com/@meme-koala)** 提供 Web 視覺化工具。LyricFlow 在此基礎上整合字幕編輯、影音時間軸、專案保存與本機辨識流程，歡迎前往頻道欣賞他的作品。

第三方程式授權保留於 [THIRD-PARTY-LICENSES](web/public/THIRD-PARTY-LICENSES)，字型與場景素材的授權、來源署名位於 [web/public/](web/public/)。也歡迎到 [Regan 的 YouTube 頻道](https://www.youtube.com/@ReganOba) 看更多音樂作品。
