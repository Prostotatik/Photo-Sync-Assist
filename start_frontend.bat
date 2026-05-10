@echo off
cd /d %~dp0frontend
echo Installing dependencies...
npm install
echo.
echo Starting AgroSync Frontend on http://localhost:5173
echo.
npm run dev
