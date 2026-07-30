@echo off
rem Launcher for the Riftbound Manager. Double-click, or use the desktop shortcut.
rem %~dp0 is this file's folder, so the shortcut works from anywhere.
cd /d "%~dp0"

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
