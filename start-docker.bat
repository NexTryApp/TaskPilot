@echo off
echo.
echo   TaskPilot — Docker
echo   Building and starting containers...
echo.
cd /d "%~dp0"
docker compose up --build
pause
