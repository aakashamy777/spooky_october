'use strict';

// Whispers written by hand, chosen by code. They are the wraith's voice when the model is
// slow, away, or says something that does not hold up, and they are what appears first.
// Placeholders: {name} {exit} {seconds} {streak} {cwd} {part}. All of them come from facts.js.

const OMENS = {
  failed: [
    '{name} did not make it back. Exit {exit}.',
    'Something in {name} went out like a candle. I felt it at exit {exit}.',
    'The shell is quieter now. {name} left with {exit}.',
    '{name} knocked, and no one answered.',
    'Not every command comes home.',
  ],
  'failed-127': [
    '{name} is not here. Perhaps it never was.',
    'I searched every folder in your PATH. {name} is not buried in any of them.',
    'You called for {name}. Nothing answered.',
  ],
  'failed-126': [
    'The door is there, but you do not hold the key.',
    '{name} is in the room with you, and it will not move for you.',
  ],
  'failed-137': [
    'Something put {name} out before it could finish.',
    '{name} was taken. I did not see by whom.',
  ],
  'failed-139': [
    '{name} walked somewhere memory does not reach.',
    'It crossed a line in memory that it should not have.',
  ],
  'failed-repeat': [
    '{streak} times now. {name} will not answer differently.',
    '{streak} attempts. I am beginning to think it is waiting for something else.',
    'Again? That is {streak} times. I will keep the candle lit.',
    'The same door, {streak} times. It has not opened.',
  ],
  slow: [
    '{seconds} seconds. I counted every one.',
    '{name} took {seconds} seconds. The room grew colder while we waited.',
    'That was a long {seconds} seconds. I did not leave.',
  ],
  late: [
    'It is {part}. The machine remembers things at this hour.',
    'The {part}. Even the processes are whispering now.',
    'Still here in the {part}? So am I.',
  ],
  interrupted: [
    'You stopped it. {name} will remember that.',
    'Interrupted. Some things are left unfinished on purpose.',
    'A hand over the flame. {name} is gone.',
  ],
  'risky-ran': [
    'It is done. I did not stop you. I only watch.',
    'The gate is behind you now. I hope you meant it.',
    '{name} has gone where it was sent.',
  ],
  gate: [
    'Are you certain? I have seen what comes after this.',
    'The air changed when you pressed enter.',
    'I will wait. I have nothing but time.',
    'Some doors only open one way.',
  ],
  quiet: [
    'Something in this shell is listening.',
    'All is quiet. Too quiet, perhaps.',
    'I am still here, in the space between your commands.',
    'The cursor blinks. I blink with it.',
    '{name}. I will remember that one.',
  ],
};

// Fallback epitaphs for the ofrenda, when the model is away or says something that does not hold up.
const EPITAPHS = [
  '{name}. {uses} times, and then never again.',
  'Rest well, {name}. You were used {uses} times.',
  'The shell still remembers how {name} sounded.',
  '{name} kept the flame, {uses} times over.',
  'Not forgotten, {name}. Only unused.',
  'Somewhere a prompt still waits for {name}.',
];

const SPECIFIC_EXITS = { 126: 'failed-126', 127: 'failed-127', 137: 'failed-137', 139: 'failed-139' };

// A small, stable number from text, so the same event gets the same omen and tests can rely on it.
function seedOf(text) {
  let hash = 0;
  for (const ch of String(text)) hash = (hash * 31 + ch.codePointAt(0)) >>> 0;
  return hash;
}

function fill(template, facts) {
  const values = {
    name: facts.name,
    exit: facts.exit,
    seconds: facts.seconds,
    streak: facts.streak,
    cwd: facts.cwd,
    part: facts.part,
  };
  return template.replace(/\{(\w+)\}/g, (match, key) => (key in values ? String(values[key]) : match));
}

// Which list of omens fits these facts.
function listFor(facts) {
  if (facts.situation === 'failed' && SPECIFIC_EXITS[facts.exit]) return SPECIFIC_EXITS[facts.exit];
  return facts.situation;
}

// Pick one omen for these facts. `seed` can be a number to choose a particular one.
function omenFor(facts, seed) {
  const key = listFor(facts);
  const list = OMENS[key] || OMENS.quiet;
  const n = seed === undefined ? seedOf(`${facts.command}|${facts.exit}|${facts.seconds}`) : seed;
  return fill(list[n % list.length], facts);
}

// The line shown on the gate card before a risky command runs.
function gateOmen(command, seed) {
  const n = seed === undefined ? seedOf(command) : seed;
  return OMENS.gate[n % OMENS.gate.length];
}

// A hand-written epitaph for one entry of the ofrenda ({ name, uses }).
function epitaphOmen(entry, seed) {
  const n = seed === undefined ? seedOf(entry.name) : seed;
  return EPITAPHS[n % EPITAPHS.length].replace(/\{name\}/g, entry.name).replace(/\{uses\}/g, String(entry.uses));
}

module.exports = { OMENS, EPITAPHS, omenFor, gateOmen, epitaphOmen, fill, listFor, seedOf };
