# 歌詞時間軸精度基準

這個流程比較人工逐句／逐字標註與引擎輸出的時間。人工參考資料才是基準；引擎產生的時間不能直接當作答案。

## 建立私人資料集

建議把音訊、標註及預測結果放在 Git 忽略的 `.cache/timeline-eval/`：

```text
.cache/timeline-eval/
  dataset/
    manifest.json
    cases/
      ballad-01/
        audio.wav
        lyrics.txt
        reference.json
  predictions/
    original/
      ballad-01.json
    demucs/
      ballad-01.json
```

`manifest.json` 格式：

```json
{
  "version": 1,
  "cases": [
    {
      "id": "ballad-01",
      "audio": "cases/ballad-01/audio.wav",
      "lyrics": "cases/ballad-01/lyrics.txt",
      "reference": "cases/ballad-01/reference.json",
      "preserve_lines": true,
      "tags": ["ballad", "long-instrumental", "female-vocal"]
    }
  ]
}
```

`reference.json` 使用 LyricProject JSON 格式；`lyrics.txt` 是實際送給引擎的 UTF-8 歌詞。`preserve_lines` 要和送出工作時使用的設定相同。評分工具會檢查參考句子與輸入歌詞逐句完全吻合，避免拿不同歌詞或切句方式比較。

每個歌詞句子需經試聽確認起訖；若要計算逐字誤差，還需標好 `words`，並讓文字串接後與句子完全相同。可以從匯出的 JSON 起步，但必須逐句、逐字核對，不能直接沿用未檢查的模型時間。

保留實際送給引擎的音訊版本，以及完整演唱歌詞；重複副歌須重複列出。為避免人工標註受模型答案影響，標註者最好先獨立聽音訊定界，再用播放器逐句複核。至少由另一人抽查標註。

第一批可先做 10 首，每首挑有代表性的完整歌曲，涵蓋不同速度、曲風、口音、拖音、和聲、前奏及長間奏。用 `tags` 記錄特性，讓結果能找出在哪種條件下退化。資料量不足時保留原始逐筆結果，暫不下結論。

## 產生預測並計分

使用本機 `/lyrics/align?wait=true` 端點，把每筆 API 回傳存為 `predictions/<設定>/<case-id>.json`。至少分開記錄 `original` 與 `demucs`；同一 case 的音訊、歌詞及分行設定需保持一致。

```sh
.venv/bin/python scripts/score_timeline.py \
  .cache/timeline-eval/dataset \
  .cache/timeline-eval/predictions \
  --output .cache/timeline-eval/report.json
```

沒有逐字標註時，逐字指標會顯示為 `null`。預測逐字切分必須和人工標註的 `words` 單位一致，才納入逐字邊界比較；不一致的句子會計入逐字覆蓋率，但不混算邊界誤差。

## 指標

- `successful_case_rate`：回傳有效時間軸、句數相符且所有字幕文字都一致的歌曲比例。
- `segment_coverage`、`exact_text_rate`：成功輸出的句子數與文字完全一致的句子數，相對於人工標註總句數。
- `sentence_boundaries`、`word_boundaries`：絕對起訖誤差的 MAE、中位數、P90，以及 250 ms、500 ms、1 秒內的比例。
- `by_tag`：依曲風、演唱或音訊條件分組，定位品質退化情況。

第一批資料完成後，再依實際歌曲用途決定驗收門檻；不要先用少量樣本挑選有利門檻。逐字分數只比較切分一致的句子，切分不一致時以覆蓋率呈現，避免把不對等的單位硬算成誤差。
