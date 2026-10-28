'use strict';

// Everything Wraith says to the model goes through here, and only to this computer.
// If OLLAMA_URL points anywhere else, we refuse before opening a connection.

const DEFAULT_URL = 'http://127.0.0.1:11434';
const DEFAULT_MODEL = 'gemma3:4b';
// How long Ollama keeps the model in memory after a whisper. Gemma 3 4B is about 3 GB, so not forever.
const DEFAULT_KEEP_ALIVE = '10m';

function ollamaUrl() {
  return process.env.OLLAMA_URL || DEFAULT_URL;
}

function modelName() {
  return process.env.WRAITH_MODEL || DEFAULT_MODEL;
}

// True only for addresses that stay on this machine.
function isLoopbackUrl(value) {
  let url;
  try {
    url = new URL(value);
  } catch (err) {
    return false;
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return false;
  const host = url.hostname.toLowerCase();
  return host === 'localhost' || host === '[::1]' || /^127\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(host);
}

function fail(code, message, cause) {
  const error = new Error(message);
  error.code = code;
  if (cause) error.cause = cause;
  return error;
}

function requireLoopback() {
  const url = ollamaUrl();
  if (!isLoopbackUrl(url)) {
    throw fail('NOT_LOOPBACK', `Wraith only talks to a model on this computer. OLLAMA_URL is ${url}.`);
  }
  return url.replace(/\/+$/, '');
}

// Ask the local model for a short piece of text. No retry: a late whisper is worse than none.
async function generateText({ prompt, system, temperature = 0.9, numPredict = 60, timeoutMs = 8000, keepAlive = process.env.WRAITH_KEEP_ALIVE || DEFAULT_KEEP_ALIVE }) {
  const base = requireLoopback();

  let response;
  try {
    response = await fetch(`${base}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: AbortSignal.timeout(timeoutMs),
      body: JSON.stringify({
        model: modelName(),
        prompt,
        system,
        stream: false,
        keep_alive: keepAlive,
        options: { temperature, num_predict: numPredict },
      }),
    });
  } catch (err) {
    if (err && err.name === 'TimeoutError') throw fail('TIMEOUT', 'The model took too long.', err);
    throw fail('OLLAMA_DOWN', 'Ollama is not answering.', err);
  }

  if (!response.ok) throw fail('OLLAMA_ERROR', `Ollama answered with status ${response.status}.`);

  let data;
  try {
    data = await response.json();
  } catch (err) {
    throw fail('OLLAMA_ERROR', 'Ollama sent an answer that could not be read.', err);
  }
  return String(data.response || '').trim();
}

// Is the local model there? Used by `wraith doctor`.
async function health() {
  let base;
  try {
    base = requireLoopback();
  } catch (err) {
    return { ok: false, status: 'not_loopback', message: err.message };
  }

  let response;
  try {
    response = await fetch(`${base}/api/tags`, { signal: AbortSignal.timeout(3000) });
  } catch (err) {
    return { ok: false, status: 'ollama_down', message: 'Ollama is not answering. Open the Ollama app or run: ollama serve' };
  }
  if (!response.ok) return { ok: false, status: 'ollama_error', message: `Ollama answered with status ${response.status}.` };

  let data;
  try {
    data = await response.json();
  } catch (err) {
    return { ok: false, status: 'ollama_error', message: 'Ollama sent an answer that could not be read.' };
  }

  const wanted = modelName();
  const installed = (data.models || []).map((m) => m.name);
  const found = installed.includes(wanted) || installed.includes(`${wanted}:latest`);
  if (!found) return { ok: false, status: 'model_missing', message: `The model ${wanted} is not installed. Run: ollama pull ${wanted}` };
  return { ok: true, status: 'ready', message: `${wanted} is ready at ${base}`, model: wanted };
}

module.exports = { generateText, health, isLoopbackUrl, ollamaUrl, modelName, DEFAULT_URL, DEFAULT_MODEL, DEFAULT_KEEP_ALIVE };
