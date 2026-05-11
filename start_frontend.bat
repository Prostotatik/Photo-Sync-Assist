@echo off
cd /d %~dp0frontend
echo Installing dependencies...
npm install
echo.
echo Starting Photo-Sync-Assist Frontend on http://localhost:5173
echo.
npm run dev
