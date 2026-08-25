@echo off
rem Launcher for the Riftbound Manager. Double-click, or use the desktop shortcut.
rem %~dp0 is this file's folder, so the shortcut works from anywhere.
cd /d "%~dp0"

rem The data folder. data-dir.txt holds one line: the full path of the JSON files,
rem for example E:\riftbound-data on a USB drive. The file is different on each PC,
rem thus it is not in git. Without the file the app uses the local data\ folder.
if exist "data-dir.txt" set /p DATA_DIR=<data-dir.txt

if defined DATA_DIR if not exist "%DATA_DIR%\." (
  echo.
  echo The data folder is not there:
  echo   %DATA_DIR%
  echo Connect the USB drive, then start the app again.
  echo.
  pause
  exit /b 1
)

if defined DATA_DIR echo Data folder: %DATA_DIR%

if not exist "node_modules" (
  echo First run: installing dependencies...
  call npm install
)

if not exist "dist\index.html" (
  echo First run: building the app...
  call npm run build
)

echo Starting the Riftbound Manager on http://localhost:5175
echo Close this window to stop the server.

rem Open the browser a moment after the server comes up.
start "" /min cmd /c "timeout /t 2 >nul & start "" http://localhost:5175"

node server/index.js
