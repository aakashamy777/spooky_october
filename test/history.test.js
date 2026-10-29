'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { parseHistory, deadCommands, keyOf, unmetafy } = require('../lib/history');

const DAY = 86400000;
const NOW = Date.UTC(2026, 9, 31, 12, 0, 0);

test('plain history lines are read one per command', () => {
  const entries = parseHistory('ls\ngit status\n\nnpm test\n');
  assert.deepEqual(entries.map((e) => e.command), ['ls', 'git status', 'npm test']);
  assert.ok(entries.every((e) => e.ts === null));
});

test('extended history lines carry a time', () => {
  const entries = parseHistory(': 1700000000:0;git status\n: 1700000100:2;make build\n');
  assert.deepEqual(entries.map((e) => e.command), ['git status', 'make build']);
  assert.equal(entries[0].ts, 1700000000 * 1000);
});

test('a command that runs over several lines is one entry', () => {
  const entries = parseHistory(': 1700000000:0;echo one \\\ntwo \\\nthree\nls\n');
  assert.equal(entries.length, 2);
  assert.equal(entries[0].command, 'echo one \\\ntwo \\\nthree');
});

test('zsh byte escapes are undone so UTF-8 reads properly', () => {
  // "é" is c3 a9. zsh writes 0x83 before each byte above 0x7f, with the byte xor 32.
  const raw = Buffer.from([0x65, 0x63, 0x68, 0x6f, 0x20, 0x83, 0xc3 ^ 32, 0x83, 0xa9 ^ 32, 0x0a]);
  assert.equal(unmetafy(raw), 'echo é\n');
  assert.equal(parseHistory(raw)[0].command, 'echo é');
});

test('the key is the program, plus a subcommand for tools that have them', () => {
  assert.equal(keyOf('git push --force origin main'), 'git push');
  assert.equal(keyOf('docker compose up -d'), 'docker compose');
  assert.equal(keyOf('FOO=1 sudo npm run build'), 'npm run');
  assert.equal(keyOf('./deploy.sh --prod'), 'deploy.sh');
  assert.equal(keyOf('grunt watch'), 'grunt');
  assert.equal(keyOf('git /etc/passwd'), 'git');
  assert.equal(keyOf(''), null);
  assert.equal(keyOf('FOO=1'), null);
});

test('arguments, and so any secrets in them, never reach the keys', () => {
  assert.equal(keyOf('curl -u admin:s3cret https://example.com'), 'curl');
  assert.equal(keyOf('mysql -uroot -pTopSecret1'), 'mysql');
});

const lines = (...parts) => parts.flat().join('\n');
const repeat = (command, times) => Array(times).fill(command);

test('without dates, a command quiet through the recent part of the history is dead', () => {
  const text = lines(repeat('gulp watch', 8), repeat('bower install', 6), repeat('git status', 20), repeat('npm test', 20), repeat('git status', 20), repeat('ls', 10));
  const result = deadCommands(parseHistory(text));
  assert.equal(result.dated, false);
  assert.deepEqual(result.dead.map((d) => d.name), ['gulp', 'bower']);
  assert.deepEqual(result.dead[0].quietFor, { commands: 76 });
});

test('with dates, a command not used for 90 days is dead', () => {
  const stamp = (daysAgo, command) => `: ${Math.floor((NOW - daysAgo * DAY) / 1000)}:0;${command}`;
  const text = lines(
    Array.from({ length: 6 }, () => stamp(200, 'grunt build')),
    Array.from({ length: 6 }, () => stamp(30, 'cargo build')),
    Array.from({ length: 6 }, () => stamp(100, 'python2 run.py')),
  );
  const result = deadCommands(parseHistory(text), { now: NOW });
  assert.equal(result.dated, true);
  assert.deepEqual(result.dead.map((d) => d.name).sort(), ['grunt', 'python2']);
  assert.deepEqual(result.dead.find((d) => d.name === 'grunt').quietFor, { days: 200 });
});

test('rarely used commands and everyday ones are not mourned', () => {
  const text = lines(repeat('rare thing', 3), repeat('ls', 9), repeat('cd ..', 9), repeat('npm test', 40));
  assert.deepEqual(deadCommands(parseHistory(text)).dead, []);
});

test('the most used dead commands come first, and only a few are listed', () => {
  const dead = [];
  for (let i = 0; i < 10; i++) dead.push(...repeat(`oldtool${i} run`, 5 + i));
  const text = lines(dead, repeat('npm test', 200));
  const result = deadCommands(parseHistory(text), { limit: 3 });
  assert.deepEqual(result.dead.map((d) => d.name), ['oldtool9', 'oldtool8', 'oldtool7']);
});

test('an empty history gives an empty result', () => {
  assert.deepEqual(deadCommands(parseHistory('')).dead, []);
});
