@echo off
setlocal
pushd "%~dp0" || exit /b 1
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js is required. Install Node.js, then run this script again.
  pause
  popd
  exit /b 1
)
set "PORT=0"
node serve.mjs --open %*
set "LAUNCH_EXIT=%ERRORLEVEL%"
popd
if not "%LAUNCH_EXIT%"=="0" pause
exit /b %LAUNCH_EXIT%
