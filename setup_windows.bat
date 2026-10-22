@echo off
REM One-time setup for The Muser Studio on Windows. Pass -Gpu or -Voice for extras.
cd /d "%~dp0"
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0setup_windows.ps1" %*
pause
