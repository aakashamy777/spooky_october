'use strict';

// Everything Wraith says to the model goes through here, and only to this computer.
// If OLLAMA_URL points anywhere else, we refuse before opening a connection.

const DEFAULT_URL = 'http://127.0.0.1:11434';
const DEFAULT_MODEL = 'gemma3:4b';

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
async function generateText({ prompt, system, temperature = 0.9, numPredict = 60, timeoutMs = 8000, keepAlive = '30m' }) {
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

module.exports = { generateText, isLoopbackUrl, ollamaUrl, modelName, DEFAULT_URL, DEFAULT_MODEL };
