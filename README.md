# LyricFlow Windows

基於 [regan1114/LyricFlow](https://github.com/regan1114/LyricFlow) 的 Windows 相容性修訂。原作與來源版本見 [UPSTREAM.md](UPSTREAM.md)。

**驗證狀態：Linux 自動測試已通過；原生 Windows 修訂尚待 Windows CI／實機驗證，請勿視為已測試的正式 Windows 發行版。**

**繁體中文** | [English](README.en.md)

在自己的電腦上，將歌曲與歌詞對齊，產生 SRT 字幕。

## 新版前端

目前首頁已改用 `video_visual` 的 Vue 3 影音編輯器，整合後的原始碼位於 `web/`。
支援素材匯入、字幕時間軸、手動歌詞對時、場景特效與影片匯出；操作說明見 [前端文件](web/README.md)。
右上角「自動辨識」可使用已匯入的歌曲，開啟彈窗輸入歌詞後送出。有現有字幕時先確認取代；取消確認會保留輸入並暫停送出。辨識成功後才替換字幕，失敗或取消辨識保留原內容。彈窗顯示辨識進度，完成後可在字幕時間軸微調；補辨識仍透過 [API](API.md)／CLI 使用。

首次啟動前，先安裝 Node.js 22.12 以上並在專案根目錄執行（Windows／macOS／Linux 相同）：

```sh
npm ci
npm run build
```

接著依下方步驟安裝並啟動 Python 後端。`app.py --open` 與 `start-windows.cmd` 會在原本的 `http://127.0.0.1:8765` 開啟新版。建置完成後，日常啟動不需要 Node.js。
前端開發使用 `npm run dev`；修改後執行 `npm run build` 更新 Flask 提供的版本。

若只要將 Vue 前端部署到 Vercel，匯入 Git 倉庫時將 **Root Directory 設為 `web`**。已提供 `web/vercel.json`，會執行 `npm run build:static`，只發布 `dist-static/` 並關閉自動辨識；完成首次連接後，推送正式分支即可自動更新。完整步驟見[前端部署文件](web/README.md#vercel只部署-vue-前端)。

以下自動辨識功能說明適用於後端 API／CLI。

## 製作目的

LyricFlow 為需要製作歌曲字幕的創作者而設計。提供音檔與實際演唱的歌詞，就能取得字幕時間軸，省下逐句設定時間的工作。
支援一般歌詞與 Suno 格式歌詞，使用本機 CPU 處理，不需要付費辨識服務；完成初次安裝後可離線使用。

- **網頁操作**：上傳歌曲、匯入或貼上歌詞，逐句試聽並下載 SRT。
- **處理進度**：顯示目前階段與進度，支援停止工作。
- **補辨識漏句**：重新辨識未定位片段，保留已定位及手動調整的時間。
- **字幕微調**：修改每句起訖時間，匯出前檢查重疊、倒置與歌曲長度。

目前介面使用繁體中文，辨識語言固定為中文。Suno 的 `[Verse]`、`[Chorus]` 等段落標記會略過，實際歌詞與重複副歌會保留。

## 環境需求

- **Python 3.9–3.12，建議 3.12**。目前使用的 `audioop` 在 Python 3.13 已移除，因此不支援 3.13 以上版本。[Python 說明](https://docs.python.org/3/library/audioop.html)
- **Windows x64、macOS 或 Linux**。Windows 使用 Visual Studio 2022 Build Tools；macOS／Linux 需要 C/C++ 編譯器與 Make。本修訂的 Windows 支援仍待 CI／實機驗證；WSL2 仍可作為替代流程。
- 初次安裝需要網路，以取得 Python 套件、whisper.cpp 與模型。
- 不需要 GPU。預設使用 4 個 CPU 執行緒，輕負載模式使用 2 個。

macOS 若尚未安裝編譯工具：

```sh
xcode-select --install
```

Linux 請先安裝發行版提供的 C/C++ 編譯工具、Make，以及對應 Python 版本的 `venv` 套件。

## 安裝

### Windows 原生安裝（x64，待驗證）

1. 安裝 [Python 3.12 x64](https://www.python.org/downloads/windows/)，保留 Python Launcher（`py`）。目前不支援 Python 3.13 以上，也不支援原生 ARM64／32 位元 Python。
2. 安裝 [Visual Studio 2022 Build Tools](https://visualstudio.microsoft.com/vs/older-downloads/)，選取「使用 C++ 的桌面開發」，包含 MSVC v143 與 Windows SDK。只安裝 CMake 不足以編譯引擎。
3. 將完整原始碼解壓至自己的本機資料夾，例如 `C:\LyricFlow-Windows`。不要帶入 Mac／WSL 的 `.venv` 或 `.local`，也不要放在共用或雲端同步資料夾。
4. 雙擊 `setup-windows.cmd`。安裝過程會連網下載套件、固定版本引擎原始碼與約 181 MiB 模型；原始碼與模型維持 SHA-256 驗證。
5. 成功後雙擊 `start-windows.cmd`。瀏覽器開啟 `http://127.0.0.1:8765`，使用期間保留命令視窗，按 Ctrl+C 結束。

也可在專案根目錄的 PowerShell 執行（不需要修改 PowerShell 執行政策）：

```powershell
py -3.12 -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r requirements.txt -r requirements-build.txt
.\.venv\Scripts\python.exe scripts\setup.py --jobs 1
.\.venv\Scripts\python.exe app.py --open
```

- `Visual Studio 17 2022` 找不到：確認安裝的是 **2022** Build Tools 和 C++ 工作負載，完成後重新開啟終端機。
- 虛擬環境版本錯誤：將舊 `.venv` 改名備份，再重新執行安裝；不要覆蓋使用中的環境。
- `SHA-256 verification failed`：不要略過驗證；保留錯誤並檢查下載來源與網路。
- `WinError 206`／路徑過長：改用較短的本機專案及暫存目錄，再重試。
- Job Object 指派失敗：程式會停止該次工作，避免留下未受管理的背景辨識程序；請保留錯誤並檢查執行環境的程序限制。

安裝並非預先封裝的免安裝 EXE；Windows 自動測試定義位於 `.github/workflows/check.yml`。

### macOS / Linux

下載或 clone 本專案，進入能看到 `app.py` 的專案根目錄，確認 `python3 --version` 符合上述版本範圍，再執行：

```sh
python3 -m venv .venv
source .venv/bin/activate
python -m pip install --upgrade pip
python -m pip install -r requirements.txt -r requirements-build.txt
python scripts/setup.py
```

安裝腳本會：

1. 從官方來源下載[固定版本的 whisper.cpp](https://github.com/ggml-org/whisper.cpp/tree/371b5a7561823ab2bb32142d2751e35e7534727b)，驗證 SHA-256 後編譯 CPU 引擎。
2. 下載並驗證 `small` 多語 Q5_1 模型，約 181 MiB。
3. 將執行檔、模型及引擎授權文字放入 `.local/`，自動清除暫時的原始碼與編譯檔。

重複執行會保留已安裝的引擎，並驗證現有模型。需要重新編譯時使用 `python scripts/setup.py --rebuild`；較弱的電腦可加上 `--jobs 1`。
CMake 只用於編譯，安裝完成後可用 `python -m pip uninstall cmake` 移除；再次編譯前重新安裝 `requirements-build.txt` 即可。

### Windows (WSL2)

在 Windows 上，使用 WSL2 的 Ubuntu 24.04 安裝與執行。辨識仍在自己的電腦進行，初次安裝完成後可離線使用。
以下步驟適用於 Windows 11，或 Windows 10 版本 2004（組建 19041）以上。[微軟 WSL 安裝說明](https://learn.microsoft.com/zh-tw/windows/wsl/install)

**1. 安裝 WSL2 與 Ubuntu**

以「系統管理員身分」開啟 **PowerShell**，執行：

```powershell
wsl --install -d Ubuntu-24.04
```

依提示重新開機，再從開始功能表開啟「Ubuntu 24.04」，設定 Linux 使用者名稱與密碼。也可以在 PowerShell 執行以下指令開啟 Ubuntu：

```powershell
wsl -d Ubuntu-24.04
```

**2. 安裝必要工具**

從這一步開始，所有安裝指令都在 **Ubuntu 終端機**執行：

```bash
sudo apt update
sudo apt install -y python3 python3-venv python3-pip build-essential
```

Ubuntu 24.04 預設提供 Python 3.12，符合專案需求。[Ubuntu 套件資訊](https://packages.ubuntu.com/noble/python3)

**3. 放入專案原始碼**

從 GitHub 下載專案原始碼，解壓縮至 Windows 的 `C:\LyricFlow`，確認 `app.py` 直接位於該資料夾內。
若從其他電腦複製，請只帶原始碼，不要帶 `.venv/`、`.local/` 與 `.cache/`；Python 環境與辨識引擎需要在 Ubuntu 重新安裝。

在 Ubuntu 將專案複製到 Linux 家目錄，再進入專案：

```bash
mkdir -p ~/LyricFlow
cp -r /mnt/c/LyricFlow/. ~/LyricFlow/
cd ~/LyricFlow
```

**4. 安裝套件、辨識引擎與模型**

```bash
python3 -m venv .venv
source .venv/bin/activate
python -m pip install --upgrade pip
python -m pip install -r requirements.txt -r requirements-build.txt
python scripts/setup.py --jobs 1
```

`--jobs 1` 使用單一編譯工作，降低安裝時的電腦負載。安裝腳本會下載並編譯 CPU 引擎，以及下載約 181 MiB 的模型。

## 啟動與使用

### macOS / Linux

在已啟用虛擬環境的終端機執行：

```sh
python app.py --open
```

也可以不啟用虛擬環境，直接在專案根目錄執行：

```sh
.venv/bin/python app.py --open
```

瀏覽器會開啟 **http://127.0.0.1:8765**。若未自動開啟，手動輸入此網址即可。使用期間保留終端機視窗，按 **Control+C** 關閉服務。

### Windows / WSL2

每次使用時，開啟 **Ubuntu 終端機**執行：

```bash
cd ~/LyricFlow
.venv/bin/python app.py
```

接著在 **Windows 的 Chrome 或 Edge** 開啟 **http://127.0.0.1:8765**。WSL 內的網頁服務可透過 Windows 的本機網址存取。[微軟 WSL 網路說明](https://learn.microsoft.com/en-us/windows/wsl/networking)
使用期間保留 Ubuntu 終端機，按 **Ctrl+C** 關閉程式。

### 網頁操作

1. 選擇歌曲：支援 WAV、MP3、M4A、AAC、FLAC、AIFF，單檔最多 200 MB、30 分鐘。
2. 貼上歌詞或匯入 UTF-8 `.txt`，每句各放一行，再按「開始對齊」。
3. 完成後逐句試聽、調整時間；有未定位句子時，可按「補辨識漏句」。
4. 按「下載 SRT」，取得包含目前時間調整的字幕。

歌詞上限為 12,000 字，文字檔上限為 64 KB。一次處理一首，所有上傳與辨識都在本機進行。
進度百分比代表目前階段；重新辨識、補查與匯出是不同階段。

### 命令列

CLI 接受 PCM WAV 音檔；其他格式請使用網頁，會由隨 Python 套件提供的 FFmpeg 轉換。
以下素材路徑為範例，請換成自己的檔案：

```sh
python lyric_flow.py /path/to/song.wav /path/to/lyrics.txt --threads 2 --output output
```

輸出 `.draft.srt`、`.review.txt` 與 `.alignment.json`。`--no-retry` 可關閉首次對齊的自動漏句補查。

## 資料與準確度

隱私與資安檢查範圍、已修正項目及尚未驗證事項見 [SECURITY-REVIEW.md](SECURITY-REVIEW.md)。

**停止／取消不會刪除資料。** `.cache/interface` 保留音檔、歌詞、工作狀態與日誌；`.cache/lyric-flow` 保留轉檔與辨識快取；瀏覽器 localStorage 保存工作識別與編輯資料。上述內容沒有應用程式層級加密。分享專案請只分享原始碼，不要整個工作資料夾打包。

- `.venv/` 是本機 Python 環境，`.local/` 是引擎與模型，兩者都由 `.gitignore` 排除。
- `.cache/` 保存上傳素材、工作結果及辨識快取，`output/` 保存 CLI 輸出。專案不附帶私人歌曲、歌詞或處理成果。
- 瀏覽器會記住最近工作與時間調整。請下載 SRT 留存；清除瀏覽器網站資料會刪除這些本機調整。
- 停止服務後可以刪除 `.cache/` 和 `output/`；先前工作將無法還原，下次需重新辨識。
- 提交 GitHub 時保留 `.gitignore`，並以 `git status --short` 確認不含素材、環境、憑證或快取。

時間軸由語音辨識加上歌詞順序比對產生，並非專門的歌唱強制對齊模型。長音、間奏、重複段落與伴奏都可能影響結果。
`text_match_score` 是文字匹配分數，不是時間正確率；未找到的句子不會被憑空加上時間。自動字幕及補辨識結果都建議試聽確認。

## 開發與測試

一般自動測試不需要下載模型或編譯引擎；只有實際辨識測試需要完成安裝。再安裝開發工具；Node.js 22.12 以上與 npm 用於前端建置與檢查，完成建置後平常啟動程式不需要：

```sh
python -m pip install -r requirements-dev.txt
npm ci
python scripts/check.py
```

檢查包含 Python 格式與靜態檢查、前端測試、Flask 後端、工作管理及補辨識測試。
測試服務使用獨立連接埠與暫時工作資料夾，結束後會關閉並清理測試上傳。
安裝引擎後可執行 `python -m scripts.smoke_engine`，使用合成靜音檢查模型載入、中文路徑與 SRT 匯出；這不代表歌曲辨識準確度。

需要外部歌曲的 7 項整合測試預設略過，設定方式見 [ARCHITECTURE.md](ARCHITECTURE.md#開發與驗證)。

主要結構：`lyricflow/` 為後端與辨識流程、`web/` 為網頁、`tests/` 為測試、`scripts/` 為安裝與檢查工具。

## YouTube

歡迎到 [YouTube 頻道](https://www.youtube.com/@ReganOba) 看更多音樂作品。
