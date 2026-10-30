'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { buildFacts, factsText, partOfDay, programName } = require('../lib/facts');

const at = (hour, rest) => buildFacts({ hour, exit: 0, seconds: 0, ...rest });

test('hours map to a part of the day', () => {
  assert.equal(partOfDay(3), 'deep night');
  assert.equal(partOfDay(6), 'dawn');
  assert.equal(partOfDay(13), 'day');
  assert.equal(partOfDay(19), 'evening');
  assert.equal(partOfDay(23), 'night');
});

test('the program name looks past variables and sudo', () => {
  assert.equal(programName('npm test'), 'npm');
  assert.equal(programName('FOO=1 sudo -u me rm -rf x'), 'rm');
  assert.equal(programName('./run.sh --fast'), 'run.sh');
  assert.equal(programName(''), 'it');
});

test('secrets are hidden in the facts and counted', () => {
  const facts = at(12, { command: 'API_KEY=abc123 node app.js', exit: 1 });
  assert.equal(facts.command, 'API_KEY=[hidden] node app.js');
  assert.equal(facts.hidden, 1);
});

test('a long command is cut', () => {
  const facts = at(12, { command: 'echo ' + 'word '.repeat(80), exit: 1 });
  assert.ok(facts.command.length <= 120);
});

test('the situation is the most notable thing, in order', () => {
  assert.equal(at(12, { command: 'git reset --hard' }).situation, 'risky-ran');
  assert.equal(at(12, { command: 'sleep 99', exit: 130 }).situation, 'interrupted');
  assert.equal(at(12, { command: 'npm test', exit: 1, streak: 3 }).situation, 'failed-repeat');
  assert.equal(at(12, { command: 'npm test', exit: 1, streak: 2 }).situation, 'failed');
  assert.equal(at(12, { command: 'make', seconds: 45 }).situation, 'slow');
  assert.equal(at(3, { command: 'ls' }).situation, 'late');
  assert.equal(at(12, { command: 'ls' }).situation, 'quiet');
});

test('a failure always counts as at least one in a row, a success as none', () => {
  assert.equal(at(12, { command: 'x', exit: 2, streak: 0 }).streak, 1);
  assert.equal(at(12, { command: 'x', exit: 0, streak: 5 }).streak, 0);
});

test('values from the shell are taken as text and made safe', () => {
  const facts = buildFacts({ command: 'ls', exit: 'abc', seconds: '-4', streak: '2.9', cwd: '/Users/me/project/', hour: 12 });
  assert.equal(facts.exit, 0);
  assert.equal(facts.seconds, 0);
  assert.equal(facts.streak, 0);
  assert.equal(facts.cwd, 'project');
});

test('the facts text contains only computed things', () => {
  const text = factsText(at(3, { command: 'npm test', exit: 1, seconds: 4, streak: 3 }));
  assert.match(text, /Command: npm test/);
  assert.match(text, /exit code 1/);
  assert.match(text, /4 seconds/);
  assert.match(text, /3 times in a row/);
  assert.match(text, /deep night/);
});

test('grep finding nothing, or diff finding a difference, is an answer and not a failure', () => {
  assert.equal(at(12, { command: 'grep -r TODO src', exit: 1 }).situation, 'quiet');
  assert.equal(at(12, { command: 'diff a.txt b.txt', exit: 1 }).exit, 0);
  assert.equal(at(12, { command: 'sudo grep root /etc/passwd', exit: 1 }).exit, 0);
});

test('but a real error from those programs is still a failure', () => {
  assert.equal(at(12, { command: 'grep -r TODO nowhere', exit: 2 }).situation, 'failed');
  assert.equal(at(12, { command: 'npm test', exit: 1 }).situation, 'failed');
});

test('a long session in an editor, a pager or ssh is not a slow command', () => {
  assert.equal(at(12, { command: 'vim notes.md', seconds: 900 }).situation, 'quiet');
  assert.equal(at(12, { command: 'ssh me@host', seconds: 4000 }).seconds, 0);
  assert.equal(at(12, { command: 'make build', seconds: 900 }).situation, 'slow');
});
