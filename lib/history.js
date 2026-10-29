'use strict';

// Read a zsh history file and find the commands you used to run and no longer do.
// Only the program name (and a subcommand for tools like git) is kept, never arguments, so no secrets are read out.

const { redact } = require('./redact');

// Tools whose second word says what you were really doing: "git push", "docker compose".
const MULTI_WORD = new Set(['git', 'npm', 'yarn', 'pnpm', 'docker', 'cargo', 'kubectl', 'brew', 'pip', 'pip3', 'make', 'go', 'gh', 'bundle', 'rails', 'terraform']);

// Commands so basic that they are never really "gone".
const EVERYDAY = new Set(['cd', 'ls', 'clear', 'exit', 'pwd', 'echo', 'cat', 'history', 'which', 'man', 'open', 'wraith', 'sudo']);

// zsh stores bytes above 0x7f as 0x83 followed by the byte xor 32. Undo that so UTF-8 reads properly.
function unmetafy(buffer) {
  const bytes = [];
  for (let i = 0; i < buffer.length; i++) {
    if (buffer[i] === 0x83 && i + 1 < buffer.length) bytes.push(buffer[++i] ^ 32);
    else bytes.push(buffer[i]);
  }
  return Buffer.from(bytes).toString('utf8');
}

// Lines look like ": 1700000000:0;git status" (with EXTENDED_HISTORY) or just "git status".
// A command that runs over several lines ends each line but the last with a backslash.
function parseHistory(input) {
  const text = Buffer.isBuffer(input) ? unmetafy(input) : String(input);
  const entries = [];
  let pending = null;

  for (const line of text.split('\n')) {
    if (pending !== null) {
      pending.command += `\n${line}`;
      if (!line.endsWith('\\')) {
        entries.push(pending);
        pending = null;
      }
      continue;
    }
    if (!line.trim()) continue;

    const match = /^: (\d+):\d+;(.*)$/.exec(line);
    const entry = match ? { ts: Number(match[1]) * 1000, command: match[2] } : { ts: null, command: line };
    if (entry.command.endsWith('\\')) pending = entry;
    else entries.push(entry);
  }
  if (pending) entries.push(pending);
  return entries;
}

// "git push --force origin main" -> "git push".  "FOO=1 npm test" -> "npm test".
function keyOf(command) {
  const words = String(command).trim().split(/\s+/).filter((w) => !/^[A-Za-z_][A-Za-z0-9_]*=/.test(w));
  while (words.length && ['sudo', 'doas', 'time', 'nohup', 'env'].includes(words[0])) words.shift();
  if (!words.length) return null;

  const program = words[0].split('/').pop();
  if (!/^[A-Za-z0-9._+-]+$/.test(program) || program.length > 40) return null;

  const second = words[1];
  if (MULTI_WORD.has(program) && second && /^[a-z][a-z0-9-]{1,20}$/.test(second)) return `${program} ${second}`;
  return program;
}

// Commands used at least `minUses` times that have gone quiet.
// With timestamps, quiet means not used for `quietDays`. Without them (the zsh default), quiet means
// not used in the most recent `recentShare` of your history.
function deadCommands(entries, { now = Date.now(), minUses = 5, quietDays = 90, recentShare = 0.4, limit = 6 } = {}) {
  const stats = new Map();
  entries.forEach((entry, index) => {
    const key = keyOf(entry.command);
    if (!key) return;
    const found = stats.get(key) || { key, uses: 0, firstIndex: index, firstTs: entry.ts, lastIndex: index, lastTs: entry.ts };
    found.uses += 1;
    found.lastIndex = index;
    found.lastTs = entry.ts;
    stats.set(key, found);
  });

  const total = entries.length;
  const dated = entries.some((e) => e.ts !== null);
  const cutoffIndex = Math.floor(total * (1 - recentShare));
  const cutoffTime = now - quietDays * 86400000;

  const dead = [];
  for (const stat of stats.values()) {
    if (stat.uses < minUses || EVERYDAY.has(stat.key.split(' ')[0])) continue;
    const gone = dated && stat.lastTs !== null ? stat.lastTs < cutoffTime : stat.lastIndex < cutoffIndex;
    if (!gone) continue;

    const quietFor = dated && stat.lastTs !== null
      ? { days: Math.floor((now - stat.lastTs) / 86400000) }
      : { commands: total - 1 - stat.lastIndex };
    dead.push({ name: redact(stat.key).text, uses: stat.uses, quietFor, firstTs: stat.firstTs, lastTs: stat.lastTs });
  }

  dead.sort((a, b) => b.uses - a.uses || a.name.localeCompare(b.name));
  return { dead: dead.slice(0, limit), total, dated, distinct: stats.size };
}

module.exports = { parseHistory, deadCommands, keyOf, unmetafy, MULTI_WORD };
