'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { removeUngroundedSentences, safeCaption } = require('../lib/remember');

const input = 'Nani my grandmother 1941 to 2023. She saved the last mithai for me. She loved Rafi songs.';

test('sentences with invented details are removed and the rest is kept', () => {
  const draft = 'I remember her saving the last mithai for me. She moved to Jaipur in 1987. She loved Rafi songs. She passed away peacefully.';
  const result = removeUngroundedSentences(draft, input, 'fallback');
  assert.equal(result.text, 'I remember her saving the last mithai for me. She loved Rafi songs.');
  assert.equal(result.removed.length, 2);
  assert.equal(result.usedFallback, false);
});

test('clean text is left untouched', () => {
  const draft = 'I remember her saving the last mithai for me. She loved Rafi songs.';
  const result = removeUngroundedSentences(draft, input, 'fallback');
  assert.equal(result.text, draft);
  assert.equal(result.removed.length, 0);
});

test('if every sentence is invented, the writer\'s own memories are used instead', () => {
  const result = removeUngroundedSentences('She lived in Delhi. She died in 1999.', input, 'She saved the last mithai for me.');
  assert.equal(result.text, 'She saved the last mithai for me.');
  assert.equal(result.usedFallback, true);
});

test('a photo caption with names or numbers is not trusted', () => {
  assert.equal(safeCaption('A woman named Priya holds a lamp'), 'A photo you added.');
  assert.equal(safeCaption('Three lamps on a porch in 2019'), 'A photo you added.');
  assert.equal(safeCaption('A woman in a red saree holds a small lamp.'), 'A woman in a red saree holds a small lamp.');
  assert.equal(safeCaption(null), 'A photo you added.');
  assert.equal(safeCaption('   '), 'A photo you added.');
});
