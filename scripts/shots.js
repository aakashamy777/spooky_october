'use strict';

// Render the real output of Wraith commands as PNG pictures for the docs (macOS with Google Chrome).
//   node scripts/shots.js
// These are not photos of a terminal window. Each picture is the text the command printed, drawn
// with its colours, so what you see is exactly what the program wrote. Whisper lines come from the live model.

const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { spawnSync } = require('node:child_process');

const ROOT = path.join(__dirname, '..');
const OUT = path.join(ROOT, 'docs');
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const BIN = path.join(ROOT, 'bin', 'wraith');

// ---- ANSI to HTML ----
function xterm256(n) {
  if (n >= 232) {
    const v = 8 + (n - 232) * 10;
    return [v, v, v];
  }
  if (n >= 16) {
    const i = n - 16;
    const step = (c) => (c === 0 ? 0 : 55 + c * 40);
    return [step(Math.floor(i / 36)), step(Math.floor(i / 6) % 6), step(i % 6)];
  }
  const base = [[0, 0, 0], [205, 49, 49], [13, 188, 121], [229, 229, 16], [36, 114, 200], [188, 63, 188], [17, 168, 205], [229, 229, 229],
    [102, 102, 102], [241, 76, 76], [35, 209, 139], [245, 245, 67], [59, 142, 234], [214, 112, 214], [41, 184, 219], [255, 255, 255]];
  return base[n];
}

const escapeHtml = (text) => text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

function ansiToHtml(text) {
  let state = { bold: false, dim: false, italic: false, color: null };
  let html = '';
  for (const piece of text.split(/(\u001b\[[0-9;]*m)/)) {
    const match = /^\u001b\[([0-9;]*)m$/.exec(piece);
    if (!match) {
      if (!piece) continue;
      const style = [];
      if (state.color) style.push(`color:rgb(${state.color.join(',')})`);
      if (state.bold) style.push('font-weight:700');
      if (state.dim) style.push('opacity:.7');
      if (state.italic) style.push('font-style:italic');
      html += style.length ? `<span style="${style.join(';')}">${escapeHtml(piece)}</span>` : escapeHtml(piece);
      continue;
    }
    const codes = match[1] === '' ? [0] : match[1].split(';').map(Number);
    for (let i = 0; i < codes.length; i++) {
      const code = codes[i];
      if (code === 0) state = { bold: false, dim: false, italic: false, color: null };
      else if (code === 1) state.bold = true;
      else if (code === 2) state.dim = true;
      else if (code === 3) state.italic = true;
      else if (code === 38 && codes[i + 1] === 5) {
        state.color = xterm256(codes[i + 2]);
        i += 2;
      } else if (code === 38 && codes[i + 1] === 2) {
        state.color = [codes[i + 2], codes[i + 3], codes[i + 4]];
        i += 4;
      }
    }
  }
  return html;
}

function page(lines, title) {
  const body = lines.map((line) => ansiToHtml(line)).join('\n');
  return `<!doctype html><meta charset="utf-8"><style>
    body{margin:0;background:#17120d;}
    .card{padding:22px 26px;font:15px/1.22 Menlo,Monaco,"SF Mono",monospace;color:#ece4d2;white-space:pre;}
    .title{color:#848692;font:12px Menlo,monospace;opacity:.6;margin-bottom:10px}
  </style><div class="card"><div class="title">${escapeHtml(title)}</div>${body}</div>`;
}

function render(name, title, text, columns) {
  const lines = text.replace(/\n$/, '').split('\n');
  const width = Math.ceil(columns * 9.05) + 56;
  const height = Math.ceil((lines.length + 1.6) * 18.4) + 56;
  const html = path.join(os.tmpdir(), `wraith-shot-${name}.html`);
  fs.writeFileSync(html, page(lines, title));
  fs.mkdirSync(OUT, { recursive: true });
  const png = path.join(OUT, `${name}.png`);
  const result = spawnSync(CHROME, ['--headless=new', '--hide-scrollbars', '--force-device-scale-factor=2', `--window-size=${width},${height}`, `--screenshot=${png}`, `file://${html}`], { stdio: 'ignore' });
  fs.rmSync(html, { force: true });
  if (result.status !== 0) throw new Error(`Chrome failed for ${name}`);
  console.log(`wrote docs/${name}.png (${lines.length} lines)`);
}

// ---- What to draw ----
const COLOUR_ENV = { ...process.env, FORCE_COLOR: '1', COLORTERM: 'truecolor', COLUMNS: '64', NO_COLOR: undefined, WRAITH_PLAIN: undefined };
delete COLOUR_ENV.NO_COLOR;
delete COLOUR_ENV.WRAITH_PLAIN;

function run(args, extraEnv = {}) {
  const result = spawnSync('node', [BIN, ...args], { encoding: 'utf8', env: { ...COLOUR_ENV, ...extraEnv }, timeout: 180000 });
  return `${result.stdout}${result.stderr}`;
}

function shots() {
  const only = process.argv[2];
  const jobs = {
    gate: () => ['wraith gate: the wraith steps in before a risky command runs',
      `${run(['gate', '--', 'git push --force origin main'])}\n${run(['gate', '--', 'rm -rf ~/Documents/old-projects'])}`.replace(/\n\n$/, '\n')],
    whispers: () => ['wraith whisper: one line after a command, from Gemma (echo) or from code (omen)',
      [
        ['--exit', '1', '--streak', '3', '--hour', '3', '--', 'npm test'],
        ['--exit', '127', '--', 'gti status'],
        ['--exit', '0', '--seconds', '74', '--', 'cargo build --release'],
        ['--exit', '137', '--seconds', '310', '--', 'python train.py'],
        ['--exit', '0', '--hour', '2', '--', 'ls -la'],
      ].map((args) => `$ ${args.slice(args.indexOf('--') + 1).join(' ')}\n${run(['whisper', '--force', ...args], { COLUMNS: '90' })}`).join('\n')],
    ofrenda: () => ['wraith ofrenda --history demo/history (a made-up history)',
      run(['ofrenda', '--history', path.join(ROOT, 'demo', 'history')])],
    doctor: () => ['wraith doctor', run(['doctor'])],
    fun: () => ['the silly commands', [
      ['wraith graveyard', ['graveyard', '--seed', '4']],
      ['wraith haunt --scene pumpkins', ['haunt', '--scene', 'pumpkins', '--seed', '2']],
      ['wraith say "hello from the machine"', ['say', 'hello from the machine', '--seed', '2']],
      ['wraith haunt --scene cauldron', ['haunt', '--scene', 'cauldron', '--seed', '6']],
    ].map(([label, args]) => `$ ${label}\n${run(args)}`).join('\n')],
    tests: () => ['npm test', (() => {
      const result = spawnSync('node', ['--test', '--test-reporter=spec'], { cwd: ROOT, encoding: 'utf8', env: { ...process.env, FORCE_COLOR: '0', NO_COLOR: '1' } });
      const lines = `${result.stdout}${result.stderr}`.trim().split('\n');
      const summary = lines.slice(lines.findIndex((l) => /^ℹ tests/.test(l)));
      return `$ npm test\n${summary.join('\n')}`;
    })()],
  };
  for (const [name, job] of Object.entries(jobs)) {
    if (only && only !== name) continue;
    const [title, text] = job();
    render(name, title, text, name === 'whispers' ? 90 : 66);
  }
}

shots();
