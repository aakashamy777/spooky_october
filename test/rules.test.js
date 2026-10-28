'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { judge, tokenize, segments, describe } = require('../lib/rules');

const idOf = (line) => (judge(line) || {}).id || null;
const levelOf = (line) => (judge(line) || {}).level || null;

test('quotes group words and operators split commands', () => {
  const words = tokenize('echo "a b" && ls \'c d\' | wc').filter((t) => t.type === 'word').map((t) => t.value);
  assert.deepEqual(words, ['echo', 'a b', 'ls', 'c d', 'wc']);
  assert.equal(segments('a && b | c; d').length, 4);
  assert.equal(segments('a | b')[1].piped, true);
  assert.equal(segments('a && b')[1].piped, false);
});

test('sudo and variable prefixes are looked through', () => {
  const cmd = describe(segments('FOO=1 sudo -u me rm -rf x')[0]);
  assert.equal(cmd.name, 'rm');
  assert.equal(cmd.sudo, true);
});

test('ordinary commands are not risky', () => {
  for (const line of ['ls -la', 'git status', 'git push origin feature', 'npm test', 'rm file.txt', 'rm -rf node_modules', 'rm -rf build/ dist/', 'echo "rm -rf /"']) {
    assert.equal(judge(line), null, line);
  }
});

test('rm -rf on a whole system or home directory is a danger', () => {
  for (const line of ['rm -rf /', 'rm -rf ~', 'rm -rf ~/', 'rm -rf $HOME', 'rm -fr "$HOME"', 'rm -r -f .', 'rm -Rf *', 'rm -rf /usr', 'rm -rf /Users/aakash', 'rm --recursive --force /']) {
    assert.equal(idOf(line), 'rm-catastrophic', line);
    assert.equal(levelOf(line), 'danger', line);
  }
});

test('rm -rf outside the current folder or with a pattern is a caution', () => {
  for (const line of ['rm -rf /tmp/build', 'rm -rf ../old', 'rm -rf src/*.o', 'rm -rf ~/Downloads/old']) {
    assert.equal(idOf(line), 'rm-wide', line);
    assert.equal(levelOf(line), 'caution', line);
  }
});

test('sudo turns a caution into a danger', () => {
  assert.equal(levelOf('rm -rf /tmp/build'), 'caution');
  assert.equal(levelOf('sudo rm -rf /tmp/build'), 'danger');
});

test('only the risky part of a chained command matters', () => {
  assert.equal(idOf('cd build && rm -rf /'), 'rm-catastrophic');
  assert.equal(idOf('echo hi; git reset --hard'), 'git-reset-hard');
});

test('force-pushing is flagged, and a shared branch is a danger', () => {
  assert.equal(idOf('git push --force'), 'git-force-push');
  assert.equal(idOf('git push -f origin feature'), 'git-force-push');
  assert.equal(idOf('git push -f origin main'), 'git-force-push-shared');
  assert.equal(levelOf('git push --force origin HEAD:master'), 'danger');
  assert.equal(idOf('git -C repo push --force'), 'git-force-push');
});

test('a safer force push and plain pushes are fine', () => {
  assert.equal(judge('git push --force-with-lease origin feature'), null);
  assert.equal(judge('git push origin main'), null);
});

test('git commands that throw work away are flagged', () => {
  assert.equal(idOf('git reset --hard HEAD~3'), 'git-reset-hard');
  assert.equal(idOf('git clean -fdx'), 'git-clean');
  assert.equal(idOf('git checkout .'), 'git-discard-all');
  assert.equal(idOf('git checkout -- .'), 'git-discard-all');
  assert.equal(idOf('git restore .'), 'git-discard-all');
});

test('safe git variants are fine', () => {
  for (const line of ['git reset --soft HEAD~1', 'git clean -n', 'git clean -fdn', 'git clean --dry-run -f', 'git checkout main', 'git checkout -b topic', 'git restore README.md']) {
    assert.equal(judge(line), null, line);
  }
});

test('odd input does not crash', () => {
  assert.equal(judge(''), null);
  assert.equal(judge('   '), null);
  assert.equal(judge(undefined), null);
  assert.equal(judge('echo "unterminated'), null);
});
