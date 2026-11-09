@echo off
cd /d "%~dp0"
if not defined MUSER_HOME set "MUSER_HOME=%LOCALAPPDATA%\TheMuser"
if not defined MUSER_STUDIO_DATA set "MUSER_STUDIO_DATA=%MUSER_HOME%\studio_data"
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0start_studio.ps1" %*
