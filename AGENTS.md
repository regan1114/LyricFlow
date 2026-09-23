# AI 協作入口

本專案是 LyricFlow 歌詞對時與影片製作工具。歌曲製作的完整規格以 [WORKFLOW.md](WORKFLOW.md) 為準；不需要依賴先前聊天紀錄。

## 收到歌曲製作指令時

「處理我的歌曲資料夾」、「製作這首歌的素材」等指令，表示執行 `WORKFLOW.md` 的歌曲工作流。若使用者只是詢問流程或修改程式，不要因此開始生成素材。

1. 先讀 `WORKFLOW.md`，再讀使用者指定的歌曲資料夾。未另給路徑且說「我的歌曲」時，預設為專案內 `input/我的歌曲/`；路徑不存在或輸入有多個版本時，確認目標，不任意挑選。
2. 新工作使用 `scripts/prepare_song_folder.py` 檢查輸入。既有工作先讀 `output/PROGRESS.md`、`source.json`、`alignment-job.json` 及已有產物，依檔案實際內容接續，不只相信勾選狀態。
3. 將本次使用者指定的畫風、張數、比例、專輯名稱等寫入 `output/PROGRESS.md`，每完成一階段更新成果路徑與下一步。使用者當次指定優先於工作流預設。
4. 完成所有交付項目並依 `WORKFLOW.md` 驗證。缺少音檔、歌詞、影像生成能力或可確認的時間時，記錄具體缺項，不以佔位圖片、空白歌詞或猜測時間宣稱完成。

## 實作與參考入口

- [WORKFLOW.md](WORKFLOW.md)：輸入、執行順序、命名、輸出格式、續作與驗收規則。
- [API.md](API.md)、`lyric_flow_client.py`：本機歌曲對時與補辨識，預設 `http://127.0.0.1:8080`。
- `scripts/prepare_song_folder.py`：建立來源與進度紀錄；不執行影像生成。
- `scripts/package_storyboard.py`：檢查完整歌詞、圖片檔名與時間，匯出 SRT／圖片 JSON。
- [圖片字幕格式](web/public/examples/image-subtitles.md)：現有工具接受的匯入格式。

其他 AI 可以使用自己環境中可用且獲授權的影像生成工具，仍須符合相同的交付與檢查規格。文件不保證每個 AI 都具備生成圖片、讀取本機檔案或呼叫本機服務的能力。

歌曲輸入與成品位於 Git 忽略目錄，請依指定路徑直接查看；不要因檔案未列在 Git 清單中就判定不存在。更動程式時保留工作區既有修改與使用者素材，依受影響功能執行檢查；前端見 `web/package.json`，後端與完整測試見 `ARCHITECTURE.md`。
