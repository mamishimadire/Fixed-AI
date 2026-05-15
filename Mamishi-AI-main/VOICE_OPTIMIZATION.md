# MAMISHI AI - Voice Conversation Optimization

## What's Changed

### 1. **Auto-Speak Responses**
The AI now automatically speaks its responses after generating text. No more waiting for manual text-to-speech.

**How it works:**
- After the AI finishes responding → Text is automatically converted to speech
- Speech plays while the text is displayed
- User can speak again immediately after speech finishes

### 2. **Reduced Response Delays**
- **Gemini API**: Now uses streaming mode for faster chunk delivery
- **Voice Status**: Shows "Processing..." when you stop listening, then "Speaking..." when response starts
- **Minimal UI delay**: Response appears as it streams in real-time

### 3. **Continuous Conversation Flow**
```
You Speak → AI Listens Stops → Processing... → AI Responds (Displayed)
→ AI Speaks (Auto-Generated) → Ready for Next Input → You Speak Again
```

### 4. **Configuration**
New `voice-config.json` file lets you control:

```json
{
  "auto_speak": true,              // Enable/disable auto text-to-speech
  "voice_server_url": "http://localhost:5001",
  "tts_language": "en",            // Language for speech synthesis
  "tts_max_chars": 500,            // Max characters to speak (prevents long waits)
  "auto_speak_delay_ms": 300       // Delay before speaking starts
}
```

## Requirements

**Voice Server Running:**
Your `voice-server.js` must be running on port 5001 for auto-speak to work:
```bash
node voice-server.js
```

**Python Dependencies:**
The voice server needs gTTS installed:
```bash
pip install gtts
```

## How to Test

1. Start both servers:
   ```bash
   python app.py                    # Flask on port 5000
   node voice-server.js             # Voice on port 5001
   ```

2. Open the AI in your browser

3. Click the voice button (microphone icon)

4. Speak a question (e.g., "What's your name?")

5. **Observe:**
   - Status changes: "Listening..." → "Processing..." → "Speaking..."
   - Text appears in real-time as AI responds
   - AI automatically speaks the response
   - Ready for next question immediately after speaking

## Disable Auto-Speak (If Needed)

Edit `voice-config.json` and change:
```json
"auto_speak": false
```

Then refresh the browser.

## Performance Improvements

| Feature | Improvement |
|---------|------------|
| **Streaming Response** | Text appears instantly vs. waiting for full completion |
| **Auto-Speak** | No manual TTS button needed |
| **Gemini Streaming** | Faster chunk delivery (if supported) |
| **Voice Feedback** | Status updates show what's happening |

## Troubleshooting

**Auto-speak not working?**
- Ensure `voice-server.js` is running on port 5001
- Check browser console (F12) for errors
- Verify `gTTS` is installed: `pip show gtts`

**Response taking too long?**
- Check API key is valid (Gemini, Groq, or Ollama)
- Verify internet connection for web search features
- Monitor `app.py` logs for backend errors

**Voice not detected?**
- Allow microphone permission when prompted
- Use HTTPS or localhost only (browser security restriction)
- Check if browser supports Web Speech API (works on Chrome, Edge, Safari)
