@echo off
setlocal
cd /d "%~dp0"
set "PYTHONUTF8=1"
set "PYTHONIOENCODING=utf-8"
py -3.12 -c "import struct; assert struct.calcsize('P') == 8, 'Install 64-bit Python 3.12'"
if errorlevel 1 goto :python_missing
if not exist ".venv\Scripts\python.exe" py -3.12 -m venv .venv
if errorlevel 1 goto :failed
".venv\Scripts\python.exe" -c "import sys, struct; assert sys.version_info[:2] == (3, 12) and struct.calcsize('P') == 8, 'Use a fresh Python 3.12 x64 virtual environment'"
if errorlevel 1 goto :failed
".venv\Scripts\python.exe" -m pip install -r requirements.txt -r requirements-build.txt
if errorlevel 1 goto :failed
".venv\Scripts\python.exe" scripts\setup.py --jobs 1
if errorlevel 1 goto :failed
echo Ready. Run start-windows.cmd to open LyricFlow.
pause
exit /b 0
:python_missing
echo Install Python 3.12 x64 including the Python launcher first.
goto :failed
:failed
echo Setup did not complete. Keep the error above for troubleshooting.
echo Native builds require Visual Studio 2022 Build Tools with Desktop development with C++.
pause
exit /b 1
