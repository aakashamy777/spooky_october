'use strict';

const { redact } = require('./redact');
const { judge } = require('./rules');
const { gateOmen } = require('./omens');
const { createStyle, detect } = require('./style');
const { buildFacts } = require('./facts');
const { omenFor } = require('./omens');
const { echoFor } = require('./whisper');
const { shouldWhisper } = require('./policy');
const pkg = require('../package.json');

// Boolean flags take no value. Every other --flag takes the next word (or --flag=value).
const BOOLEAN_FLAGS = new Set(['force', 'type', 'json', 'help', 'version', 'verbose']);

// "wraith whisper --exit 1 -- npm test" -> { command: 'whisper', flags: { exit: '1' }, rest: ['npm', 'test'] }
function parseArgs(argv) {
  const flags = {};
  const positional = [];
  let rest = [];
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--') {
      rest = argv.slice(i + 1);
      break;
    }
    if (arg.startsWith('--')) {
      const [name, inline] = arg.slice(2).split(/=(.*)/s);
      if (inline !== undefined) flags[name] = inline;
      else if (BOOLEAN_FLAGS.has(name) || i + 1 >= argv.length || argv[i + 1].startsWith('--')) flags[name] = true;
      else flags[name] = argv[++i];
    } else {
      positional.push(arg);
    }
  }
  return { command: positional[0] || '', args: positional.slice(1), flags, rest };
}

function helpText(style) {
  const { paint } = style;
  return [
    `${paint('violet', style.glyph.ghost)} ${paint('marigold', 'wraith', { bold: true })} ${paint('ash', `v${pkg.version}`)}`,
    paint('ash', 'A ghost that possesses your zsh. It runs on your own computer: nothing is uploaded.'),
    '',
    paint('marigold', 'In your shell'),
    `  ${paint('bone', 'wraith on | off')}        wake or silence the wraith in this terminal`,
    `  ${paint('bone', 'wraith level <l>')}       quiet, normal or chatty`,
    '',
    paint('marigold', 'Anywhere'),
    `  ${paint('bone', 'wraith init')}            print the one line to add to ~/.zshrc`,
    `  ${paint('bone', 'wraith exorcise')}        show what to remove to be rid of it`,
    `  ${paint('bone', 'wraith doctor')}          check the model, the shell and the hook`,
    `  ${paint('bone', 'wraith ofrenda')}         an altar for the commands you stopped using`,
    `  ${paint('bone', 'wraith whisper')}         hear a whisper now (--force --exit 1 -- npm test)`,
    `  ${paint('bone', 'wraith gate')}            show the warning for a command (-- rm -rf ~)`,
    '',
    paint('ash', 'Settings: WRAITH_LEVEL, WRAITH_MODEL, WRAITH_KEEP_ALIVE, OLLAMA_URL (must be this computer), NO_COLOR.'),
  ].join('\n');
}

// The card shown before a risky command runs. Returns text, or null if the command looks fine.
function gateCard(command, style) {
  const risk = judge(command);
  if (!risk) return null;

  const { paint } = style;
  const tone = risk.level === 'danger' ? 'ember' : 'marigold';
  const title = risk.level === 'danger' ? 'the wraith bars the door' : 'the wraith stirs';
  const width = Math.min(62, style.columns - 2);
  const inner = Math.max(20, width - 4);

  const shown = redact(command).text.replace(/\s+/g, ' ');
  const lines = [
    ...style.wrap(shown, inner).map((line) => paint('bone', line, { bold: true })),
    '',
    ...style.wrap(risk.reason, inner).map((line) => paint('ash', line)),
    '',
    `${paint('violet', style.glyph.ghost)} ${paint('violet', gateOmen(command), { italic: true })}`,
  ];
  return style.box(lines, { title: paint(tone, title, { bold: true }), width, tone });
}

// Say something about a command that just ran.
//   --mode auto (default): ask Gemma, and fall back to a hand-written omen
//   --mode omen: omen only, no model.   --mode echo: Gemma only, silent if it cannot
// The shell hook runs this in the background and prints whatever comes out, so it must be one line at most.
async function whisper(args, io) {
  const { out, err, style, env } = io;
  const { flags } = args;
  const event = {
    command: args.rest.join(' '),
    exit: flags.exit,
    seconds: flags.seconds,
    streak: flags.streak,
    cwd: flags.cwd,
    hour: flags.hour === undefined ? undefined : Number(flags.hour),
  };
  const facts = buildFacts(event);
  const level = flags.level || env.WRAITH_LEVEL;

  if (!flags.force && !shouldWhisper(facts, level, io.random())) return 0;

  const mode = ['omen', 'echo'].includes(flags.mode) ? flags.mode : 'auto';
  let text = null;
  let source = 'omen';

  if (mode !== 'omen') {
    const timeoutMs = Number(env.WRAITH_TIMEOUT_MS) || 8000;
    const echo = await (io.echo || echoFor)(facts, { timeoutMs });
    if (echo.text) {
      text = echo.text;
      source = 'echo';
    } else if (flags.verbose) {
      err.write(`wraith: the model gave nothing (${echo.reason}${echo.detail && echo.detail.length ? `: ${echo.detail.join(' | ')}` : ''})\n`);
    }
  }

  if (!text) {
    if (mode === 'echo') return 0;
    text = omenFor(facts);
  }

  const line = style.whisperLine(text, `${source} ${style.glyph.dot} ${facts.name}`);
  if (flags.type) await style.typewrite(out, `${line}\n`, { maxMs: 700 });
  else out.write(`${line}\n`);
  return 0;
}

function defaultIo() {
  return {
    out: process.stdout,
    err: process.stderr,
    env: process.env,
    style: createStyle(detect(process.env, process.stdout)),
    random: Math.random,
  };
}

async function main(argv, io = defaultIo()) {
  const args = parseArgs(argv);
  const { out, err, style } = io;

  if (args.flags.version || args.command === 'version') {
    out.write(`${pkg.version}\n`);
    return 0;
  }

  switch (args.command) {
    case '':
    case 'help':
      out.write(`${helpText(style)}\n`);
      return 0;

    case 'gate': {
      // Used by the shell hook: prints the warning card and exits 0 if the command is risky, 1 if it is fine.
      const card = gateCard(args.rest.join(' '), style);
      if (!card) return 1;
      out.write(`${card}\n`);
      return 0;
    }

    case 'whisper':
      return whisper(args, io);

    case 'judge': {
      const risk = judge(args.rest.join(' '));
      if (args.flags.json) out.write(`${JSON.stringify({ risk })}\n`);
      else out.write(risk ? `${risk.level}: ${risk.id}: ${risk.reason}\n` : 'fine\n');
      return risk ? 0 : 1;
    }

    default:
      err.write(`wraith: I do not know "${args.command}". Try: wraith help\n`);
      return 2;
  }
}

module.exports = { main, parseArgs, gateCard, helpText, whisper };
