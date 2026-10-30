'use strict';

// Everything the wraith "knows" about a command is worked out here, in code.
// The model is only handed these facts. It is never asked to guess any of them.

const { redact } = require('./redact');
const { judge, segments, describe } = require('./rules');

// Programs that exit with 1 to give an answer, not to report a failure: grep found nothing, diff found a difference.
const ANSWERS_WITH_ONE = new Set(['grep', 'egrep', 'fgrep', 'rg', 'ag', 'ack', 'diff', 'cmp', 'test', '[', '[[', 'which', 'whence', 'type', 'pgrep', 'comm']);

// Programs you sit in on purpose. A long session in one is not a slow command.
const INTERACTIVE = new Set(['vim', 'nvim', 'vi', 'view', 'nano', 'emacs', 'less', 'more', 'man', 'top', 'htop', 'btop', 'ssh', 'mosh', 'tmux', 'screen', 'watch', 'fzf', 'tig', 'lazygit']);

const MAX_COMMAND_CHARS = 120;
const SLOW_SECONDS = 30;
const INTERRUPTED = 130; // Ctrl-C

function partOfDay(hour) {
  if (hour < 5) return 'deep night';
  if (hour < 8) return 'dawn';
  if (hour < 18) return 'day';
  if (hour < 22) return 'evening';
  return 'night';
}

// The name of the program: "npm" for "FOO=1 sudo npm test".
function programName(command) {
  const first = segments(command)[0];
  const name = first ? describe(first).name : '';
  return name || String(command).trim().split(/\s+/)[0] || 'it';
}

function toCount(value) {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
}

// event: { command, exit, seconds, streak, cwd, hour }. All values come from the shell hook as text.
function buildFacts(event, { now = new Date() } = {}) {
  const original = String(event.command || '');
  const safe = redact(original);
  const name = programName(safe.text);
  const exit = ANSWERS_WITH_ONE.has(name) && toCount(event.exit) === 1 ? 0 : toCount(event.exit);
  const seconds = INTERACTIVE.has(name) ? 0 : toCount(event.seconds);
  const streak = toCount(event.streak);
  const hour = Number.isInteger(event.hour) ? event.hour : now.getHours();
  const risk = judge(original);

  const facts = {
    command: safe.text.slice(0, MAX_COMMAND_CHARS),
    name,
    exit,
    seconds,
    streak: exit !== 0 && exit !== INTERRUPTED ? Math.max(streak, 1) : 0,
    cwd: String(event.cwd || '').split('/').filter(Boolean).pop() || '',
    hour,
    part: partOfDay(hour),
    hidden: safe.hidden,
    risk: risk ? { id: risk.id, level: risk.level } : null,
  };
  facts.situation = situationOf(facts);
  return facts;
}

// The most notable thing about this command. Earlier entries win.
function situationOf(facts) {
  if (facts.risk) return 'risky-ran';
  if (facts.exit === INTERRUPTED) return 'interrupted';
  if (facts.exit !== 0 && facts.streak >= 3) return 'failed-repeat';
  if (facts.exit !== 0) return 'failed';
  if (facts.seconds >= SLOW_SECONDS) return 'slow';
  if (facts.hour < 5) return 'late';
  return 'quiet';
}

// The facts as plain lines for the model prompt. Only true, computed things appear here.
function factsText(facts) {
  const lines = [`Command: ${facts.command}`];
  lines.push(facts.exit === 0 ? 'Result: it worked.' : `Result: it failed with exit code ${facts.exit}.`);
  if (facts.seconds > 0) lines.push(`It ran for ${facts.seconds} seconds.`);
  if (facts.streak >= 2) lines.push(`The same command has failed ${facts.streak} times in a row.`);
  if (facts.risk) lines.push('This command can destroy data.');
  lines.push(`Time of day: ${facts.part}.`);
  return lines.join('\n');
}

module.exports = { buildFacts, situationOf, factsText, partOfDay, programName, SLOW_SECONDS, ANSWERS_WITH_ONE, INTERACTIVE };
