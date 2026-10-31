'use strict';

const { judge } = require('./rules');
const { gateOmen } = require('./omens');
const { createStyle, detect } = require('./style');
const { buildFacts } = require('./facts');
const { omenFor } = require('./omens');
const { echoFor } = require('./whisper');
const { shouldWhisper } = require('./policy');
const { health } = require('./ollama');
const { parseHistory, deadCommands } = require('./history');
const { renderAltar } = require('./altar');
const { epitaphFor } = require('./whisper');
const { epitaphOmen } = require('./omens');
const fun = require('./fun');
const anim = require('./fun-anim');
const readline = require('node:readline');
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const pkg = require('../package.json');

// Boolean flags take no value. Every other --flag takes the next word (or --flag=value).
const BOOLEAN_FLAGS = new Set(['force', 'type', 'json', 'help', 'version', 'verbose', 'no-model', 'list']);

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
    `  ${paint('bone', 'wraith ofrenda')}         an altar for the commands you stopped using (--history FILE, --no-model)`,
    `  ${paint('bone', 'wraith whisper')}         hear a whisper now (--force --exit 1 -- npm test)`,
    `  ${paint('bone', 'wraith gate')}            show the warning for a command (-- rm -rf ~)`,
    '',
    '',
    paint('marigold', 'For fun (no model, no network)'),
    `  ${paint('bone', 'wraith haunt')}           a random goofy horror picture (--scene NAME, --list, --seed N)`,
    `  ${paint('bone', 'wraith graveyard')}       tombstones with silly epitaphs`,
    `  ${paint('bone', 'wraith fortune')}         a spooky fortune cookie`,
    `  ${paint('bone', 'wraith say <words>')}     a ghost says it for you`,
    `  ${paint('bone', 'wraith boo')}             a ghost floats across your terminal`,
    `  ${paint('bone', 'wraith rain')}            a rain of spooky emoji (--seconds N)`,
    `  ${paint('bone', 'wraith spider')}          a spider lowers itself on a thread`,
    `  ${paint('bone', 'wraith ouija [question]')} ask the spirits (it asks you if you give none)`,
    `  ${paint('bone', 'wraith trick')}           trick or treat? press a key`,
    `  ${paint('bone', 'wraith surprise')}        the wraith picks for you`,
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

  // The command is shown as typed: it is already on this screen. Redaction is for the model, not for you.
  const shown = command.replace(/\s+/g, ' ').trim();
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

const HOOK_PATH = path.join(__dirname, '..', 'shell', 'wraith.zsh');

function zshVersion() {
  try {
    const result = spawnSync('zsh', ['--version'], { encoding: 'utf8', timeout: 2000 });
    const match = /zsh (\d+\.\d+(?:\.\d+)?)/.exec(result.stdout || '');
    return match ? match[1] : null;
  } catch (err) {
    return null;
  }
}

// Check the things Wraith needs, and say plainly what is missing.
async function doctor(args, io) {
  const { out, style, env } = io;
  const { paint } = style;
  const checkHealth = io.health || health;
  const nodeMajor = Number(process.versions.node.split('.')[0]);
  const zsh = (io.zshVersion || zshVersion)();
  const model = await checkHealth();

  const rows = [
    ['node', nodeMajor >= 22, `v${process.versions.node}${nodeMajor >= 22 ? '' : ' (22 or newer is needed)'}`],
    ['ollama', model.ok || model.status === 'model_missing', model.status === 'ollama_down' || model.status === 'not_loopback' || model.status === 'ollama_error' ? model.message : 'answering on this computer'],
    ['model', model.ok, model.ok ? model.message : model.status === 'model_missing' ? model.message : 'not checked yet'],
    ['zsh', Boolean(zsh), zsh ? `version ${zsh}` : 'zsh was not found on your PATH'],
  ];
  const hookLoaded = env.WRAITH_LOADED === '1';

  out.write(`${paint('violet', style.glyph.ghost)} ${paint('marigold', 'wraith doctor', { bold: true })}\n`);
  for (const [name, ok, detail] of rows) {
    const mark = ok ? paint('marigold', '✓') : paint('ember', '✗');
    out.write(`  ${mark} ${paint('bone', name.padEnd(7))} ${paint('ash', detail)}\n`);
  }
  const hookMark = hookLoaded ? paint('marigold', '✓') : paint('ash', style.glyph.dot);
  out.write(`  ${hookMark} ${paint('bone', 'hook'.padEnd(7))} ${paint('ash', hookLoaded ? 'loaded in this terminal' : 'not loaded in this terminal (see: wraith init)')}\n`);

  if (!model.ok) out.write(`\n  ${paint('ash', 'Without the model the wraith still speaks, using its hand-written omens.')}\n`);
  return rows.every(([, ok]) => ok) ? 0 : 1;
}

// The one line to add to ~/.zshrc. Wraith never edits your files.
function init(args, io) {
  const { out, style } = io;
  const { paint } = style;
  out.write(`${paint('ash', '# Add this line to ~/.zshrc, then open a new terminal.')}\n`);
  out.write(`${paint('bone', `source "${HOOK_PATH}"`)}\n`);
  return 0;
}

function zshrcPath(env) {
  return path.join(env.ZDOTDIR || env.HOME || '', '.zshrc');
}

// Find the lines that load Wraith, and say how to be rid of it.
function exorcise(args, io) {
  const { out, style, env } = io;
  const { paint } = style;
  const file = zshrcPath(env);
  let lines = [];
  try {
    lines = fs.readFileSync(file, 'utf8').split('\n');
  } catch (err) {
    // No .zshrc: nothing to find.
  }
  const found = lines.map((text, i) => ({ text, number: i + 1 })).filter((l) => /wraith\.zsh/.test(l.text));

  out.write(`${paint('violet', style.glyph.ghost)} ${paint('marigold', 'exorcise', { bold: true })}\n`);
  if (found.length) {
    out.write(`  Remove ${found.length === 1 ? 'this line' : 'these lines'} from ${file}:\n`);
    for (const l of found) out.write(`    ${paint('bone', `line ${l.number}:`)} ${paint('ash', l.text.trim())}\n`);
  } else {
    out.write(`  ${paint('ash', `No line mentioning wraith.zsh was found in ${file}.`)}\n`);
  }
  out.write(`  Then open a new terminal. To silence it in this one right now: ${paint('bone', 'wraith off')}\n`);
  out.write(`  ${paint('ash', 'Wraith keeps no files of its own, so there is nothing else to delete.')}\n`);
  return 0;
}

// Light a candle for each command you used often and then stopped using.
async function ofrenda(args, io) {
  const { out, err, style, env } = io;
  const { flags } = args;
  const file = flags.history || env.HISTFILE || path.join(env.ZDOTDIR || env.HOME || '', '.zsh_history');

  let raw;
  try {
    raw = fs.readFileSync(file);
  } catch (error) {
    err.write(`wraith: I could not read a history file at ${file}.\nGive me one with: wraith ofrenda --history FILE\n`);
    return 1;
  }

  const options = { now: io.now ? io.now() : Date.now() };
  if (flags.min) options.minUses = Number(flags.min) || 5;
  if (flags.days) options.quietDays = Number(flags.days) || 90;
  if (flags.limit) options.limit = Number(flags.limit) || 6;
  const found = deadCommands(parseHistory(raw), options);

  // Gemma writes each epitaph, checked like any whisper. One failure of the model itself ends the asking.
  const ask = io.epitaph || epitaphFor;
  let modelAway = Boolean(flags['no-model']);
  if (!modelAway && found.dead.length && err.isTTY) err.write(`  ${style.glyph.ghost} lighting ${found.dead.length} candles. Gemma writes each line, about 3 seconds apiece...\n`);

  const entries = [];
  for (const dead of found.dead) {
    let epitaph = null;
    if (!modelAway) {
      // Someone asked for this, so it may wait for a cold model to load (about 10 seconds), unlike a whisper.
      const result = await ask(dead, { timeoutMs: Number(env.WRAITH_TIMEOUT_MS) || 30000 });
      if (result.text) epitaph = { text: result.text, source: 'echo' };
      else if (['TIMEOUT', 'OLLAMA_DOWN', 'NOT_LOOPBACK', 'OLLAMA_ERROR'].includes(result.reason)) modelAway = true;
    }
    // The position picks the hand-written line, so neighbouring cards do not repeat each other.
    entries.push({ ...dead, epitaph: epitaph || { text: epitaphOmen(dead, entries.length), source: 'omen' } });
  }

  out.write(`${renderAltar({ entries, total: found.total, dated: found.dated }, style)}\n`);
  return 0;
}

const FUN_COMMANDS = new Set(['haunt', 'graveyard', 'fortune', 'say', 'boo', 'rain', 'spider', 'ouija', 'trick', 'surprise']);

// The silly commands. They need no model and no network.
async function funCommand(name, args, io) {
  const { out, style } = io;
  const seeded = args.flags.seed !== undefined ? fun.seeded(Number(args.flags.seed) || 0) : null;
  const random = seeded || io.random;
  const sleep = io.sleep || (async () => {});
  const columns = style.columns;
  const base = { stream: out, style, random, sleep, columns };
  const words = args.args.join(' ') || args.rest.join(' ');

  switch (name) {
    case 'haunt': {
      if (args.flags.list) {
        out.write(`${fun.SCENE_NAMES.join('\n')}\n`);
        return 0;
      }
      const { text } = fun.haunt(random, style, { scene: args.flags.scene, width: Math.min(64, columns) });
      out.write(`${text}\n`);
      return 0;
    }
    case 'graveyard':
      out.write(`${fun.haunt(random, style, { scene: 'graveyard', width: Math.min(64, columns) }).text}\n`);
      return 0;
    case 'fortune':
      out.write(`${fun.fortune(random, style)}\n`);
      return 0;
    case 'say':
      out.write(`${fun.say(words, random, style)}\n`);
      return 0;
    case 'boo':
      await anim.boo(base);
      return 0;
    case 'rain':
      await anim.rain({ ...base, seconds: Math.min(30, Number(args.flags.seconds) || 4) });
      return 0;
    case 'spider':
      await anim.spider(base);
      return 0;
    case 'ouija': {
      let question = words;
      if (!question && io.ask) question = (await io.ask(`  ${style.glyph.ghost} ask the spirits a question: `)).trim();
      await anim.ouija({ ...base, question });
      return 0;
    }
    case 'trick': {
      const key = io.askKey ? await io.askKey(`  ${style.paint('marigold', 'Trick or treat?')} ${style.paint('ash', '(t = trick, anything else = treat)')} `) : 'r';
      const choice = String(key).toLowerCase() === 't' ? 'trick' : 'treat';
      const result = fun.treatOrTrick(choice, random);
      out.write(`\n  you chose ${choice}.${result.flipped ? ` ${style.paint('violet', 'the wraith laughs and changes its mind.')}` : ''}\n\n`);
      if (result.outcome === 'trick') await anim.boo(base);
      out.write(`  ${result.text}\n`);
      return 0;
    }
    default: {
      // surprise: the wraith picks.
      const choice = fun.pick(['haunt', 'fortune', 'boo', 'spider', 'graveyard', 'rain'], random);
      out.write(`${style.paint('ash', `  ${style.glyph.ghost} the wraith chose: ${choice}`)}\n\n`);
      return funCommand(choice, { ...args, flags: { ...args.flags, seconds: 2 } }, io);
    }
  }
}

// Ask a question on the terminal and read one line.
function askLine(prompt) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    rl.question(prompt, (answer) => {
      rl.close();
      resolve(answer);
    });
    rl.on('close', () => resolve(''));
  });
}

// Read one key press with no Enter. Without a terminal, read a line instead.
function askKey(prompt) {
  if (!process.stdin.isTTY) return askLine(prompt).then((line) => line.trim()[0] || '');
  return new Promise((resolve) => {
    process.stdout.write(prompt);
    process.stdin.setRawMode(true);
    process.stdin.resume();
    process.stdin.once('data', (data) => {
      process.stdin.setRawMode(false);
      process.stdin.pause();
      const key = data.toString()[0];
      if (key === '\u0003') process.exit(130); // Ctrl-C
      resolve(key);
    });
  });
}

function defaultIo() {
  return {
    out: process.stdout,
    err: process.stderr,
    env: process.env,
    style: createStyle(detect(process.env, process.stdout)),
    random: Math.random,
    sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
    ask: askLine,
    askKey,
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

    case 'doctor':
      return doctor(args, io);

    case 'ofrenda':
      return ofrenda(args, io);

    case 'init':
      return init(args, io);

    case 'exorcise':
      return exorcise(args, io);

    case 'judge': {
      const risk = judge(args.rest.join(' '));
      if (args.flags.json) out.write(`${JSON.stringify({ risk })}\n`);
      else out.write(risk ? `${risk.level}: ${risk.id}: ${risk.reason}\n` : 'fine\n');
      return risk ? 0 : 1;
    }

    default:
      if (FUN_COMMANDS.has(args.command)) return funCommand(args.command, args, io);
      err.write(`wraith: I do not know "${args.command}". Try: wraith help\n`);
      return 2;
  }
}

module.exports = { main, parseArgs, gateCard, helpText, whisper, doctor, init, exorcise, ofrenda, HOOK_PATH };
