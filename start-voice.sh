#!/bin/bash
# MAMISHI AI - Complete Voice Setup Script (Linux/Mac)
# Starts both Flask backend and Voice server for full voice conversation

echo ""
echo "====== MAMISHI AI VOICE SETUP ======"
echo ""

# Check if Python is available
if ! command -v python3 &> /dev/null; then
    echo "ERROR: Python 3 not found. Please install Python 3."
    exit 1
fi

# Check if Node.js is available
if ! command -v node &> /dev/null; then
    echo "ERROR: Node.js not found. Please install Node.js."
    exit 1
fi

echo "[1/4] Checking dependencies..."
pip3 show gtts &> /dev/null
if [ $? -ne 0 ]; then
    echo "[!] gTTS not installed. Installing..."
    pip3 install gtts
fi

echo ""
echo "[2/4] Starting Flask backend (port 5000)..."
echo "Run in another terminal if needed: python3 app.py"
python3 app.py &
FLASK_PID=$!

sleep 2

echo ""
echo "[3/4] Starting Voice server (port 5001)..."
echo "Run in another terminal if needed: node voice-server.js"
node voice-server.js &
VOICE_PID=$!

sleep 2

echo ""
echo "[4/4] Opening browser..."
echo "Launching AI at http://localhost:5000"
if command -v open &> /dev/null; then
    open http://localhost:5000
elif command -v xdg-open &> /dev/null; then
    xdg-open http://localhost:5000
else
    echo "Please open http://localhost:5000 in your browser"
fi

echo ""
echo "========================================"
echo "MAMISHI AI is starting!"
echo ""
echo "Voice servers:"
echo "   - Flask:  http://localhost:5000"
echo "   - Voice:  http://localhost:5001"
echo ""
echo "Features enabled:"
echo "   ✓ Voice input (microphone)"
echo "   ✓ Auto text-to-speech responses"
echo "   ✓ Streaming responses (real-time)"
echo ""
echo "Test: Click the microphone button and ask a question!"
echo ""
echo "Press Ctrl+C to stop all servers."
echo "========================================"
echo ""

# Wait for both processes
wait $FLASK_PID $VOICE_PID
