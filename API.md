# LyricFlow API

供另一個專案的後端在同一台電腦呼叫。HTTP 服務使用 Flask；辨識與暫存都在本機，無需付費 API。

## 啟動服務

先依 [README.md](README.md#本機版啟用自動辨識) 完成安裝，再於專案根目錄執行以下命令；按 Control+C 停止：

```sh
.venv/bin/python app.py
```

服務網址為 `http://127.0.0.1:8080`。加上 `--open` 可自動開啟瀏覽器，網頁與 API 共用同一個服務。
預設只接受這台電腦的連線，未開放其他電腦或不同來源的瀏覽器頁面直接呼叫。

## 一次請求，直接取得 SRT

使用 `multipart/form-data`：`audio` 為歌曲檔案、`lyrics` 可為文字或 UTF-8 歌詞檔、`threads` 可選 2 或 4，預設 4。
以下檔名是用法範例，請替換成自己的歌曲和歌詞路徑。

```sh
curl --fail --show-error --max-time 1800 \
  'http://127.0.0.1:8080/api/align?wait=true' \
  -F 'audio=@歌曲.wav' \
  -F 'lyrics=@lyric.txt' \
  -F 'threads=2' \
  --output result.srt
```

`wait=true` 會保持這次請求，直到處理完成。成功回應 `200`，內容就是 UTF-8 BOM 的 SRT，
`Content-Type: application/x-subrip; charset=utf-8`，並附下載檔名及 `X-Lyric-Flow-Job-Id` 工作編號。
失敗回應 JSON，例如 `{"error":"音訊無法處理…","job_id":"…","status":"error"}`，不會回傳假的字幕檔。

這種方式適合可等待的後端工具；若呼叫端或代理有較短逾時限制，請用下面的非同步方式。
請求斷線不會自動取消辨識；使用非同步工作編號可繼續追蹤，避免重複提交。

## 非同步方式：提交 → 查詢 → 下載

1. `POST /api/align`：上傳同樣的 multipart 資料，不加 `wait=true`，立即回傳 `202` 和工作資料。
2. `GET /api/jobs/{id}`：每秒查詢一次，取得階段、百分比和已經過秒數。
3. `status` 為 `done` 後，`GET /api/jobs/{id}/srt`：取得 SRT。

```sh
curl --fail --show-error 'http://127.0.0.1:8080/api/align' \
  -F 'audio=@歌曲.wav' \
  -F 'lyrics=@lyric.txt'
```

回應包含以下欄位（`id` 為每次產生的 32 位十六進位工作編號）：

```json
{
  "id": "工作編號",
  "status": "preparing",
  "message": "正在準備音訊…",
  "elapsed": 0.2,
  "progress": { "stage": "preparing", "percent": null },
  "status_url": "/api/jobs/工作編號",
  "srt_url": null
}
```

完成後 `status` 為 `done`、`progress.percent` 為 `100`，`srt_url` 會提供相對下載路徑，
`result` 包含逐句時間、`review_count` 和 `unmatched_count`。
其他狀態為 `uploading`、`preparing`、`processing`、`error`、`cancelled`；遇到後兩者請停止輪詢並讀取 `message`。

`progress.stage` 可能為 `uploading`、`preparing`、`recognizing`、`cached`、`aligning`、`retrying`、`exporting`、`done`。
百分比代表**目前階段**，不是總剩餘時間；無法量化的階段為 `null`。
補查階段還有 `current`、`total` 和原歌詞 `line`。快取或短階段可能在兩次查詢之間完成。

其他端點：

| 方法與路徑 | 用途 |
| --- | --- |
| `GET /api/health` | `ready: true` 表示引擎與模型檔案已備妥 |
| `POST /api/jobs/{id}/cancel` | 停止該工作，回傳最後狀態 |
| `POST /api/jobs/{id}/retry` | 對已完成工作補辨識未定位句子，回傳新的 `202` 工作 |
| `GET /api/jobs/{id}/report` | 下載逐句檢查表 |
| `POST /api/jobs` | 既有兩步上傳：先送 JSON `{name,size,lyrics,threads}`，回傳 `201` |
| `POST /api/jobs/{id}/audio` | 兩步上傳的第二步：送原始音檔 bytes，需 `Content-Length`，回傳 `202` |

兩步上傳的客戶端若中途放棄，請取消工作，才能接受下一首歌。

## 補辨識漏句

對已完成的工作送出 JSON `{}`，會沿用它的歌詞、音檔、執行緒與已定位時間：

```sh
curl --fail --show-error 'http://127.0.0.1:8080/api/jobs/工作編號/retry' \
  -H 'Content-Type: application/json' --data '{}'
```

回應 `202`，取得**新的工作編號**後，使用原有查詢、下載及取消端點。
`retry_of` 是原工作編號，`retry_missing_count` 是本次開始前的未定位句數。
補辨識與一般對齊共用一次一個工作的限制，忙碌時回傳 `409`；原工作與字幕保持可用。

若要保留呼叫端手動修正的時間，可送 `{"timings":[{"start":0.5,"end":2.5},{"start":null,"end":null}]}`。
陣列必須與原工作歌詞逐句對應且數量一致，時間單位為秒；兩端都為 `null` 表示待補辨識。
不接受更換歌詞文字、部分缺漏時間、非有限數字、倒置、重疊或超出歌曲範圍的時間。
若已無未定位句子，回傳 `400`。JSON 請求上限為 1 MB。

連續漏句會合併為片段，重新用 beam size 5 辨識，不重用原來的辨識文字。
進度仍使用 `retrying`，另有 `end_line` 表示片段最後一行；`current/total` 表示片段數。
已定位句子的時間不會被改動，找回的句子標示 `review`；找不到的句子維持未定位。

## Python：複製一個檔案即可串接

將 `lyric_flow_client.py` 複製到另一個 Python 專案，無需安裝第三方套件。
它用串流方式上傳音檔，並在內部提交、輪詢、下載，呼叫端只需呼叫一個函式：

```python
from pathlib import Path
from lyric_flow_client import LyricFlowClient

client = LyricFlowClient("http://127.0.0.1:8080")
lyrics = Path("lyric.txt").read_text(encoding="utf-8-sig")

srt = client.align(
    "歌曲.wav",
    lyrics,
    threads=2,
    timeout=900,
    on_progress=lambda job: print(job["message"], job.get("progress")),
)
Path("result.srt").write_bytes(srt)
```

`srt` 是檔案 bytes；另一個專案也能將它直接當成 HTTP 檔案回應。
若要保存工作編號、自己管理等待流程：

```python
job = client.submit("歌曲.wav", lyrics, threads=2)
job_id = job["id"]  # 保存此編號，之後可繼續查詢
result = client.wait(job_id, timeout=900)
Path("result.srt").write_bytes(client.download_srt(job_id))
# 若需要中止：client.cancel(job_id)
```

`LyricFlowError` 提供 `status`（HTTP 狀態碼，如 409）及 `job_id`。
等待逾時會拋出 `TimeoutError`，工作仍繼續；用已保存的編號查詢或取消。

## 限制與錯誤

- WAV、MP3、M4A、AAC、FLAC、AIFF；單檔 200 MB、30 分鐘；歌詞 12,000 字，歌詞檔最多 64 KB。
- 一次處理一首，網頁與 API 共用名額。忙碌時回應 `409`，呼叫端稍後再提交；目前沒有批次佇列。
- `400`：欄位或 multipart 格式不正確；`413`：上傳太大／長度不正確；`415`：不是 multipart 格式。
- `411`：不支援 chunked 上傳，請提供 `Content-Length`；curl `-F` 與附帶 Python 客戶端會自動處理。
- `408`：上傳期間超過 60 秒沒有收到資料；同步處理等待不受這個上傳閒置限制影響。
- `422`：同步模式的音訊處理失敗；`409` 也可能代表同步工作被取消。
- `404`：工作不存在，或要求的 SRT／檢查表尚未完成。先確認工作狀態再下載。
- `403`：非允許的 Host／Origin。不同連接埠的網頁前端請透過同一台電腦的後端轉接。
- 重啟服務後仍可用工作編號取得已完成結果；進行中的工作會中斷，需要重新提交。

API 回傳目前工作儲存的字幕，保留原歌詞與 Suno 標記清理規則。
補辨識會包含送出的手動時間；之後僅在瀏覽器修改、未再次送出的時間不會同步到 API。
未定位的句子不會放入 SRT，請透過 `result.unmatched_count` 及檢查表判斷是否需人工處理。

伺服器使用專案 `.venv` 的 Python 3.9–3.12、Flask 3.1.3 與 Werkzeug；multipart 上傳由框架處理。
模組責任請見 [架構說明](ARCHITECTURE.md)。
