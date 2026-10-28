'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { shouldWhisper, normaliseLevel, CHANCE } = require('../lib/policy');

const at = (situation) => ({ situation });

test('serious events always get a whisper, even when quiet', () => {
  for (const level of ['quiet', 'normal', 'chatty']) {
    assert.equal(shouldWhisper(at('risky-ran'), level, 0.99), true);
    assert.equal(shouldWhisper(at('failed-repeat'), level, 0.99), true);
  }
});

test('quiet level says nothing about ordinary failures, slow commands or the late hour', () => {
  for (const situation of ['failed', 'slow', 'interrupted', 'late', 'quiet']) {
    assert.equal(shouldWhisper(at(situation), 'quiet', 0), false, situation);
  }
});

test('at the normal level a failure is whispered about most of the time, not always', () => {
  assert.equal(shouldWhisper(at('failed'), 'normal', 0.59), true);
  assert.equal(shouldWhisper(at('failed'), 'normal', 0.6), false);
});

test('chatty speaks more than normal', () => {
  for (const [situation, row] of Object.entries(CHANCE)) {
    assert.ok(row.chatty >= row.normal && row.normal >= row.quiet, situation);
  }
});

test('an unknown level means normal, and an unknown situation means silence', () => {
  assert.equal(normaliseLevel('LOUD'), 'normal');
  assert.equal(normaliseLevel(undefined), 'normal');
  assert.equal(normaliseLevel('Chatty'), 'chatty');
  assert.equal(shouldWhisper(at('mystery'), 'chatty', 0), false);
});
