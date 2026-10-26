'use strict';

const express = require('express');
const crypto = require('crypto');
const path = require('path');
const { OLLAMA_URL, MODEL } = require('./lib/ollama');
const { validateRemember } = require('./lib/validate');
const { buildRemembrance } = require('./lib/remember');

const HOST = '127.0.0.1';
const PORT = Number(process.env.PORT) || 3000;

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

// ---- Writing a remembrance ----
// The local model is slow, so the page starts a job and then asks how it is going.
const jobs = new Map();
const JOB_KEEP_MS = 30 * 60 * 1000;

function removeOldJobs() {
  const now = Date.now();
  for (const [id, job] of jobs) {
    if (job.status !== 'running' && now - job.updatedAt > JOB_KEEP_MS) jobs.delete(id);
  }
}

function isBusy() {
  return Array.from(jobs.values()).some((job) => job.status === 'running');
}

app.post('/api/remember', (req, res) => {
  removeOldJobs();

  const checked = validateRemember(req.body);
  if (!checked.ok) return res.status(400).json({ ok: false, error: checked.error });

  // One job at a time: a small local model on one computer cannot do two things well.
  if (isBusy()) {
    return res.status(429).json({ ok: false, error: 'Another remembrance is still being written. Please wait a moment.' });
  }

  const job = {
    id: crypto.randomUUID(),
    status: 'running',
    step: 'Starting',
    result: null,
    error: null,
    startedAt: Date.now(),
    updatedAt: Date.now(),
  };
  jobs.set(job.id, job);

  buildRemembrance(checked.value, (step) => {
    job.step = step;
    job.updatedAt = Date.now();
  })
    .then((result) => {
      job.result = result;
      job.status = 'done';
    })
    .catch((err) => {
      job.error = err.message || 'Something went wrong while writing.';
      job.status = 'error';
    })
    .finally(() => {
      job.updatedAt = Date.now();
    });

  res.json({ ok: true, jobId: job.id });
});

app.get('/api/remember/:id', (req, res) => {
  const job = jobs.get(req.params.id);
  if (!job) return res.status(404).json({ ok: false, error: 'That job was not found.' });
  res.json({
    ok: true,
    status: job.status,
    step: job.step,
    seconds: Math.round((job.updatedAt - job.startedAt) / 1000),
    result: job.result,
    error: job.error,
  });
});

app.listen(PORT, HOST, () => {
  console.log(`Ofrenda is running at http://${HOST}:${PORT}`);
});
