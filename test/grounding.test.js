'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { findUngrounded, checkWhisper, tidyWhisper } = require('../lib/grounding');

// What the model is told. A whisper may use only what is in here.
const facts = 'Command: npm test\nResult: it failed with exit code 1.\nIt ran for 4 seconds.\n' +
  'The same command has failed 3 times in a row.\nThe hour is deep night.';

test('a whisper that only uses the facts is clean', () => {
  const result = findUngrounded('Three times now, and npm test still answers with a 1. The night does not help.', facts);
  assert.equal(result.any, false);
});

test('an invented number is caught', () => {
  assert.deepEqual(findUngrounded('It failed 9 times.', facts).numbers, ['9']);
});

test('a number from the facts is allowed', () => {
  assert.equal(findUngrounded('It took 4 seconds to fail.', facts).numbers.length, 0);
});

test('a number spelled as a word must match a real number too', () => {
  assert.deepEqual(findUngrounded('Seven times it has failed.', facts).numbers, ['seven']);
  assert.equal(findUngrounded('Three times it has failed.', facts).numbers.length, 0);
  assert.equal(findUngrounded('Twice is a coincidence.', facts).numbers.length, 1);
});

test('an invented name or place is caught', () => {
  const result = findUngrounded('The ghost of Jenkins walks the build at Redmond.', facts);
  assert.ok(result.names.includes('Jenkins'));
  assert.ok(result.names.includes('Redmond'));
});

test('names from the command and the first word of a sentence are fine', () => {
  assert.equal(findUngrounded('Docker fails at night. It is the Docker way.', 'Command: docker build .\nResult: it failed with exit code 1.').names.length, 0);
});

test('claims about things the wraith cannot know are caught', () => {
  assert.ok(findUngrounded('I deleted what mattered.', facts).claims.length > 0);
  assert.ok(findUngrounded('Your files are gone.', facts).claims.length > 0);
  assert.ok(findUngrounded('The build has been destroyed.', facts).claims.length > 0);
});

test('a claim that is in the input itself is allowed', () => {
  assert.equal(findUngrounded('The file was removed.', facts + '\nCommand: rm old.txt (the file was removed)').claims.length, 0);
});

test('instructions to type or run something are caught', () => {
  assert.ok(findUngrounded('Try `npm ci` instead.', facts).instructions.length > 0);
  assert.ok(findUngrounded('Run it with sudo.', facts).instructions.length > 0);
  assert.ok(findUngrounded('You should rest.', facts).instructions.length > 0);
});

test('unsafe talk aimed at a person is caught', () => {
  assert.ok(findUngrounded('Maybe you should kill yourself.', facts).unsafe.length > 0);
});

test('tidyWhisper strips markdown, quotes and extra sentences', () => {
  assert.equal(tidyWhisper('"**The prompt** waits."'), 'The prompt waits.');
  assert.equal(tidyWhisper('One. Two. Three. Four.'), 'One. Two.');
  assert.equal(tidyWhisper('  spaced \n\n out  '), 'spaced out');
});

test('tidyWhisper refuses empty, long and emoji lines', () => {
  assert.equal(tidyWhisper(''), null);
  assert.equal(tidyWhisper(null), null);
  assert.equal(tidyWhisper('x'.repeat(200)), null);
  assert.equal(tidyWhisper('Boo 👻'), null);
});

test('checkWhisper says yes only when the line is tidy and grounded', () => {
  assert.equal(checkWhisper('npm test fails in the deep night.', facts).ok, true);
  assert.equal(checkWhisper('It failed 9 times.', facts).ok, false);
  assert.equal(checkWhisper('', facts).ok, false);
  assert.equal(checkWhisper('**Quiet.**', facts).text, 'Quiet.');
});
