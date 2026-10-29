'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { OMENS, EPITAPHS, omenFor, gateOmen, epitaphOmen, fill } = require('../lib/omens');
const { buildFacts } = require('../lib/facts');

const KNOWN_PLACEHOLDERS = new Set(['name', 'exit', 'seconds', 'streak', 'cwd', 'part']);

test('every situation has several omens', () => {
  for (const [key, list] of Object.entries(OMENS)) {
    assert.ok(list.length >= 2, key);
  }
  for (const key of ['failed', 'failed-repeat', 'slow', 'late', 'interrupted', 'risky-ran', 'gate', 'quiet']) {
    assert.ok(OMENS[key].length >= 3, key);
  }
});

test('omens only use placeholders the facts can fill, and stay short', () => {
  for (const [key, list] of Object.entries(OMENS)) {
    for (const line of list) {
      for (const [, name] of line.matchAll(/\{(\w+)\}/g)) {
        assert.ok(KNOWN_PLACEHOLDERS.has(name), `${key}: ${line}`);
      }
      assert.ok(line.length <= 90, `${key}: ${line}`);
    }
  }
});

test('omens make no claim of having run, deleted or fixed anything', () => {
  for (const list of Object.values(OMENS)) {
    for (const line of list) {
      assert.doesNotMatch(line, /\b(deleted|removed|erased|fixed|ran|executed|I stopped)\b/i, line);
    }
  }
});

test('placeholders are filled from the facts', () => {
  const facts = buildFacts({ command: 'npm test', exit: 1, seconds: 4, streak: 3, hour: 12 });
  assert.equal(fill('{name} {exit} {seconds} {streak} {part}', facts), 'npm 1 4 3 day');
  assert.equal(fill('{unknown}', facts), '{unknown}');
});

test('the omen matches the situation', () => {
  const slow = buildFacts({ command: 'make', exit: 0, seconds: 61, hour: 12 });
  assert.match(omenFor(slow, 0), /61 seconds/);
  const repeat = buildFacts({ command: 'npm test', exit: 1, streak: 4, hour: 12 });
  assert.match(omenFor(repeat, 0), /4/);
});

test('command not found and permission denied get their own omens', () => {
  const missing = buildFacts({ command: 'nodee -v', exit: 127, hour: 12 });
  assert.match(omenFor(missing, 0), /nodee/);
  assert.ok(OMENS['failed-127'].includes('{name} is not here. Perhaps it never was.'));
  const denied = buildFacts({ command: './run.sh', exit: 126, hour: 12 });
  assert.ok(OMENS['failed-126'].some((t) => fill(t, denied) === omenFor(denied, OMENS['failed-126'].indexOf(t))));
});

test('the same event always gets the same omen', () => {
  const facts = buildFacts({ command: 'ls', exit: 2, hour: 12 });
  assert.equal(omenFor(facts), omenFor(facts));
});

test('no placeholder is left in any omen that is shown', () => {
  const samples = [
    { command: 'a', exit: 1 }, { command: 'b', exit: 127 }, { command: 'c', exit: 126 }, { command: 'd', exit: 137 },
    { command: 'e', exit: 139 }, { command: 'f', exit: 1, streak: 5 }, { command: 'g', exit: 0, seconds: 99 },
    { command: 'h', exit: 130 }, { command: 'git reset --hard', exit: 0 }, { command: 'i', exit: 0 },
  ];
  for (const sample of samples) {
    for (const hour of [3, 12]) {
      const facts = buildFacts({ ...sample, hour });
      for (let seed = 0; seed < 6; seed++) {
        assert.doesNotMatch(omenFor(facts, seed), /[{}]/, JSON.stringify(sample));
      }
    }
  }
});

test('the gate always has a line to say', () => {
  assert.ok(gateOmen('rm -rf /').length > 0);
  assert.equal(gateOmen('rm -rf /'), gateOmen('rm -rf /'));
});

test('fallback epitaphs name the tool and only claim what is known', () => {
  assert.ok(EPITAPHS.length >= 5);
  for (let seed = 0; seed < EPITAPHS.length; seed++) {
    const line = epitaphOmen({ name: 'gulp', uses: 8 }, seed);
    assert.doesNotMatch(line, /[{}]/);
    assert.ok(line.length <= 60, line);
    assert.doesNotMatch(line, /\b(deleted|broken|dead|died|killed)\b/i, line);
  }
  assert.equal(epitaphOmen({ name: 'gulp', uses: 8 }, 0), 'gulp. 8 times, and then never again.');
  assert.equal(epitaphOmen({ name: 'gulp', uses: 8 }), epitaphOmen({ name: 'gulp', uses: 8 }));
});
