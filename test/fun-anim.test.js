'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const anim = require('../lib/fun-anim');
const { seeded, OUIJA_ANSWERS } = require('../lib/fun');
const { createStyle } = require('../lib/style');

const plain = createStyle({ color: false, columns: 80 });
const colour = createStyle({ color: true, columns: 80 });

function capture(isTTY) {
  const chunks = [];
  return { stream: { isTTY, write: (text) => chunks.push(text) }, text: () => chunks.join(''), chunks };
}

function counter() {
  const calls = [];
  return { sleep: async (ms) => { calls.push(ms); }, calls };
}

test('on a pipe, boo prints the finished picture at once and never waits', async () => {
  const out = capture(false);
  const wait = counter();
  await anim.boo({ stream: out.stream, style: plain, sleep: wait.sleep });
  assert.match(out.text(), /^👻 B O O !\n$/);
  assert.equal(wait.calls.length, 0);
});

test('on a coloured terminal, boo slides the ghost across and ends on BOO', async () => {
  const out = capture(true);
  const wait = counter();
  await anim.boo({ stream: out.stream, style: colour, sleep: wait.sleep, columns: 60 });
  assert.ok(wait.calls.length >= 10);
  assert.ok(out.chunks.length >= 10);
  assert.match(out.text(), /B O O !/);
  assert.ok(wait.calls.every((ms) => ms <= 60));
});

test('rain prints rows of emoji, quickly and finitely on a pipe', async () => {
  const out = capture(false);
  const wait = counter();
  await anim.rain({ stream: out.stream, style: plain, random: seeded(2), sleep: wait.sleep });
  assert.equal(out.text().split('\n').length, 9);
  assert.equal(wait.calls.length, 0);
});

test('rain on a terminal lasts about the number of seconds asked', async () => {
  const out = capture(true);
  const wait = counter();
  await anim.rain({ stream: out.stream, style: colour, random: seeded(2), sleep: wait.sleep, seconds: 2 });
  const total = wait.calls.reduce((a, b) => a + b, 0);
  assert.ok(total >= 1800 && total <= 2200, `waited ${total} ms`);
});

test('the spider comes down a thread and says something', async () => {
  const out = capture(false);
  await anim.spider({ stream: out.stream, style: plain, random: seeded(1), sleep: async () => {} });
  const lines = out.text().trim().split('\n');
  assert.equal(lines.filter((l) => l.trim() === '|').length, 7);
  assert.match(out.text(), /\(oo\)/);
});

test('the ouija board spells one of the written answers', async () => {
  const out = capture(false);
  const answer = await anim.ouija({ stream: out.stream, style: plain, random: seeded(4), sleep: async () => {}, question: 'will it ship?' });
  assert.ok(OUIJA_ANSWERS.includes(answer));
  assert.match(out.text(), /you asked: will it ship\?/);
  assert.match(out.text(), /YES\s+NO/);
  const spelled = out.text().split('moves... ')[1].replace(/\s+/g, '');
  assert.equal(spelled, answer.replace(/\s+/g, ''));
});

test('on a terminal the ouija answer is revealed letter by letter', async () => {
  const out = capture(true);
  const wait = counter();
  const answer = await anim.ouija({ stream: out.stream, style: colour, random: seeded(4), sleep: wait.sleep });
  assert.equal(wait.calls.length, answer.length);
});
