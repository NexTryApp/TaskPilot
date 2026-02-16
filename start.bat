@echo off
chcp 65001 >nul 2>&1
title TaskPilot

echo.
echo   ╔═══════════════════════════════════════╗
echo   ║          TaskPilot Launcher            ║
echo   ║     Secure AI Agent Framework          ║
echo   ╚═══════════════════════════════════════╝
echo.

:: Check Node.js
where node >nul 2>&1
if %ERRORLEVEL% neq 0 (
    echo   [ERROR] Node.js not found!
    echo   Скачайте Node.js: https://nodejs.org/
    echo   Download Node.js: https://nodejs.org/
    echo.
    pause
    exit /b 1
)

:: Show Node version
for /f "tokens=*" %%i in ('node --version') do set NODE_VER=%%i
echo   Node.js: %NODE_VER%

:: Navigate to script directory
cd /d "%~dp0"

:: Install dependencies if node_modules doesn't exist
if not exist "node_modules" (
    echo.
    echo   Installing dependencies / Устанавливаю зависимости...
    call npm install
    if %ERRORLEVEL% neq 0 (
        echo   [ERROR] npm install failed!
        pause
        exit /b 1
    )
    echo   Dependencies installed!
    echo.
)

:: Create data directory if needed
if not exist "data" mkdir data

echo.
echo   Starting TaskPilot server...
echo   Запускаю сервер TaskPilot...
echo.
echo   ┌──────────────────────────────────────┐
echo   │  http://localhost:4242                │
echo   │  Press Ctrl+C to stop                │
echo   └──────────────────────────────────────┘
echo.

:: Open browser after a short delay
start "" /b cmd /c "timeout /t 2 /nobreak >nul & start http://localhost:4242"

:: Start the server
npx tsx web/server.ts

pause
