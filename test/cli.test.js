'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { main, parseArgs, gateCard } = require('../lib/cli');
const { createStyle, visibleLength } = require('../lib/style');

const plain = createStyle({ color: false, columns: 80 });

// Run the CLI with captured output.
async function run(argv, extra = {}) {
  let out = '';
  let err = '';
  const io = {
    out: { write: (text) => (out += text), isTTY: false },
    err: { write: (text) => (err += text) },
    env: {},
    style: plain,
    random: () => 0,
    ...extra,
  };
  const code = await main(argv, io);
  return { code, out, err };
}

test('arguments are split into command, flags and the command line after --', () => {
  const args = parseArgs(['whisper', '--exit', '1', '--seconds=4', '--force', '--', 'npm', 'test', '--watch']);
  assert.equal(args.command, 'whisper');
  assert.deepEqual(args.flags, { exit: '1', seconds: '4', force: true });
  assert.deepEqual(args.rest, ['npm', 'test', '--watch']);
});

test('a flag with no value is a switch', () => {
  assert.deepEqual(parseArgs(['doctor', '--json']).flags, { json: true });
  assert.deepEqual(parseArgs(['x', '--level']).flags, { level: true });
});

test('help is the default and --version prints the version', async () => {
  const help = await run([]);
  assert.equal(help.code, 0);
  assert.match(help.out, /wraith/);
  assert.match(help.out, /wraith doctor/);
  const version = await run(['--version']);
  assert.match(version.out, /^\d+\.\d+\.\d+\n$/);
});

test('an unknown command says so and exits 2', async () => {
  const result = await run(['summon']);
  assert.equal(result.code, 2);
  assert.match(result.err, /do not know "summon"/);
});

test('gate prints a card and exits 0 for a risky command, and stays silent with 1 for a fine one', async () => {
  const risky = await run(['gate', '--', 'rm -rf /']);
  assert.equal(risky.code, 0);
  assert.match(risky.out, /the wraith bars the door/);
  assert.match(risky.out, /rm -rf \//);

  const fine = await run(['gate', '--', 'ls -la']);
  assert.equal(fine.code, 1);
  assert.equal(fine.out, '');
});

test('the card says "stirs" for a caution and "bars the door" for a danger', () => {
  assert.match(gateCard('git reset --hard', plain), /the wraith stirs/);
  assert.match(gateCard('rm -rf /', plain), /the wraith bars the door/);
  assert.equal(gateCard('git status', plain), null);
});

test('the card shows the command as typed, and its box stays one width', () => {
  const card = gateCard('rm -rf /   some/path', plain);
  assert.match(card, /rm -rf \/ some\/path/);
  const widths = new Set(card.split('\n').map(visibleLength));
  assert.equal(widths.size, 1);
});

test('a long command and a very long path are wrapped inside the card', () => {
  const card = gateCard('rm -rf / ' + '/very/long/' + 'x'.repeat(120) + ' ' + 'word '.repeat(30), createStyle({ color: false, columns: 60 }));
  for (const line of card.split('\n')) assert.ok(visibleLength(line) <= 60, line);
});

test('judge prints the verdict and uses the exit code', async () => {
  const risky = await run(['judge', '--', 'git push --force origin main']);
  assert.equal(risky.code, 0);
  assert.match(risky.out, /^danger: git-force-push-shared/);
  const fine = await run(['judge', '--', 'git status']);
  assert.equal(fine.code, 1);
  assert.equal(fine.out, 'fine\n');
  const json = await run(['judge', '--json', '--', 'git reset --hard']);
  assert.equal(JSON.parse(json.out).risk.id, 'git-reset-hard');
});

test('whisper --mode omen prints a hand-written line for the event, with its source', async () => {
  const result = await run(['whisper', '--mode', 'omen', '--force', '--exit', '127', '--', 'nodee -v']);
  assert.equal(result.code, 0);
  assert.match(result.out, /^  ☾ .*nodee.* · omen · nodee\n$/);
});

test('whisper uses the model line when it has one, and says it is an echo', async () => {
  const echo = async () => ({ text: 'Fog settles on the prompt.', reason: null, detail: [] });
  const result = await run(['whisper', '--force', '--exit', '1', '--', 'npm test'], { echo });
  assert.equal(result.out, '  ☾ Fog settles on the prompt. · echo · npm\n');
});

test('whisper falls back to an omen when the model gives nothing', async () => {
  const echo = async () => ({ text: null, reason: 'TIMEOUT', detail: [] });
  const result = await run(['whisper', '--force', '--exit', '1', '--', 'npm test'], { echo });
  assert.match(result.out, / · omen · npm\n$/);
});

test('whisper --mode echo stays silent when the model gives nothing', async () => {
  const echo = async () => ({ text: null, reason: 'OLLAMA_DOWN', detail: [] });
  const result = await run(['whisper', '--mode', 'echo', '--force', '--exit', '1', '--', 'npm test'], { echo });
  assert.equal(result.out, '');
});

test('--verbose tells you why the model gave nothing', async () => {
  const echo = async () => ({ text: null, reason: 'UNGROUNDED', detail: ['numbers: 9'] });
  const result = await run(['whisper', '--verbose', '--force', '--exit', '1', '--', 'npm test'], { echo });
  assert.match(result.err, /UNGROUNDED: numbers: 9/);
});

test('without --force the policy decides: a quiet level stays silent about a plain failure', async () => {
  const echo = async () => {
    throw new Error('the model should not be asked');
  };
  const result = await run(['whisper', '--level', 'quiet', '--exit', '1', '--', 'npm test'], { echo });
  assert.equal(result.out, '');
});

test('a repeated failure is always whispered about, even when quiet', async () => {
  const echo = async () => ({ text: null, reason: 'TIMEOUT', detail: [] });
  const result = await run(['whisper', '--level', 'quiet', '--exit', '1', '--streak', '4', '--', 'npm test'], { echo });
  assert.match(result.out, /4/);
});

test('the command line given to whisper is hidden of secrets before the model sees it', async () => {
  let seen = '';
  const echo = async (facts) => {
    seen = facts.command;
    return { text: null, reason: 'TIMEOUT', detail: [] };
  };
  await run(['whisper', '--force', '--exit', '1', '--', 'API_KEY=abc123xyz node app.js'], { echo });
  assert.equal(seen, 'API_KEY=[hidden] node app.js');
});

test('doctor says what is ready and exits 0 when everything is', async () => {
  const ready = async () => ({ ok: true, status: 'ready', message: 'gemma3:4b is ready at http://127.0.0.1:11434' });
  const result = await run(['doctor'], { health: ready, zshVersion: () => '5.9', env: { WRAITH_LOADED: '1' } });
  assert.equal(result.code, 0);
  assert.match(result.out, /✓ model\s+gemma3:4b is ready/);
  assert.match(result.out, /✓ zsh\s+version 5.9/);
  assert.match(result.out, /✓ hook\s+loaded in this terminal/);
});

test('doctor names the fix when the model is missing, and exits 1', async () => {
  const missing = async () => ({ ok: false, status: 'model_missing', message: 'The model gemma3:4b is not installed. Run: ollama pull gemma3:4b' });
  const result = await run(['doctor'], { health: missing, zshVersion: () => '5.9' });
  assert.equal(result.code, 1);
  assert.match(result.out, /ollama pull gemma3:4b/);
  assert.match(result.out, /still speaks, using its hand-written omens/);
  assert.match(result.out, /not loaded in this terminal/);
});

test('doctor says when Ollama is not running', async () => {
  const down = async () => ({ ok: false, status: 'ollama_down', message: 'Ollama is not answering. Open the Ollama app or run: ollama serve' });
  const result = await run(['doctor'], { health: down, zshVersion: () => null });
  assert.equal(result.code, 1);
  assert.match(result.out, /✗ ollama\s+Ollama is not answering/);
  assert.match(result.out, /✗ zsh\s+zsh was not found/);
});

test('init prints a single source line pointing at the hook, and edits nothing', async () => {
  const { HOOK_PATH } = require('../lib/cli');
  const result = await run(['init']);
  assert.match(result.out, new RegExp(`source "${HOOK_PATH.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}"`));
  assert.match(result.out, /~\/\.zshrc/);
});

test('exorcise finds the lines that load wraith and does not touch the file', async () => {
  const fs = require('node:fs');
  const os = require('node:os');
  const path = require('node:path');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wraith-test-'));
  const rc = path.join(dir, '.zshrc');
  const original = 'export A=1\nsource "/x/wraith/shell/wraith.zsh"\nalias ll="ls -l"\n';
  fs.writeFileSync(rc, original);
  try {
    const result = await run(['exorcise'], { env: { ZDOTDIR: dir } });
    assert.match(result.out, /line 2:.*wraith\.zsh/);
    assert.match(result.out, /nothing else to delete/);
    assert.equal(fs.readFileSync(rc, 'utf8'), original);

    const none = await run(['exorcise'], { env: { ZDOTDIR: path.join(dir, 'missing') } });
    assert.match(none.out, /No line mentioning wraith\.zsh/);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

const DEMO = require('node:path').join(__dirname, '..', 'demo', 'history');
const DEMO_NOW = Date.UTC(2026, 9, 31);

test('ofrenda lists the dead commands in the demo history, most used first', async () => {
  const epitaph = async (entry) => ({ text: `${entry.name} kept the lantern lit.`, reason: null, detail: [] });
  const result = await run(['ofrenda', '--history', DEMO], { epitaph, now: () => DEMO_NOW });
  assert.equal(result.code, 0);
  const names = [...result.out.matchAll(/╭─ (\S+) /g)].map((m) => m[1]);
  assert.deepEqual(names, ['gulp', 'python2', 'grunt', 'bower', 'heroku']);
  assert.match(result.out, /used 14 times · quiet for 516 days/);
  assert.match(result.out, /gulp kept the lantern lit\./);
  assert.match(result.out, /5 remembered, from 425 commands/);
});

test('ofrenda --no-model uses hand-written epitaphs and never asks the model', async () => {
  const epitaph = async () => {
    throw new Error('the model should not be asked');
  };
  const result = await run(['ofrenda', '--history', DEMO, '--no-model'], { epitaph, now: () => DEMO_NOW });
  assert.equal(result.code, 0);
  assert.match(result.out, /· omen/);
  assert.doesNotMatch(result.out, /· echo/);
});

test('ofrenda stops asking the model after it fails to answer, and still draws every card', async () => {
  let asked = 0;
  const epitaph = async () => {
    asked++;
    return { text: null, reason: 'TIMEOUT', detail: [] };
  };
  const result = await run(['ofrenda', '--history', DEMO], { epitaph, now: () => DEMO_NOW });
  assert.equal(asked, 1);
  assert.equal([...result.out.matchAll(/╭─ /g)].length, 5);
});

test('an epitaph the check rejects falls back for that card only', async () => {
  const epitaph = async (entry) => (entry.name === 'gulp'
    ? { text: null, reason: 'UNGROUNDED', detail: ['numbers: 12'] }
    : { text: `${entry.name} was here.`, reason: null, detail: [] });
  const result = await run(['ofrenda', '--history', DEMO], { epitaph, now: () => DEMO_NOW });
  assert.match(result.out, /python2 was here\./);
  const { epitaphOmen } = require('../lib/omens');
  assert.ok(result.out.includes(epitaphOmen({ name: 'gulp', uses: 14 })));
  assert.match(result.out, /· omen/);
});

test('ofrenda says what to do when there is no history file', async () => {
  const result = await run(['ofrenda', '--history', '/nonexistent/history']);
  assert.equal(result.code, 1);
  assert.match(result.err, /could not read a history file/);
  assert.match(result.err, /--history FILE/);
});

test('ofrenda reads only command names, so no secret from the history reaches the model', async () => {
  const fs = require('node:fs');
  const os = require('node:os');
  const dir = fs.mkdtempSync(require('node:path').join(os.tmpdir(), 'wraith-hist-'));
  const file = require('node:path').join(dir, 'history');
  const lines = [];
  for (let i = 0; i < 6; i++) lines.push(`: ${1700000000 + i}:0;curl -u admin:hunter2 https://example.com/${i}`);
  for (let i = 0; i < 30; i++) lines.push(`: ${1760000000 + i}:0;npm test`);
  fs.writeFileSync(file, lines.join('\n') + '\n');
  const seen = [];
  const epitaph = async (entry) => {
    seen.push(JSON.stringify(entry));
    return { text: null, reason: 'TIMEOUT', detail: [] };
  };
  try {
    await run(['ofrenda', '--history', file], { epitaph, now: () => 1760100000 * 1000 });
    assert.equal(seen.length, 1);
    assert.doesNotMatch(seen[0], /hunter2|admin|example\.com/);
    assert.match(seen[0], /"name":"curl"/);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
