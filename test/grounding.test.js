'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { findUngrounded, groundItems } = require('../lib/grounding');

const input = 'Nani my grandmother 1941 to 2023. She saved the last mithai for me. ' +
  'She loved Rafi songs and marigolds. Every Diwali she lit lamps on the porch.';

test('text that only uses the input is clean', () => {
  const out = 'I remember Nani saving the last mithai for me. She loved Rafi songs and marigolds.';
  const result = findUngrounded(out, input);
  assert.equal(result.any, false);
});

test('an invented year or number is caught', () => {
  const result = findUngrounded('In 1987 she moved to a small town.', input);
  assert.deepEqual(result.numbers, ['1987']);
});

test('a number from the input is allowed', () => {
  assert.equal(findUngrounded('She was born in 1941.', input).numbers.length, 0);
});

test('an invented name or place is caught', () => {
  const result = findUngrounded('She often walked to Jaipur with Ramesh.', input);
  assert.ok(result.names.includes('Jaipur'));
  assert.ok(result.names.includes('Ramesh'));
});

test('names in the input and the first word of a sentence are fine', () => {
  const result = findUngrounded('Nani was kind. Diwali was her favourite. She loved Rafi.', input);
  assert.equal(result.names.length, 0);
});

test('the pronoun I and possessives do not count as invented names', () => {
  const result = findUngrounded("Today I think of Nani's lamps, and I smile.", input);
  assert.equal(result.names.length, 0);
});

test('heavy claims the user did not write are caught', () => {
  const result = findUngrounded('She is in heaven now, watching over us after she passed away.', input);
  assert.ok(result.sensitive.includes('heaven'));
  assert.ok(result.sensitive.includes('passed away'));
  assert.ok(result.sensitive.includes('watching over'));
});

test('a heavy word the user wrote themselves is allowed', () => {
  const result = findUngrounded('We miss her since she passed away.', input + ' She passed away last year.');
  assert.equal(result.sensitive.length, 0);
});

test('ofrenda items keep only what the user wrote', () => {
  const { kept, dropped } = groundItems(['marigolds', 'Rafi songs', 'mithai', 'chai and biscuits', 'a silk saree'], input);
  assert.deepEqual(kept, ['marigolds', 'Rafi songs', 'mithai']);
  assert.deepEqual(dropped, ['chai and biscuits', 'a silk saree']);
});

test('ofrenda items handle bad input without crashing', () => {
  assert.deepEqual(groundItems(null, input), { kept: [], dropped: [] });
  assert.deepEqual(groundItems([5, '', '  ', {}], input), { kept: [], dropped: [] });
});
