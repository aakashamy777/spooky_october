'use strict';

const OLLAMA_URL = process.env.OLLAMA_URL || 'http://127.0.0.1:11434';
const MODEL = process.env.OFRENDA_MODEL || 'gemma3:4b';

// Ask the local model for JSON. Retries once if the answer is not valid JSON.
async function generateJson({ prompt, images, temperature = 0.3, numPredict = 700, timeoutMs = 120000 }) {
  let lastError;

  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const response = await fetch(`${OLLAMA_URL}/api/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: AbortSignal.timeout(timeoutMs),
        body: JSON.stringify({
          model: MODEL,
          prompt,
          images,
          stream: false,
          format: 'json',
          options: { temperature, num_predict: numPredict },
        }),
      });

      if (!response.ok) {
        throw new Error(`Ollama answered with status ${response.status}`);
      }

      const data = await response.json();
      return JSON.parse(data.response);
    } catch (err) {
      lastError = err;
    }
  }

  const error = new Error('The local model did not give a usable answer. Please try again.');
  error.cause = lastError;
  throw error;
}

module.exports = { generateJson, MODEL, OLLAMA_URL };
