# Ofrenda

A small tool for building a remembrance page for someone you miss, using your own words and photos. It runs on your own computer with Gemma 3 through Ollama. Nothing is uploaded.

This is a work in progress for the Hacktoberfest Open-Source AI Challenge, Week 4 ("Ghost in the Machine").

## Setup

1. Install [Ollama](https://ollama.com) and open it.
2. Pull the model: `ollama pull gemma3:4b`
3. Install and start the app:

```bash
npm install
npm start
```

4. Open http://127.0.0.1:3000. The pill at the top should say "Local model ready: gemma3:4b".

## How it works so far

- Add a name, then optional details (who they were to you, years, favourite things).
- Add up to 8 short memories in your own words.
- Add up to 4 photos. They are shrunk to 1024px JPEG inside your browser, and each can have your own caption.
- The "Write the remembrance" button stays disabled until there is a name and at least one memory or photo.

Nothing is sent anywhere except to the Ollama model on your own computer.

## Licence

MIT
