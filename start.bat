@echo off
echo.
echo   TaskPilot Web UI
echo   Starting...
echo.
cd /d "%~dp0"
call venv\Scripts\activate.bat
npx tsx web/server.ts
pause
