'use strict';

// Drives the real hook in a real interactive zsh, inside a throwaway home folder.
// Only harmless commands are used: the "risky" ones either never run (the gate declines them)
// or run on an empty temp folder. Skipped where zsh or expect is missing.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const HOOK = path.join(__dirname, '..', 'shell', 'wraith.zsh');
const can = (cmd, args) => spawnSync(cmd, args, { stdio: 'ignore' }).status === 0;
const available = process.platform !== 'win32' && can('zsh', ['--version']) && can('which', ['expect']);

const EXPECT_SCRIPT = String.raw`
fconfigure stdout -buffering none
set timeout 10
spawn zsh -i
# With no controlling terminal the pty starts with odd settings; a real terminal is 'sane'.
stty sane < $spawn_out(slave,name)
stty rows 40 columns 100 < $spawn_out(slave,name)
expect "% "
send "cd $env(WORKDIR)\r"
sleep 0.8

# 1. a failing command gets a whisper above the prompt
send "false\r"
expect -re {omen[^\r\n]*false}
puts "\nMARK whisper"
sleep 0.8

# 2. a risky command stops at the gate, and Enter means no
send "git clean -fdx\r"
expect "the wraith stirs"
expect "Let it run"
puts "\nMARK gate"
sleep 0.7
send "\r"
expect "it stays where it is"
puts "\nMARK declined"
expect -re {% git clean -fdx}
sleep 1
send "\025"
sleep 1
send "echo still-\$((6*7))\r"
expect "still-42"
puts "\nMARK shell-alive"
sleep 0.8

# 3. answering y lets a (harmless) risky command run
send "chmod -R 777 d\r"
expect "Let it run"
sleep 0.7
send "y"
sleep 0.8
send "ls -ld d\r"
expect "drwxrwxrwx"
puts "\nMARK accepted-ran"
sleep 0.8

# 4. level and off
send "wraith level quiet\r"
expect "level: quiet"
puts "\nMARK level"
sleep 0.8
send "wraith level chatty\r"
sleep 0.8
send "wraith off\r"
expect "the wraith sleeps"
puts "\nMARK off"
sleep 0.8
send "false\r"
sleep 0.8
set timeout 3
expect {
  -re {omen[^\r\n]*false} { puts "\nFAIL: whispered while off"; exit 1 }
  timeout { puts "\nMARK silent-off" }
}
set timeout 10
send "git clean -fdx\r"
expect "not a git repository"
puts "\nMARK gate-off"
sleep 0.8
send "exit\r"
expect eof
`;

test('the hook whispers, guards risky commands, obeys on/off, and writes no files', { skip: !available, timeout: 120000 }, () => {
  // Short paths: a long one wraps in the 80-column terminal and makes the script's matching unreliable.
  const home = fs.mkdtempSync('/tmp/wr-');
  const work = path.join(home, 'work');
  fs.mkdirSync(path.join(work, 'd'), { recursive: true });
  fs.writeFileSync(path.join(home, '.zshrc'), `PROMPT='%# '\nHISTFILE=/dev/null\nsource "${HOOK}"\n`);
  fs.writeFileSync(path.join(home, 'hook.exp'), EXPECT_SCRIPT);

  try {
    const result = spawnSync('expect', [path.join(home, 'hook.exp')], {
      encoding: 'utf8',
      timeout: 100000,
      killSignal: 'SIGKILL',
      env: {
        PATH: process.env.PATH,
        HOME: home,
        ZDOTDIR: home,
        WORKDIR: work,
        TERM: 'xterm',
        LANG: 'en_US.UTF-8',
        NO_COLOR: '1',
        WRAITH_LEVEL: 'chatty',
        OLLAMA_URL: 'http://127.0.0.1:9', // nothing listens here, so every whisper is an omen
      },
    });
    const transcript = (result.stdout || '').replace(/\x1b\[[0-9;?]*[a-zA-Z]/g, '').replace(/\r/g, '');
    const marks = [...transcript.matchAll(/^MARK (\S+)/gm)].map((m) => m[1]);
    const why = `\n--- stderr ---\n${result.stderr || ''}\n--- transcript ---\n${transcript.slice(-3000)}`;

    assert.doesNotMatch(transcript, /^FAIL: /m, why);
    assert.deepEqual(marks, ['whisper', 'gate', 'declined', 'shell-alive', 'accepted-ran', 'level', 'off', 'silent-off', 'gate-off'], why);

    // Wraith keeps nothing of its own: no folders or files appear in the home folder.
    const left = fs.readdirSync(home).filter((name) => !['.zshrc', 'hook.exp', 'work', '.zsh_sessions', '.zcompdump'].includes(name) && !name.startsWith('.zcompdump') && !name.startsWith('.zsh'));
    assert.deepEqual(left, [], 'unexpected files: ' + left.join(', '));
  } finally {
    fs.rmSync(home, { recursive: true, force: true });
  }
});

test('the hook steps aside when node or the wraith script cannot be found', { skip: !available }, () => {
  const result = spawnSync('zsh', ['-f', '-c', `WRAITH_FORCE=1 WRAITH_BIN=/nonexistent/wraith; source ${HOOK}; print "loaded=\${WRAITH_LOADED:-no}"; (( \${+functions[_wraith_precmd]} )) && print hook-present || print hook-absent`], { encoding: 'utf8' });
  assert.match(result.stderr, /the wraith stays asleep/);
  assert.match(result.stdout, /loaded=no/);
  assert.match(result.stdout, /hook-absent/);
});

test('a plain non-interactive shell loads nothing', { skip: !available }, () => {
  const result = spawnSync('zsh', ['-f', '-c', `source ${HOOK}; print "loaded=\${WRAITH_LOADED:-no}"`], { encoding: 'utf8' });
  assert.equal(result.stdout.trim(), 'loaded=no');
  assert.equal(result.stderr, '');
});

const CHAIN_SCRIPT = String.raw`
fconfigure stdout -buffering none
set timeout 10
spawn zsh -i
stty sane < $spawn_out(slave,name)
expect "% "
send "echo plain\r"
expect "plain"
puts "\nMARK ran"
sleep 0.5
send "git clean -fdx\r"
expect "Let it run"
sleep 0.7
send "n"
expect "it stays where it is"
puts "\nMARK gate-still-works"
sleep 0.5
send "\025"
sleep 0.5
send "exit\r"
expect eof
`;

test('an accept-line widget that was already there still runs, and the gate still works', { skip: !available, timeout: 60000 }, () => {
  const home = fs.mkdtempSync('/tmp/wr-');
  fs.writeFileSync(path.join(home, '.zshrc'), [
    "PROMPT='%# '",
    'HISTFILE=/dev/null',
    'my-accept() { print -r -- "[mine ran]"; zle .accept-line }',
    'zle -N accept-line my-accept',
    `source "${HOOK}"`,
    '',
  ].join('\n'));
  fs.writeFileSync(path.join(home, 'chain.exp'), CHAIN_SCRIPT);
  try {
    const result = spawnSync('expect', [path.join(home, 'chain.exp')], {
      encoding: 'utf8',
      timeout: 50000,
      killSignal: 'SIGKILL',
      cwd: home,
      env: { PATH: process.env.PATH, HOME: home, ZDOTDIR: home, TERM: 'xterm', LANG: 'en_US.UTF-8', NO_COLOR: '1', OLLAMA_URL: 'http://127.0.0.1:9' },
    });
    const transcript = (result.stdout || '').replace(/\x1b\[[0-9;?]*[a-zA-Z]/g, '').replace(/\r/g, '');
    assert.match(transcript, /\[mine ran\]/, transcript.slice(-1500));
    const marks = [...transcript.matchAll(/^MARK (\S+)/gm)].map((m) => m[1]);
    assert.deepEqual(marks, ['ran', 'gate-still-works'], transcript.slice(-1500));
  } finally {
    fs.rmSync(home, { recursive: true, force: true });
  }
});
