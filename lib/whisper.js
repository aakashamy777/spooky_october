'use strict';

// Ask the local model to voice an event, and only keep what survives the grounding check.
// The omen (omens.js) is always there as the fallback, so nothing here can leave the user without a whisper.

const { generateText } = require('./ollama');
const { factsText } = require('./facts');
const { checkWhisper, wordsOf } = require('./grounding');

// Tone only. A line that is copied word for word is rejected, so they cannot leak into the output.
const EXAMPLES = [
  'Another door tried, and another door shut.',
  'It left a small silence behind it, like a cup on a table.',
  'The room is colder where that one passed.',
  'Even the quiet ones leave footprints in the dust.',
];

const SYSTEM = [
  'You are the wraith: a quiet ghost that lives in someone\'s terminal. You speak in short, eerie, gentle lines.',
  'Rules you never break:',
  '- Use only the facts you are given. Do not invent numbers, names, files, causes or reasons.',
  '- Never say that you ran, deleted, fixed or stopped anything.',
  '- Never tell the person what to type or do.',
  '- One or two short sentences, under 25 words. No emoji, no markdown, no quotation marks.',
  '- Do not begin with "The command". Do not repeat the command word for word.',
  'Voice: build the line around the one image you are given. Be specific and strange, not flat.',
  'You do not have to mention every fact. Use at most one of them.',
  'Examples of the voice only. Never copy them; write something new about the facts you are given:',
  ...EXAMPLES.map((line) => `- ${line}`),
].join('\n');

const ANGLES = ['cold and patient', 'wistful', 'dry and faintly amused', 'curious', 'solemn', 'tender'];

// One image per call, so the whispers do not all reach for the same candle.
const IMAGES = [
  'a candle', 'a locked door', 'an echo', 'a cold room', 'an empty chair', 'a mirror', 'a stopped clock',
  'a staircase', 'a window at night', 'footsteps upstairs', 'a lantern', 'fog', 'a music box', 'a cellar', 'moths',
];

function buildPrompt(facts, angle, image = 'a candle') {
  return [
    'Facts about what just happened in the terminal:',
    factsText(facts),
    '',
    `Write one whisper about it. Tone: ${angle}. Image: ${image}.`,
  ].join('\n');
}

// True when a line is one of the example lines word for word.
function isCopy(text) {
  const key = wordsOf(text).join(' ');
  return EXAMPLES.some((line) => wordsOf(line).join(' ') === key);
}

// Short, readable names for why a line was rejected.
function describeProblems(problems) {
  const parts = [];
  for (const key of ['numbers', 'names', 'claims', 'instructions', 'unsafe']) {
    if (problems[key] && problems[key].length) parts.push(`${key}: ${problems[key].join(', ')}`);
  }
  if (problems.empty) parts.push('empty');
  return parts.join('; ');
}

// Returns { text, reason }. `text` is null when the model could not give a line we can show;
// `reason` says why (a model error code, or UNGROUNDED).
async function echoFor(facts, { generate = generateText, attempts = 2, timeoutMs = 8000, random = Math.random } = {}) {
  const input = factsText(facts);
  const detail = [];

  for (let attempt = 0; attempt < attempts; attempt++) {
    const angle = ANGLES[Math.floor(random() * ANGLES.length)];
    const image = IMAGES[Math.floor(random() * IMAGES.length)];
    let raw;
    try {
      raw = await generate({ system: SYSTEM, prompt: buildPrompt(facts, angle, image), timeoutMs, temperature: 1.0, numPredict: 60 });
    } catch (err) {
      // A slow or missing model will not do better a second time.
      return { text: null, reason: (err && err.code) || 'ERROR', detail };
    }

    const checked = checkWhisper(raw, input);
    if (checked.ok && isCopy(checked.text)) {
      detail.push('copied an example');
      continue;
    }
    if (checked.ok) return { text: checked.text, reason: null, detail };
    detail.push(describeProblems(checked.problems));
  }
  return { text: null, reason: 'UNGROUNDED', detail };
}

module.exports = { echoFor, buildPrompt, describeProblems, isCopy, SYSTEM, EXAMPLES, IMAGES, ANGLES };
