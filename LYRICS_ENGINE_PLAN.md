# Lyrics Timeline Engine：Phase 1 實作方案

先完成 known_lyrics，再考慮 audio-only ASR 與 Hybrid。本次不新增圖片、分鏡或雲端服務。
此方案在修改程式前建立；MyCut 原方案保留供比較。

## 決策與落點

沿用 Flask 8080、JobStore、ProcessRunner、FFmpeg、進度與取消，不再引入第二套
FastAPI／工作佇列。新 `/lyrics/align`（同源 `/api/lyrics/align`）回傳工作，
`?wait=true` 可取得 LyricProject；完成後下載 JSON／SRT。舊 API／舊 ASR 流程保留。
`GET /health` 回報服務與新引擎 readiness；所有 AI 在 Python 子程序執行。

新增 `lyricflow/timeline/`：contract/export、normalization、CTC、模型 adapter、
分離 adapter、cache、pipeline 與 worker。新增獨立 alignment requirements／安裝腳本。
修改 validation/uploads/routes/processor/service/job_store/factory，僅增加新 mode 分支。

共用 `packages/lyrics-timeline/` 提供 TypeScript wire contract、runtime validation、
SRT 輸出。JSON：version/duration/mode/segments，segment.id/start/end/text/confidence?/words?。
所有時間為絕對秒数；顯示原文不被繁簡轉換或 ASR 改寫。輸出只含有效時間，失敗回報
結構化 code/message/details/suggestion，不插入平均時間。

## 模型與音訊

正式路徑採本機 Whisper small + stable-ts 的 **known-text attention／DTW alignment**，
只呼叫 `align(audio, original_text)`，不呼叫 `transcribe()`。使用固定官方模型 checksum；
繁簡正規化只協助 token 與顯示原文對應，回傳的文字永遠來自使用者。
[stable-ts 原始文件](https://github.com/jianfch/stable-ts) 說明 plain-text alignment API。
中文 Wav2Vec2 CTC／同音字池保留為選用研究 adapter（`--ctc`），不作預設歌唱引擎。
[中文 CTC 模型來源](https://huggingface.co/jonatasgrosman/wav2vec2-large-xlsr-53-chinese-zh-cn)。

`VocalSeparator` 可替換；原音與選用 Demucs 明確區分。Demucs stem 上以振幅門檻定位
有聲區段，移除長安靜空檔，保留原始 sample offset；對齊後還原絕對秒數。
這是分離人聲上的能量分析，不宣稱為訓練完成的 singing voice classifier。
原音不套用此門檻，避免將樂器能量當成人聲。長間奏建議選人聲分離。
模型無法確認全句、低支持或句內跨越長空檔時明確失敗，不補平均時間。
單字超過 12 秒或句內字詞相隔超過 8 秒會要求檢查／分行，極長拖音可能需手動處理。
[Demucs 來源](https://github.com/adefossez/demucs)。

CPU 可執行，Whisper 可自動使用 CUDA；Demucs 目前固定 CPU；MPS 尚未啟用。
依賴在獨立 `.venv-alignment`，保留現有 Whisper CLI 與原 Python 環境。
每階段回報實際進度；短音檔可能一次完成大段百分比，沒有假進度計時器。

## 快取與錯誤

以原始音訊內容 hash + 原始歌詞 hash + engine/model revision + preserve_lines + separator
識別結果；原子寫入。分離另按音訊／provider cache，改歌詞不重跑分離。
模型本機載入，不在分析請求偷偷下載。health 顯示缺失依賴／模型；工作錯誤保留原因與建議。
沿用一次一個工作與整個子程序群組取消；取消／失敗不套用前端字幕。

## 前端與資料流

新增來源面板：正確歌詞精準對齊、SRT／JSON 匯入；保留舊 ASR 比對入口。
獨立 audio-only ASR 屬 Phase 2，不把舊模式改標為已實作。
對齊結果 → 共用 validator → 音軌 trimStart/start 投影 → 字幕編輯 → 預覽／JSON／SRT。
words 與 confidence 經結構化 raw JSON 保存，舊 raw SRT／LRC 仍可讀；既有專案字串欄位
可保存新格式，避免無關的 manifest 遷移。文字修改／非線性裁切使 words 失效並回到逐句。
補合併、語意文字分割、播放單句；拖曳左右端沿用原時間軸。

MyCut 在第一端測試通過後，以 Express 固定 loopback 代理及 seconds→frames adapter
接入既有 applyCaptions，建立字幕軌，不修改圖片 clips；JSON／SRT 從當前編輯資料匯出。
共用 package 使用版本化本機封裝，不依賴桌面絕對路徑。

## 驗證順序

1. CTC blank／重複字／長 gap／不可能路徑、原文與分行、cache、錯誤、API 取消。
2. 共用 JSON／SRT、words 保存、拖動／裁切／合併／分割／undo、播放與空檔。
3. 既有 Python、Vue typecheck/lint/unit/build/browser 回歸。
4. 本機真音檔 CPU smoke 與人工邊界比較；沒有 ground truth 不聲稱精度驗收通過。
5. 第一端通過後接 MyCut，typecheck/tests/build 與字幕軌／圖片不變驗證。

## 已實作與實測（2026-09-30）

- 共用 TypeScript package、Python validator/exporter、獨立 worker、cache／進度／取消已接入。
- LyricFlow：JSON 原文與 words 保存，逐字高亮／逐句 fallback，起訖編輯、播放、合併／分割、undo；自動圖片節奏在套用新歌詞前保存。
- MyCut：Express loopback bridge、音訊 trim／速度／混音擷取、來源變更與取消競態保護、獨立字幕軌、JSON／SRT 匯出、字幕合併／分割、播放單句。既有 frame 模型保留，交換邊界換算秒數，精度為一影格。
- MyCut 原有未追蹤架構文件與工作區其他修改保留。本次實作說明在 `LYRICS_ENGINE_INTEGRATION.md`。
- 本機 Intel Mac CPU：既有歌曲前 31 秒，4 行繁體歌詞，全 API（從 `/private/tmp` 啟動 worker）約 7.65 秒；人聲分離已快取。第一句 14.70 秒起，產生 JSON／SRT／逐字資料。
- 將同一片段重複、插入 30 秒原曲器樂得到 92 秒 fixture：人聲分離後 8 句按順序對齊，兩次第一句在 14.70、75.70 秒；第一段在 26.28 秒結束。分離約 54 秒；使用已分離 stem 的對齊與輸出約 7.31 秒。原音對齊跨長間奏案例加入拒絕回歸。
- 測試結果與命令見 `LYRICS_ENGINE_TESTS.md`；私人音訊與 smoke 產物在 `.cache/timeline-smoke/verified-api`、`verified-repeat`，不納入 Git。

這些結果驗證可執行、原文、順序、前奏與長間奏案例，**不是全曲人工標記的精度認證**。
尚無使用者指定的全曲正確歌詞／人工時間基準；歌唱結果仍需試聽微調。
人工基準資料格式、逐句／逐字計分和標籤分組流程見 [評估指南](evaluation/timeline/README.md)。
Phase 2 新 audio-only 引擎與 `/lyrics/transcribe`、Phase 3 hybrid 尚未實作；保留既有 ASR。
