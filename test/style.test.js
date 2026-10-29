'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { createStyle, detect, visibleLength } = require('../lib/style');

const plain = createStyle({ color: false, columns: 80 });
const colour = createStyle({ color: true, trueColor: false, columns: 80 });
const truecolour = createStyle({ color: true, trueColor: true, columns: 80 });

test('with no colour, paint returns the text untouched', () => {
  assert.equal(plain.paint('marigold', 'hello', { italic: true }), 'hello');
});

test('with colour, paint wraps the text in codes and resets', () => {
  const out = colour.paint('marigold', 'hi', { italic: true });
  assert.match(out, /^\u001b\[3;38;5;214mhi\u001b\[0m$/);
  assert.match(truecolour.paint('marigold', 'hi'), /38;2;245;183;38m/);
});

test('visibleLength ignores colour codes', () => {
  assert.equal(visibleLength(colour.paint('violet', 'ghost')), 5);
  assert.equal(visibleLength('plain'), 5);
});

test('detect turns colour off for NO_COLOR, WRAITH_PLAIN, dumb terminals and pipes', () => {
  const tty = { isTTY: true, columns: 100 };
  assert.equal(detect({}, tty).color, true);
  assert.equal(detect({ NO_COLOR: '1' }, tty).color, false);
  assert.equal(detect({ NO_COLOR: '' }, tty).color, false);
  assert.equal(detect({ WRAITH_PLAIN: '1' }, tty).color, false);
  assert.equal(detect({ TERM: 'dumb' }, tty).color, false);
  assert.equal(detect({}, { isTTY: false }).color, false);
  assert.equal(detect({ FORCE_COLOR: '1' }, { isTTY: false }).color, true);
});

test('truecolor is used only when the terminal says so', () => {
  const tty = { isTTY: true, columns: 80 };
  assert.equal(detect({ COLORTERM: 'truecolor' }, tty).trueColor, true);
  assert.equal(detect({}, tty).trueColor, false);
  assert.equal(detect({ COLORTERM: 'truecolor', NO_COLOR: '1' }, tty).trueColor, false);
});

test('wrap breaks on spaces and cuts a word that is longer than a line', () => {
  assert.deepEqual(plain.wrap('one two three four', 9), ['one two', 'three', 'four']);
  assert.deepEqual(plain.wrap('supercalifragilistic', 5), ['super', 'calif', 'ragil', 'istic']);
  assert.deepEqual(plain.wrap('ab supercalifragilistic cd', 8), ['ab', 'supercal', 'ifragili', 'stic cd']);
  assert.deepEqual(plain.wrap('a\nb', 10), ['a', 'b']);
});

test('every line of a box is the same visible width, with or without colour', () => {
  for (const style of [plain, colour]) {
    const out = style.box(['short', style.paint('bone', 'a longer line of text')], { title: 'the wraith stirs', width: 50 }).split('\n');
    const widths = new Set(out.map(visibleLength));
    assert.equal(widths.size, 1, out.join('\n'));
    assert.equal(out.length, 4);
  }
});

test('a plain box has the title in the top edge', () => {
  const [top] = plain.box(['x'], { title: 'hello', width: 30 }).split('\n');
  assert.match(top, /^╭─ hello ─+╮$/);
});

test('a whisper line names its source', () => {
  assert.equal(plain.whisperLine('It is quiet.', 'omen'), '  ☾ It is quiet. · omen');
});

test('typewrite writes everything at once when there is no colour or no terminal', async () => {
  const chunks = [];
  const stream = { isTTY: true, write: (text) => chunks.push(text) };
  await plain.typewrite(stream, 'abc');
  assert.deepEqual(chunks, ['abc']);

  chunks.length = 0;
  await colour.typewrite({ isTTY: false, write: (text) => chunks.push(text) }, 'abc');
  assert.deepEqual(chunks, ['abc']);
});

test('typewrite stays within its time limit on a terminal', async () => {
  const chunks = [];
  const stream = { isTTY: true, write: (text) => chunks.push(text) };
  const started = Date.now();
  await colour.typewrite(stream, 'x'.repeat(60), { maxMs: 300 });
  assert.equal(chunks.join(''), 'x'.repeat(60));
  assert.ok(Date.now() - started < 1200);
});

test('typewrite sends colour codes whole and only counts visible characters', async () => {
  const chunks = [];
  const stream = { isTTY: true, write: (text) => chunks.push(text) };
  await colour.typewrite(stream, colour.paint('violet', 'ab'), { maxMs: 100 });
  assert.equal(chunks.length, 4);
  assert.match(chunks[0], /^\u001b\[38;5;141m$/);
  assert.equal(chunks[1], 'a');
  assert.equal(chunks[2], 'b');
  assert.equal(chunks[3], '\u001b[0m');
});
