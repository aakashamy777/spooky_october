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

test('the card never shows a secret, and its box stays one width', () => {
  const card = gateCard('API_KEY=abc123xyz rm -rf /', plain);
  assert.doesNotMatch(card, /abc123xyz/);
  assert.match(card, /API_KEY=\[hidden\]/);
  const widths = new Set(card.split('\n').map(visibleLength));
  assert.equal(widths.size, 1);
});

test('a long command is wrapped inside the card', () => {
  const card = gateCard('rm -rf / ' + 'x'.repeat(10) + ' ' + 'word '.repeat(30), createStyle({ color: false, columns: 60 }));
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
