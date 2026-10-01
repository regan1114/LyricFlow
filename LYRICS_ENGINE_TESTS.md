# Lyrics Timeline Engine 驗證紀錄

日期：2026-09-30。測試環境：Intel macOS、CPU、Python 3.9、Node 22；未要求 NVIDIA GPU。

## 通過

| 範圍 | 結果 |
| --- | --- |
| LyricFlow `scripts/check.py` | 格式、Ruff、Vue 型別／lint、單元、build、後端回歸通過 |
| Vue 單元 | 154 項通過，含 JSON／words、投影、修改／復原、分割／合併、karaoke、專案封裝與 IndexedDB 可複製性 |
| Python 標準環境 | 78 項，8 項略過（7 項既有私人歌曲 fixture、1 組選用 NumPy 測試） |
| Alignment 環境 | 3 項 CTC／長空檔／vocal source-offset 映射測試通過 |
| LyricFlow 相關瀏覽器回歸 | 9 項辨識／對齊／字幕編輯測試通過 |
| MyCut | build／typecheck 通過，54 項單元測試通過 |
| MyCut 相關瀏覽器回歸 | 7 項通過（新歌詞 3 項、既有字幕面板 3 項、karaoke 1 項）；最終版本另驗證快速取消／重試競態 |
| 真實 Flask API | `/lyrics/align?wait=true`、JSON／SRT 下載成功，從其他 cwd 啟動 worker 成功 |
| 真實 MyCut → Flask → 字幕軌 | 歌曲擷取、串流上傳、模型執行、共用 JSON、4 句字幕與獨立軌道成功，約 35.95 秒 |

後續保存圖片節奏時修正了 Vue proxy 的 plain-object 複製，並補上可供 IndexedDB 保存的回歸；
此變更後重跑型別、lint、完整前端單元及 build。

## 歌曲測試

使用工作區既有歷史快取中的歌曲，取前 31 秒與對應 4 行歌詞，沒有修改原音檔。
這是測試素材，不是替使用者製作新歌曲素材或輸出 MV。

- 原音短片段第一句約 14.68 秒；分離人聲版本約 14.70 秒。
- API 人聲版本：14.70–17.26、17.50–19.38、21.08–23.54、23.76–26.26 秒。
- 92 秒重複 fixture：同一片段兩次，中間插入 30 秒原曲器樂；對齊 8 句，兩次第一句
  14.70、75.70 秒，第一段在 26.28 秒結束，沒有把字幕鋪滿長間奏。
- 此 fixture 的人聲分離約 54 秒；重用 stem 的 alignment／輸出約 7.31 秒。
- 原音長間奏失敗案例已加上 `ALIGNMENT_LONG_GAP` 防護，不猜測修補時間。
- cache key 包含音訊內容、原始歌詞、引擎版本、模型 revision、切句與分離 provider。

有效 smoke 產物：`.cache/timeline-smoke/verified-api/lyrics.json`、`lyrics.srt`，
以及 `verified-repeat/`。實測數據在 `api-metrics.json`、`repeat-metrics.json`、`bridge-metrics.json`。
私人歌曲與這些產物不納入 Git。

尚無使用者指定的全曲人工時間標記，以上不能當作全曲精度合格認證；仍需逐句試聽。
短片段中的起訖差異也顯示，模型結果需要人工微調。

## 既有完整瀏覽器測試失敗

第一次完整 `scripts/check.py --browser`：32 項通過、11 項失敗、1 項略過。
其中新單句播放測試的定位問題與舊字幕編輯測試「沒有數字輸入」的預期已修正，相關測試重跑通過。
剩餘 9 項來自既有草稿／重置初始狀態（8 項）及預設背景圖片預期（1 項）。

以 `git archive HEAD` 建立未修改基準版本，分別重現草稿測試的共同初始斷言失敗、
以及背景測試的相同斷言失敗。沒有更動這些無關功能，也未宣稱整套瀏覽器測試全綠。
紀錄：`.cache/timeline-check.log`、`baseline-draft-test.log`、`baseline-glass-test.log`。
最終相關瀏覽器紀錄：`.cache/timeline-final-browser.log`。

## 可重跑命令

```sh
.venv/bin/python scripts/check.py
.venv-alignment/bin/python -m unittest tests.test_ctc -v
.venv/bin/python scripts/check.py --browser
```

MyCut 目錄：

```sh
npm run build
npm test
npm run test:ui -- tests/ui/lyrics.spec.ts tests/ui/panels-captions.spec.ts tests/ui/karaoke.spec.ts
```

Phase 2 新 ASR 與 Phase 3 Hybrid 未開始；這次只驗證 Phase 1 與既有功能相容性。
