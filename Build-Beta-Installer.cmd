@echo off
setlocal
cd /d "%~dp0"
title BYAKUGAN Beta Builder

where node.exe >nul 2>nul
if errorlevel 1 (
  echo Node.js was not found. Install Node.js 24 or newer, then run this file again.
  pause
  exit /b 1
)

echo Installing build dependencies...
call npm.cmd install
if errorlevel 1 goto :failed

echo Running BYAKUGAN tests...
call npm.cmd test
if errorlevel 1 goto :failed

echo.
echo Building an update-enabled Windows installer for:
echo https://github.com/SpartyTG/Byakugan/releases
call npm.cmd run release:win
if errorlevel 1 goto :failed

:complete
echo.
echo Build complete. Opening the release folder...
start "" "%~dp0release"
exit /b 0

:failed
echo.
echo The build stopped because a step failed. Review the message above.
pause
exit /b 1
