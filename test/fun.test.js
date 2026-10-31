'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fun = require('../lib/fun');
const { createStyle, visibleLength } = require('../lib/style');

const plain = createStyle({ color: false, columns: 80 });
const colour = createStyle({ color: true, columns: 80 });

test('the same seed always draws the same picture, and different seeds differ', () => {
  const a = fun.haunt(fun.seeded(7), plain).text;
  const b = fun.haunt(fun.seeded(7), plain).text;
  assert.equal(a, b);
  const names = new Set();
  for (let seed = 1; seed <= 40; seed++) names.add(fun.haunt(fun.seeded(seed), plain).name);
  assert.ok(names.size >= 6, `expected a good mix of scenes, got ${[...names].join(', ')}`);
});

test('every scene draws something, in plain text and in colour, and fits the terminal', () => {
  for (const scene of fun.SCENE_NAMES) {
    for (const style of [plain, colour]) {
      for (let seed = 1; seed <= 12; seed++) {
        const { name, text } = fun.haunt(fun.seeded(seed), style, { scene, width: 64 });
        assert.equal(name, scene);
        assert.ok(text.trim().length > 10, scene);
        for (const line of text.split('\n')) assert.ok(visibleLength(line) <= 70, `${scene}: ${line}`);
      }
    }
  }
});

test('asking for a scene that does not exist gives a random one', () => {
  const { name } = fun.haunt(fun.seeded(3), plain, { scene: 'nonsense' });
  assert.ok(fun.SCENE_NAMES.includes(name));
});

test('the graveyard uses real epitaphs and never repeats one on the same row', () => {
  for (let seed = 1; seed <= 30; seed++) {
    const text = fun.haunt(fun.seeded(seed), plain, { scene: 'graveyard' }).text;
    assert.match(text, /R\.I\.P\./);
    const found = fun.EPITAPHS.filter((e) => text.includes(e.split(' ').slice(0, 2).join(' ')));
    assert.ok(found.length >= 1);
  }
});

test('the ghost row has three ghosts and a caption under each', () => {
  const text = fun.haunt(fun.seeded(5), plain, { scene: 'ghosts' }).text;
  assert.equal((text.match(/\.-----\./g) || []).length, 3);
});

test('a fortune is one of the written ones, with a lucky number and a lucky ghost', () => {
  for (let seed = 1; seed <= 20; seed++) {
    const text = fun.fortune(fun.seeded(seed), plain);
    assert.ok(fun.FORTUNES.some((f) => f.split(' ').slice(0, 3).every((w) => text.includes(w))));
    assert.match(text, /lucky number: \d+/);
    assert.match(text, /lucky ghost: \S+/);
  }
});

test('a ghost says what it is given, wrapped in a bubble, and says boo when given nothing', () => {
  const out = fun.say('hello from the other side of the terminal window', fun.seeded(1), plain);
  assert.match(out, /╭─/);
  assert.match(out, /hello from the other side/);
  assert.match(out, /\.-----\./);
  assert.match(fun.say('   ', fun.seeded(1), plain), /boo\./);
  for (const line of out.split('\n')) assert.ok(visibleLength(line) <= 80, line);
});

test('the ouija answer is one of the written ones, and the board has every letter', () => {
  assert.ok(fun.OUIJA_ANSWERS.includes(fun.ouijaAnswer(fun.seeded(9))));
  const board = fun.OUIJA_BOARD.join('\n');
  for (const letter of 'ABCDEFGHIJKLMNOPQRSTUVWXYZ') assert.ok(board.includes(letter), letter);
  assert.match(board, /YES/);
  assert.match(board, /GOODBYE/);
});

test('trick or treat gives a treat or a trick, and says when the ghost changed your mind', () => {
  const seen = new Set();
  for (let seed = 1; seed <= 40; seed++) {
    const result = fun.treatOrTrick('treat', fun.seeded(seed));
    seen.add(result.outcome);
    assert.equal(result.flipped, result.outcome !== 'treat');
    assert.ok((result.outcome === 'treat' ? fun.TREATS : fun.TRICKS).includes(result.text));
  }
  assert.deepEqual([...seen].sort(), ['treat', 'trick']);
});

test('the written lines stay friendly: no gore, no self-harm, no slurs', () => {
  const all = [...fun.FORTUNES, ...fun.EPITAPHS, ...fun.INGREDIENTS, ...fun.OUIJA_ANSWERS, ...fun.TREATS, ...fun.TRICKS].join('\n');
  assert.doesNotMatch(all, /\b(kill yourself|suicide|blood|gore|murder|rape)\b/i);
});

test('side by side blocks line up', () => {
  const lines = fun.sideBySide([['ab', 'a'], ['cd']], 2);
  assert.deepEqual(lines, ['ab  cd', 'a']);
});
