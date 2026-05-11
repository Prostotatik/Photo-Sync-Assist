@echo off
cd /d %~dp0backend
echo Installing dependencies...
pip install -r requirements.txt
echo.
echo Starting Photo-Sync-Assist Backend on http://localhost:8000
echo API docs: http://localhost:8000/docs
echo.
uvicorn main:app --reload --host 0.0.0.0 --port 8000
