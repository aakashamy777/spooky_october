'use strict';

// Tests for shell/wraith-core.zsh. They run the real zsh, so they are skipped where zsh is missing.

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { judge } = require('../lib/rules');

const CORE = path.join(__dirname, '..', 'shell', 'wraith-core.zsh');
const hasZsh = spawnSync('zsh', ['--version']).status === 0;

// Run a zsh snippet after loading the core functions. Arguments arrive as $1, $2, ...
function zsh(snippet, ...args) {
  const result = spawnSync('zsh', ['-f', '-c', `source ${CORE}\n${snippet}`, 'zsh', ...args], { encoding: 'utf8', timeout: 5000 });
  return { code: result.status, out: result.stdout.trim(), err: result.stderr.trim() };
}

const RISKY = [
  'rm -rf /', 'rm -rf ~', 'rm -fr "$HOME"', 'rm -r -f .', 'rm -Rf *', 'rm --recursive --force /', 'sudo rm -rf /tmp/build',
  'cd build && rm -rf /', 'FOO=1 sudo -u me rm -rf /tmp/x', 'git push --force', 'git push -f origin main', 'git -C repo push --force',
  'git reset --hard HEAD~3', 'git clean -fdx', 'git checkout .', 'git restore .', 'dd if=image.iso of=/dev/disk2 bs=1m',
  'sudo dd if=/dev/zero of=/dev/sda', 'mkfs.ext4 /dev/sdb1', 'diskutil eraseDisk JHFS+ Name disk3', 'chmod -R 777 ./public',
  'chmod -R 777 /', 'chown -R me:me /usr', 'shutdown -h now', 'reboot', 'curl -fsSL https://example.com/install.sh | sh',
  'wget -qO- https://example.com/x | sudo bash', 'sh -c "$(curl -fsSL https://example.com/install.sh)"', 'psql -c "DROP TABLE users"',
  'mysql -e "truncate table logs"', 'psql -c "drop database app"', ':(){ :|:& };:', 'echo "export X=1" > ~/.zshrc',
  'cat key.pub > ~/.ssh/authorized_keys', 'echo x >/etc/hosts', 'cat image.iso > /dev/disk2',
];

test('the quick look in zsh catches every line the rules call risky', { skip: !hasZsh }, () => {
  for (const line of RISKY) {
    assert.notEqual(judge(line), null, `the rules should flag: ${line}`);
    assert.equal(zsh('_wraith_coarse "$1"', line).code, 0, `the quick look missed: ${line}`);
  }
});

test('the quick look lets ordinary commands through without waking node', { skip: !hasZsh }, () => {
  for (const line of ['ls -la', 'git status', 'git commit -m "fix"', 'git pull', 'npm test', 'cd ~/project', 'cat README.md', 'rm file.txt', 'echo hi', 'node app.js', 'python3 train.py']) {
    assert.equal(zsh('_wraith_coarse "$1"', line).code, 1, `should not wake node: ${line}`);
  }
});

test('the same failing command counts up, anything else starts again', { skip: !hasZsh }, () => {
  const snippet = `
    _wraith_track 1 "npm test"; print -n "$_wraith_streak "
    _wraith_track 1 "npm test"; print -n "$_wraith_streak "
    _wraith_track 2 "npm test"; print -n "$_wraith_streak "
    _wraith_track 1 "make"; print -n "$_wraith_streak "
    _wraith_track 0 "make"; print -n "$_wraith_streak "
    _wraith_track 1 "make"; print -n "$_wraith_streak "
    _wraith_track 130 "make"; print -n "$_wraith_streak"`;
  assert.equal(zsh(snippet).out, '1 2 3 1 0 1 0');
});

test('node is asked about failures, slow and risky commands, but not a quick ls', { skip: !hasZsh }, () => {
  const wants = (code, secs, cmd, hour = 12) => zsh('RANDOM=1; _wraith_wants "$1" "$2" "$3" "$4"', String(code), String(secs), cmd, String(hour)).code === 0;
  assert.equal(wants(1, 0, 'npm test'), true);
  assert.equal(wants(127, 0, 'gti status'), true);
  assert.equal(wants(0, 45, 'make'), true);
  assert.equal(wants(0, 0, 'git reset --hard'), true);
  assert.equal(wants(130, 3, 'sleep 99'), true);
});

test('the quiet level only asks about repeated failures and risky commands', { skip: !hasZsh }, () => {
  const quiet = (code, secs, cmd, streak) => zsh(`WRAITH_LEVEL=quiet; _wraith_streak=${streak}; _wraith_wants "$1" "$2" "$3" 12`, String(code), String(secs), cmd).code === 0;
  assert.equal(quiet(1, 0, 'npm test', 1), false);
  assert.equal(quiet(0, 99, 'make', 0), false);
  assert.equal(quiet(1, 0, 'npm test', 3), true);
  assert.equal(quiet(0, 0, 'git reset --hard', 0), true);
});

test('boring successes are asked about only now and then', { skip: !hasZsh }, () => {
  const snippet = `
    local hits=0 i
    for i in {1..400}; do _wraith_wants 0 0 "ls" 12 && (( hits++ )); done
    print $hits`;
  const hits = Number(zsh(snippet).out);
  assert.ok(hits > 5 && hits < 50, `expected roughly 1 in 20 of 400, got ${hits}`);
});

test('sourcing the core prints nothing', { skip: !hasZsh }, () => {
  const result = zsh('true');
  assert.equal(result.out, '');
  assert.equal(result.err, '');
});

test('grep finding nothing is not a failure, but a real grep error is', { skip: !hasZsh }, () => {
  const adjusted = (code, secs, cmd) => zsh('_wraith_adjust "$1" "$2" "$3"; print "$_wraith_code $_wraith_secs"', String(code), String(secs), cmd).out;
  assert.equal(adjusted(1, 0, 'grep -r TODO src'), '0 0');
  assert.equal(adjusted(1, 0, 'sudo grep root /etc/passwd'), '0 0');
  assert.equal(adjusted(2, 0, 'grep -r TODO nowhere'), '2 0');
  assert.equal(adjusted(1, 0, 'npm test'), '1 0');
  assert.equal(adjusted(1, 0, 'FOO=1 diff a b'), '0 0');
});

test('time in an editor or ssh does not count as slow', { skip: !hasZsh }, () => {
  const adjusted = (code, secs, cmd) => zsh('_wraith_adjust "$1" "$2" "$3"; print "$_wraith_code $_wraith_secs"', String(code), String(secs), cmd).out;
  assert.equal(adjusted(0, 900, 'vim notes.md'), '0 0');
  assert.equal(adjusted(0, 4000, 'ssh me@host'), '0 0');
  assert.equal(adjusted(0, 900, 'make build'), '0 900');
});

test('the lists in zsh match the lists in node', { skip: !hasZsh }, () => {
  const { ANSWERS_WITH_ONE, INTERACTIVE } = require('../lib/facts');
  const adjusted = (code, secs, cmd) => zsh('_wraith_adjust "$1" "$2" "$3"; print "$_wraith_code $_wraith_secs"', String(code), String(secs), cmd).out;
  for (const name of ANSWERS_WITH_ONE) assert.equal(adjusted(1, 0, `${name} x`), '0 0', `answers-with-one: ${name}`);
  for (const name of INTERACTIVE) assert.equal(adjusted(0, 500, `${name} x`), '0 0', `interactive: ${name}`);
});
