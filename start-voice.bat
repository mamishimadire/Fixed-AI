@echo off
REM MAMISHI AI - Complete Voice Setup Script
REM Starts both Flask backend and Voice server for full voice conversation

echo.
echo ====== MAMISHI AI VOICE SETUP ======
echo.

REM Check if Python is available
python --version >nul 2>&1
if errorlevel 1 (
    echo ERROR: Python not found. Please install Python.
    pause
    exit /b 1
)

REM Check if Node.js is available
node --version >nul 2>&1
if errorlevel 1 (
    echo ERROR: Node.js not found. Please install Node.js.
    pause
    exit /b 1
)

echo [1/4] Checking dependencies...
pip show gtts >nul 2>&1
if errorlevel 1 (
    echo [!] gTTS not installed. Installing...
    pip install gtts
)

echo.
echo [2/4] Starting Flask backend (port 5000)...
echo Run this in a new terminal if it doesn't start:
echo   python app.py
start cmd /k python app.py

timeout /t 2 >nul

echo.
echo [3/4] Starting Voice server (port 5001)...
echo Run this in a new terminal if it doesn't start:
echo   node voice-server.js
start cmd /k node voice-server.js

timeout /t 2 >nul

echo.
echo [4/4] Opening browser...
echo Launching AI at http://localhost:5000
start http://localhost:5000

echo.
echo ========================================
echo MAMISHI AI is starting!
echo.
echo Voice servers:
echo   - Flask:  http://localhost:5000
echo   - Voice:  http://localhost:5001
echo.
echo Features enabled:
echo   ✓ Voice input (microphone)
echo   ✓ Auto text-to-speech responses
echo   ✓ Streaming responses (real-time)
echo.
echo Test: Click the microphone button and ask a question!
echo.
echo Press Ctrl+C in each terminal to stop.
echo ========================================
echo.

pause
