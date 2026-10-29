'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { renderAltar, quietPhrase } = require('../lib/altar');
const { createStyle, visibleLength } = require('../lib/style');

const plain = createStyle({ color: false, columns: 80 });
const colour = createStyle({ color: true, columns: 80 });

const entries = [
  { name: 'gulp', uses: 14, quietFor: { days: 516 }, epitaph: { text: 'Gulp kept the lantern lit through many long winters of work.', source: 'echo' } },
  { name: 'bower', uses: 1, quietFor: { commands: 1 }, epitaph: { text: 'Not forgotten, bower. Only unused.', source: 'omen' } },
];

test('quiet time is said in days or in commands, with the right plural', () => {
  assert.equal(quietPhrase({ days: 516 }), 'quiet for 516 days');
  assert.equal(quietPhrase({ days: 1 }), 'quiet for 1 day');
  assert.equal(quietPhrase({ commands: 76 }), 'quiet for the last 76 commands');
  assert.equal(quietPhrase({ commands: 1 }), 'quiet for the last 1 command');
});

test('each remembered command gets a frame with its name, count, quiet time and epitaph', () => {
  const out = renderAltar({ entries, total: 425, dated: true }, plain);
  assert.match(out, /╭─ gulp /);
  assert.match(out, /used 14 times · quiet for 516 days/);
  assert.match(out, /Gulp kept the lantern lit/);
  assert.match(out, /· echo/);
  assert.match(out, /used 1 time · quiet for the last 1 command/);
  assert.match(out, /· omen/);
  assert.match(out, /2 remembered, from 425 commands in your history/);
});

test('the title and a candle for each entry are drawn', () => {
  const out = renderAltar({ entries, total: 425, dated: true }, plain);
  assert.match(out, /☾ {2}ofrenda {2}☾/);
  assert.match(out, /for the commands you stopped running/);
  assert.equal((out.match(/^\s+\(\s+\(\s*$/m) || []).length, 1);
});

test('no line is wider than the terminal, with or without colour', () => {
  for (const style of [plain, colour]) {
    const out = renderAltar({ entries, total: 425, dated: true }, style, { columns: 64 });
    for (const line of out.split('\n')) assert.ok(visibleLength(line) <= 64, line);
  }
});

test('a history without dates explains how to get days', () => {
  const out = renderAltar({ entries, total: 425, dated: false }, plain);
  assert.match(out, /no dates/);
  assert.match(out, /EXTENDED_HISTORY/);
  assert.doesNotMatch(renderAltar({ entries, total: 425, dated: true }, plain), /EXTENDED_HISTORY/);
});

test('an empty altar says so kindly', () => {
  const out = renderAltar({ entries: [], total: 40, dated: true }, plain);
  assert.match(out, /Nothing to remember yet/);
  assert.match(out, /0 remembered, from 40 commands/);
});
