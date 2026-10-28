'use strict';

// How often the wraith speaks. A ghost that comments on everything is just noise.
// Chance of a whisper for each situation, at each level (WRAITH_LEVEL).
// "quiet" and "late" events are also thinned out by the shell hook before they get here (see shell/wraith.zsh).

const LEVELS = ['quiet', 'normal', 'chatty'];

const CHANCE = {
  'risky-ran': { quiet: 1, normal: 1, chatty: 1 },
  'failed-repeat': { quiet: 1, normal: 1, chatty: 1 },
  slow: { quiet: 0, normal: 1, chatty: 1 },
  failed: { quiet: 0, normal: 0.6, chatty: 1 },
  interrupted: { quiet: 0, normal: 0.3, chatty: 0.8 },
  late: { quiet: 0, normal: 1, chatty: 1 },
  quiet: { quiet: 0, normal: 1, chatty: 1 },
};

function normaliseLevel(level) {
  const value = String(level || '').toLowerCase();
  return LEVELS.includes(value) ? value : 'normal';
}

// `roll` is a number from 0 up to (not including) 1. It is a parameter so tests can fix it.
function shouldWhisper(facts, level, roll = Math.random()) {
  const row = CHANCE[facts.situation];
  if (!row) return false;
  return roll < row[normaliseLevel(level)];
}

module.exports = { shouldWhisper, normaliseLevel, LEVELS, CHANCE };
