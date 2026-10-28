'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { echoFor, buildPrompt, SYSTEM } = require('../lib/whisper');
const { buildFacts } = require('../lib/facts');

const facts = buildFacts({ command: 'npm test', exit: 1, seconds: 4, streak: 3, hour: 3 });

// A stand-in for the model that gives each answer in turn.
function scripted(...answers) {
  const calls = [];
  const generate = async (options) => {
    calls.push(options);
    const next = answers.shift();
    if (next instanceof Error) throw next;
    return next;
  };
  return { generate, calls };
}

test('a good line from the model is kept', async () => {
  const model = scripted('Three failures in the deep night. npm test is patient.');
  const result = await echoFor(facts, { generate: model.generate });
  assert.equal(result.reason, null);
  assert.equal(result.text, 'Three failures in the deep night. npm test is patient.');
  assert.equal(model.calls.length, 1);
});

test('a line with an invented number is rejected and the model gets one more try', async () => {
  const model = scripted('It failed 9 times.', 'Again, in the dark.');
  const result = await echoFor(facts, { generate: model.generate });
  assert.equal(result.text, 'Again, in the dark.');
  assert.equal(model.calls.length, 2);
  assert.match(result.detail[0], /numbers: 9/);
});

test('two bad lines give no text and say why', async () => {
  const model = scripted('I deleted it all.', 'Try `npm ci` instead.');
  const result = await echoFor(facts, { generate: model.generate });
  assert.equal(result.text, null);
  assert.equal(result.reason, 'UNGROUNDED');
  assert.equal(result.detail.length, 2);
});

test('a timeout or a missing model is not retried', async () => {
  const slow = Object.assign(new Error('slow'), { code: 'TIMEOUT' });
  const model = scripted(slow, 'never reached');
  const result = await echoFor(facts, { generate: model.generate });
  assert.equal(result.text, null);
  assert.equal(result.reason, 'TIMEOUT');
  assert.equal(model.calls.length, 1);
});

test('the prompt holds the facts and the rules, and never a secret', () => {
  const secret = buildFacts({ command: 'API_KEY=abc123xyz node app.js', exit: 1, hour: 12 });
  const prompt = buildPrompt(secret, 'solemn');
  assert.match(prompt, /API_KEY=\[hidden\]/);
  assert.doesNotMatch(prompt, /abc123xyz/);
  assert.match(SYSTEM, /Never tell the person what to type/);
});

test('the model is asked for a short line with the time limit given', async () => {
  const model = scripted('Quiet now.');
  await echoFor(facts, { generate: model.generate, timeoutMs: 1234 });
  assert.equal(model.calls[0].timeoutMs, 1234);
  assert.equal(model.calls[0].system, SYSTEM);
});

test('a line copied word for word from the examples is not used', async () => {
  const { EXAMPLES, isCopy } = require('../lib/whisper');
  assert.equal(isCopy(EXAMPLES[0]), true);
  assert.equal(isCopy(EXAMPLES[0].toUpperCase()), true);
  assert.equal(isCopy('A different line entirely.'), false);

  const model = scripted(EXAMPLES[1], 'Something new in the fog.');
  const result = await echoFor(facts, { generate: model.generate });
  assert.equal(result.text, 'Something new in the fog.');
  assert.equal(model.calls.length, 2);
});

test('each call is given one image and one tone to build on', async () => {
  const model = scripted('Fog, mostly.');
  await echoFor(facts, { generate: model.generate, random: () => 0 });
  assert.match(model.calls[0].prompt, /Tone: cold and patient\. Image: a candle\./);
});
