@echo off
setlocal
cd /d "%~dp0"
set "PYTHONUTF8=1"
set "PYTHONIOENCODING=utf-8"
if exist ".venv\Scripts\python.exe" goto :install
py -3 -c "import sys, struct; assert sys.version_info[:2] >= (3, 12) and struct.calcsize('P') == 8, 'Install Python 3.12 or later (x64)'"
if errorlevel 1 goto :python_missing
py -3 -m venv .venv
if errorlevel 1 goto :failed
:install
".venv\Scripts\python.exe" -c "import sys, struct; assert sys.version_info[:2] >= (3, 12) and struct.calcsize('P') == 8, 'Rename the old .venv and create a Python 3.12 or later x64 environment'"
if errorlevel 1 goto :failed
".venv\Scripts\python.exe" -m pip install -r requirements.txt -r requirements-build.txt
if errorlevel 1 goto :failed
".venv\Scripts\python.exe" scripts\setup.py --jobs 1
if errorlevel 1 goto :failed
echo Ready. Run start-windows.cmd to open LyricFlow.
pause
exit /b 0
:python_missing
echo Install Python 3.12 or later (x64) including the Python launcher first.
goto :failed
:failed
echo Setup did not complete. Keep the error above for troubleshooting.
echo Native builds require Visual Studio 2022 Build Tools with Desktop development with C++.
pause
exit /b 1
