# ⚡ MAMISHI AI - Quick Reference Card

## Start Voice Conversation

### Option 1: Automatic (Recommended)
**Windows:**
```bash
start-voice.bat
```

**Linux/Mac:**
```bash
bash start-voice.sh
```

### Option 2: Manual
```bash
# Terminal 1
python app.py

# Terminal 2  
node voice-server.js

# Then: Open http://localhost:5000
```

---

## New Features at a Glance

| Feature | How It Works | Status |
|---------|------------|--------|
| **Voice Input** | Click 🎤 button and speak | "Listening..." |
| **Auto-Speak** | AI speaks response automatically | "Speaking..." |
| **Live Streaming** | Response appears word-by-word | Real-time text |
| **Config File** | `voice-config.json` controls behavior | Customizable |

---

## Voice Config

File: `voice-config.json`

```json
{
  "auto_speak": true,                    // false to disable
  "voice_server_url": "...:5001",       // Voice server URL
  "tts_language": "en",                 // Language code
  "tts_max_chars": 500                  // Char limit for TTS
}
```

**Language Codes:** en, nso, zu, xh, st, tn, af, ts, sw, fr, pt, ar, hi, zh, es, de

---

## Flow Diagram

```
YOU SPEAK
   ↓
[Listening...]  ← Microphone recording
   ↓
[Processing...]  ← Sending to AI
   ↓
Response Text    ← Streaming in real-time
   ↓
[Speaking...]    ← AI voice playing
   ↓
READY FOR NEXT   ← Microphone ready again
```

---

## What Got Better

✅ **No delays** - Response starts immediately  
✅ **No manual button** - Auto-speak without clicking  
✅ **Natural flow** - Listen → Respond → Speak → Listen  
✅ **Visual feedback** - Status shows what's happening  
✅ **Configurable** - Easy to adjust or disable features  

---

## Troubleshooting (1-Minute Fixes)

**Problem: Auto-speak not working**
```bash
# 1. Check voice server is running
curl http://localhost:5001/health

# 2. Install gTTS if missing
pip install gtts

# 3. Reload browser page
```

**Problem: Response too slow**
```
→ Check internet connection
→ Verify API key set
→ Try Groq backend (faster than Gemini)
```

**Problem: Voice input not working**
```
→ Allow microphone permission
→ Use Chrome/Edge/Safari
→ Check browser console (F12) for errors
```

---

## Test Commands

```bash
# Test Flask backend
curl http://localhost:5000/health

# Test Voice server  
curl http://localhost:5001/health

# Test TTS (should return audio)
curl -X POST http://localhost:5001/speak \
  -H "Content-Type: application/json" \
  -d '{"text":"Hello","language":"en"}'
```

---

## Files Changed

| File | Change | Impact |
|------|--------|--------|
| `served-index.html` | Added auto-speak logic | Voice responses auto-play |
| `app.py` | Added streaming mode | Faster response delivery |
| `voice-config.json` | NEW - Configuration | Control voice behavior |
| `start-voice.bat` | NEW - Windows launcher | One-click startup |
| `start-voice.sh` | NEW - Linux/Mac launcher | One-click startup |

---

## Performance Checklist

Before deploying:

- [ ] Voice server running on port 5001
- [ ] Flask running on port 5000
- [ ] Browser allows microphone
- [ ] gTTS installed: `pip show gtts`
- [ ] API key set (Gemini/Groq/Ollama)
- [ ] `voice-config.json` exists
- [ ] Tested voice input (microphone button)
- [ ] Tested auto-speak (response plays audio)

---

## Advanced Customization

### Disable Auto-Speak
```json
"auto_speak": false
```

### Change Voice Language
```json
"tts_language": "nso"   // Sepedi
"tts_language": "zu"    // Zulu
"tts_language": "fr"    // French
```

### Limit Response Length
```json
"tts_max_chars": 300    // Shorter = faster to speak
```

### Change Voice Server URL
```json
"voice_server_url": "http://192.168.1.100:5001"
```

---

## Browser Compatibility

| Browser | Voice Input | Status |
|---------|------------|--------|
| Chrome | ✅ Yes | Full support |
| Edge | ✅ Yes | Full support |
| Safari | ✅ Yes | Full support |
| Firefox | ⚠️ Limited | Voice input only |

---

## Documentation Files

📄 **IMPLEMENTATION_SUMMARY.md** - Complete overview  
📄 **VOICE_OPTIMIZATION.md** - Technical details  
📄 **This file** - Quick reference  

---

## Support

**Logs to check:**
- Browser console: `F12` → Console tab
- Flask logs: Terminal running `app.py`
- Voice logs: Terminal running `voice-server.js`

**Check configuration:**
```bash
cat voice-config.json
```

---

**Version:** 1.0  
**Updated:** 2024  
**Status:** ✅ Ready to use

For questions, refer to the detailed docs or check terminal logs.
