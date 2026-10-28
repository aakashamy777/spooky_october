'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const { generateText, health, isLoopbackUrl } = require('../lib/ollama');

// A stand-in for Ollama. `handler` decides what each request gets.
function fakeOllama(handler) {
  return new Promise((resolve) => {
    const seen = [];
    const server = http.createServer((req, res) => {
      let body = '';
      req.on('data', (chunk) => (body += chunk));
      req.on('end', () => {
        seen.push({ url: req.url, body: body ? JSON.parse(body) : null });
        handler(req, res, seen);
      });
    });
    server.listen(0, '127.0.0.1', () => {
      resolve({ server, seen, url: `http://127.0.0.1:${server.address().port}` });
    });
  });
}

test('only addresses on this computer count as loopback', () => {
  for (const ok of ['http://127.0.0.1:11434', 'http://localhost:11434', 'http://[::1]:11434', 'http://127.0.0.2']) {
    assert.equal(isLoopbackUrl(ok), true, ok);
  }
  for (const bad of ['http://example.com', 'http://127.0.0.1.evil.com', 'http://10.0.0.5:11434', 'http://0.0.0.0:11434', 'ftp://127.0.0.1', 'nonsense', '']) {
    assert.equal(isLoopbackUrl(bad), false, bad);
  }
});

test('a non-local OLLAMA_URL is refused before any request is made', async () => {
  const before = process.env.OLLAMA_URL;
  process.env.OLLAMA_URL = 'http://192.0.2.1:11434';
  try {
    await assert.rejects(generateText({ prompt: 'hello' }), { code: 'NOT_LOOPBACK' });
  } finally {
    if (before === undefined) delete process.env.OLLAMA_URL;
    else process.env.OLLAMA_URL = before;
  }
});

test('generateText sends the prompt with a short cap and keep_alive, and trims the answer', async () => {
  const fake = await fakeOllama((req, res) => {
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ response: '  The prompt waits.\n' }));
  });
  process.env.OLLAMA_URL = fake.url;
  try {
    const text = await generateText({ prompt: 'p', system: 's', numPredict: 40 });
    assert.equal(text, 'The prompt waits.');
    const sent = fake.seen[0];
    assert.equal(sent.url, '/api/generate');
    assert.equal(sent.body.stream, false);
    assert.equal(sent.body.system, 's');
    assert.equal(sent.body.keep_alive, '10m');
    assert.equal(sent.body.options.num_predict, 40);
  } finally {
    delete process.env.OLLAMA_URL;
    fake.server.close();
  }
});

test('a slow model gives a TIMEOUT error', async () => {
  const fake = await fakeOllama(() => {
    // Never answer.
  });
  process.env.OLLAMA_URL = fake.url;
  try {
    await assert.rejects(generateText({ prompt: 'p', timeoutMs: 80 }), { code: 'TIMEOUT' });
  } finally {
    delete process.env.OLLAMA_URL;
    fake.server.closeAllConnections();
    fake.server.close();
  }
});

test('an error status gives OLLAMA_ERROR', async () => {
  const fake = await fakeOllama((req, res) => {
    res.statusCode = 500;
    res.end('boom');
  });
  process.env.OLLAMA_URL = fake.url;
  try {
    await assert.rejects(generateText({ prompt: 'p' }), { code: 'OLLAMA_ERROR' });
  } finally {
    delete process.env.OLLAMA_URL;
    fake.server.close();
  }
});

test('nothing listening gives OLLAMA_DOWN', async () => {
  const fake = await fakeOllama(() => {});
  const url = fake.url;
  await new Promise((resolve) => fake.server.close(resolve));
  process.env.OLLAMA_URL = url;
  try {
    await assert.rejects(generateText({ prompt: 'p', timeoutMs: 2000 }), { code: 'OLLAMA_DOWN' });
  } finally {
    delete process.env.OLLAMA_URL;
  }
});

test('WRAITH_KEEP_ALIVE changes how long the model stays loaded', async () => {
  const fake = await fakeOllama((req, res) => {
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ response: 'ok' }));
  });
  process.env.OLLAMA_URL = fake.url;
  process.env.WRAITH_KEEP_ALIVE = '1m';
  try {
    await generateText({ prompt: 'p' });
    assert.equal(fake.seen[0].body.keep_alive, '1m');
  } finally {
    delete process.env.OLLAMA_URL;
    delete process.env.WRAITH_KEEP_ALIVE;
    fake.server.close();
  }
});

test('health says ready when the model is installed, with or without :latest', async () => {
  const fake = await fakeOllama((req, res) => {
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ models: [{ name: 'gemma3:4b' }, { name: 'tiny:latest' }] }));
  });
  process.env.OLLAMA_URL = fake.url;
  try {
    assert.deepEqual((await health()).status, 'ready');
    process.env.WRAITH_MODEL = 'tiny';
    assert.deepEqual((await health()).status, 'ready');
    process.env.WRAITH_MODEL = 'missing:1b';
    const missing = await health();
    assert.equal(missing.status, 'model_missing');
    assert.match(missing.message, /ollama pull missing:1b/);
  } finally {
    delete process.env.OLLAMA_URL;
    delete process.env.WRAITH_MODEL;
    fake.server.close();
  }
});

test('health reports a stopped Ollama and a non-local address without a stack trace', async () => {
  const fake = await fakeOllama(() => {});
  const url = fake.url;
  await new Promise((resolve) => fake.server.close(resolve));
  process.env.OLLAMA_URL = url;
  try {
    assert.equal((await health()).status, 'ollama_down');
    process.env.OLLAMA_URL = 'http://192.0.2.1:11434';
    assert.equal((await health()).status, 'not_loopback');
  } finally {
    delete process.env.OLLAMA_URL;
  }
});
