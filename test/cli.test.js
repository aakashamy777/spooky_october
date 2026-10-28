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
