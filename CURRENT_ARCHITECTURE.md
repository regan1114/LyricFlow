# 現有架構盤點

盤點日期：2026-09-30。範圍：LyricFlow 與 `/Users/regan/Desktop/ＭyCut`。
MyCut 已有 2026-09-29 的完整盤點與方案（未追蹤文件）；本次保留原檔。

## 執行邊界

| 項目 | LyricFlow／音樂視覺化工具 | MyCut |
| --- | --- | --- |
| UI | Vue 3 + TypeScript + Vite | React 19 + TypeScript + Electron |
| API | Flask，127.0.0.1:8080 | Express，開發 4318、桌面動態 port |
| 音訊 | useAudioPlayer → Web Audio 時間軸 | Preview → HTML media／Web Audio |
| 影片 | Canvas／Three.js → MediaRecorder | Canvas／native render → FFmpeg |
| 字幕 | SubtitleCue.time/endTime（秒） | text Clip.start/duration（影格） |
| SRT | web/src/domain/subtitles.ts | shared/model.ts、shared/captions.ts |
| 時間軸 | SubtitleTimeline.vue、useSubtitleEditor.ts | Timeline.tsx、shared/editing.ts |
| 辨識 | whisper.cpp → 文字／同音字比對 | whisper.cpp → Cue → applyCaptions |

## 現有後端

`factory.py → routes/uploads/validation → AlignmentService → JobStore + AlignmentProcessor
→ ProcessRunner → lyric_flow.py → pipeline → recognition/alignment/subtitles`。

已有單一工作限制、原子儲存、重啟讀取、取消程序群組、上傳限制、本機 Host／Origin
檢查、FFmpeg 解碼、ASR 快取與逐階段進度。`/api/align` 與 Python client 為現有相容 API。
`alignment.py` 是辨識文字的全局順序匹配，**不是真正 acoustic forced alignment**。
內字元時間可能為估計，不能標為逐字聲學時間。

## 字幕與保存

LyricFlow 的 `useLyrics.raw` 是持久來源，`useSubtitleEditor` 每次編輯寫回 SRT，
renderer 再解析 raw；專案／草稿同樣只存此字串。新增 words 時必須跨越編輯、復原、
保存與還原，不能只在 API 回應加欄位。現有第二／第三行字幕、SRT、LRC 保持相容。

MyCut `shared/captions.ts::applyCaptions` 建立獨立文字軌、驗證音訊 signature，
保留圖片。`shared/karaoke.ts` 的 words 為句內影格，必須從秒數換算，無有效 words
已有逐句 fallback。`ProjectSchema` 控制保存，不能依賴未宣告欄位。

## 需保留的功能與限制

字幕拖曳／裁切／分割／刪除／復原、素材管理、預覽、MP4／WebM 匯出沿用。
LyricFlow 舊分割複製全文，缺少合併及播放單句；需增補。
自動圖片節奏依歌詞重算，套用對齊時需凍結既有節奏；手動畫面軌不得異動。
兩端 CSP 與本機 Origin 防護要求由同源 backend 代理，不開放任意跨站呼叫。
