@echo off
REM Simple MAMISHI AI Startup - Node Server
REM This runs the Node.js server directly

cd /d "%~dp0"

echo.
echo ====== MAMISHI AI - Node Server ======
echo.
echo Current directory: %cd%
echo.

if not exist "server.js" (
    echo ERROR: server.js not found in %cd%
    echo.
    echo Please ensure you're in the correct directory:
    echo   C:\Users\Mamishi.Madire\Downloads\Mamishi-AI-main\Mamishi-AI-main
    echo.
    pause
    exit /b 1
)

if not exist ".env" (
    echo WARNING: .env file not found. Some features may not work.
    echo.
)

echo Starting Node server...
echo.
node server.js

pause
