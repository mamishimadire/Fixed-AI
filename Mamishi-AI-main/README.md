# MAMISHI AI

`MAMISHI AI` is a personal local AI assistant for Mamishi Tonny Madire.

This project now runs on:

- `Node.js` for the web server
- `Ollama` for the primary local model runtime
- `OpenRouter` as a purple `P` backup provider for extra model options
- a local tool loop for commands, file reading, file writing, and directory listing

## Run

Make sure Ollama is running and a model is available. The current default model is:

```text
gpt-oss:120b-cloud
```

Start the app:

```bash
node server.js
```

Then open:

```text
http://localhost:5000
```

## Features

- `MAMISHI AI` branding across the interface
- founder-aware identity for Mamishi Tonny Madire
- General, Audit, Build, and Agent modes
- streaming chat responses
- local tool calling through Ollama
- modern responsive UI

## Founder Identity

If someone asks who Mamishi Tonny Madire is, the assistant answers with the approved founder biography defined in the system prompt.

## Notes

- `app.py` remains in the project as the earlier Flask version.
- `server.js` is the active runtime for this machine because Node.js and Ollama are already available locally.
- Use `OPENROUTER_API_KEY`, `OPENROUTER_URL`, and `OPENROUTER_FREE_MODEL` in your `.env` to enable the new OpenRouter backend.
- OpenRouter uses the free OpenRouter model `gpt-4o-mini` by default and will stay on a free model when P is selected.
- In the chat composer, use the new backend selector to choose `System default` or `P (OpenRouter)`.
