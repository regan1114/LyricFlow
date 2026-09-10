@echo off
setlocal
cd /d "%~dp0"
set "PYTHONUTF8=1"
set "PYTHONIOENCODING=utf-8"
if not exist ".venv\Scripts\python.exe" goto :missing
if not exist ".local\bin\whisper-cli.exe" goto :missing
if not exist ".local\models\ggml-small-q5_1.bin" goto :missing
".venv\Scripts\python.exe" app.py --open
if errorlevel 1 pause
exit /b
:missing
echo Run setup-windows.cmd first.
pause
exit /b 1
