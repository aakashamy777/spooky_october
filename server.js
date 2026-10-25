'use strict';

const express = require('express');
const path = require('path');

const HOST = '127.0.0.1';
const PORT = Number(process.env.PORT) || 3000;
const OLLAMA_URL = process.env.OLLAMA_URL || 'http://127.0.0.1:11434';
const MODEL = process.env.OFRENDA_MODEL || 'gemma3:4b';

const app = express();
app.use(express.json({ limit: '20mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// Ask Ollama which models are installed and whether ours is one of them.
async function checkOllama() {
  let response;
  try {
    response = await fetch(`${OLLAMA_URL}/api/tags`, { signal: AbortSignal.timeout(4000) });
  } catch (err) {
    return {
      ok: false,
      status: 'ollama_down',
      message: 'Ollama is not running. Open the Ollama app, then press recheck.',
    };
  }

  if (!response.ok) {
    return {
      ok: false,
      status: 'ollama_error',
      message: `Ollama answered with status ${response.status}.`,
    };
  }

  let data;
  try {
    data = await response.json();
  } catch (err) {
    return { ok: false, status: 'ollama_error', message: 'Ollama sent an answer I could not read.' };
  }

  const installed = (data.models || []).map((m) => m.name);
  if (!installed.includes(MODEL)) {
    return {
      ok: false,
      status: 'model_missing',
      message: `The model ${MODEL} is not installed. Run: ollama pull ${MODEL}`,
    };
  }

  return { ok: true, status: 'ready', message: `Local model ready: ${MODEL}` };
}

app.get('/api/health', async (req, res) => {
  const result = await checkOllama();
  res.status(result.ok ? 200 : 503).json({ ...result, model: MODEL });
});

app.listen(PORT, HOST, () => {
  console.log(`Ofrenda is running at http://${HOST}:${PORT}`);
});
