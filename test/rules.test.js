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

test('writing raw bytes to a device or formatting a disk is a danger', () => {
  assert.equal(idOf('dd if=image.iso of=/dev/disk2 bs=1m'), 'dd-device');
  assert.equal(idOf('sudo dd if=/dev/zero of=/dev/sda'), 'dd-device');
  assert.equal(idOf('mkfs.ext4 /dev/sdb1'), 'format-disk');
  assert.equal(idOf('diskutil eraseDisk JHFS+ Name disk3'), 'format-disk');
  assert.equal(levelOf('dd if=a of=/dev/disk2'), 'danger');
});

test('dd to an ordinary file and read-only disk commands are fine', () => {
  assert.equal(judge('dd if=/dev/zero of=./test.img bs=1m count=10'), null);
  assert.equal(judge('diskutil list'), null);
});

test('opening up permissions on a whole tree is flagged', () => {
  assert.equal(idOf('chmod -R 777 ./public'), 'chmod-open');
  assert.equal(idOf('chmod -R a+rwx build'), 'chmod-open');
  assert.equal(idOf('chmod -R 777 /'), 'chmod-system');
  assert.equal(levelOf('chmod -R 777 ~'), 'danger');
  assert.equal(idOf('chown -R me:me /usr'), 'chown-system');
});

test('normal chmod and chown are fine', () => {
  for (const line of ['chmod +x script.sh', 'chmod 644 file', 'chmod -R 755 ./public', 'chown -R me:me ./project', 'chmod 777 file']) {
    assert.equal(judge(line), null, line);
  }
});

test('shutdown and reboot are a caution', () => {
  assert.equal(idOf('shutdown -h now'), 'power-off');
  assert.equal(idOf('reboot'), 'power-off');
});

test('piping a download straight into a shell is flagged', () => {
  assert.equal(idOf('curl -fsSL https://example.com/install.sh | sh'), 'pipe-to-shell');
  assert.equal(idOf('wget -qO- https://example.com/x | sudo bash'), 'pipe-to-shell');
  assert.equal(idOf('sh -c "$(curl -fsSL https://example.com/install.sh)"'), 'pipe-to-shell');
  assert.equal(levelOf('curl https://example.com | sudo bash'), 'danger');
});

test('downloading to a file or piping to a viewer is fine', () => {
  for (const line of ['curl -O https://example.com/x.sh', 'curl https://example.com | jq .', 'curl https://example.com | less', 'bash install.sh']) {
    assert.equal(judge(line), null, line);
  }
});

test('SQL that drops or truncates is flagged when given to a database client', () => {
  assert.equal(idOf('psql -c "DROP TABLE users"'), 'sql-drop-table');
  assert.equal(idOf('mysql -e "truncate table logs"'), 'sql-drop-table');
  assert.equal(idOf('psql -c "drop database app"'), 'sql-drop-database');
  assert.equal(levelOf('psql -c "drop database app"'), 'danger');
});

test('SQL words in other commands, and ordinary queries, are fine', () => {
  assert.equal(judge('echo "drop table users"'), null);
  assert.equal(judge('git commit -m "drop table of contents"'), null);
  assert.equal(judge('psql -c "select * from users"'), null);
});

test('a fork bomb is a danger', () => {
  assert.equal(idOf(':(){ :|:& };:'), 'fork-bomb');
});
