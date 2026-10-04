#!/bin/bash

cd "$(dirname "$0")" || exit 1

export PYTHONUTF8=1
export PYTHONIOENCODING=utf-8

if [[ ! -x ".venv/bin/python" || ! -x ".local/bin/whisper-cli" || ! -f ".local/models/ggml-small-q5_1.bin" || ! -f "web/dist/index.html" ]]; then
    echo "LyricFlow 尚未完成安裝。"
    echo "請先依 README.md「本機版：啟用自動辨識」完成前端建置、Python 環境與辨識引擎安裝。"
    read -r -p "按 Enter 關閉此視窗..." _
    exit 1
fi

".venv/bin/python" app.py --open
status=$?

if [[ $status -ne 0 ]]; then
    echo "LyricFlow 啟動失敗（錯誤代碼：$status）。"
fi
read -r -p "按 Enter 關閉此視窗..." _
exit "$status"
