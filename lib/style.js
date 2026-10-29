'use strict';

// How Wraith looks. Candle-lit: marigold and bone on a dark terminal, with violet for the ghost's own voice.
// With no colour (NO_COLOR, a pipe, TERM=dumb) every helper returns plain text, so it is safe in logs and tests.

// [truecolor r,g,b, 256-colour index]
const PALETTE = {
  marigold: [[245, 183, 38], 214],
  ember: [[222, 92, 62], 167],
  bone: [[236, 228, 210], 254],
  ash: [[132, 134, 146], 245],
  violet: [[162, 132, 222], 141],
};

const RESET = '\u001b[0m';
const ANSI_PATTERN = /\u001b\[[0-9;]*m/g;

function detect(env = process.env, stream = process.stdout) {
  const plain = env.WRAITH_PLAIN === '1' || 'NO_COLOR' in env || env.TERM === 'dumb';
  const color = !plain && (env.FORCE_COLOR ? env.FORCE_COLOR !== '0' : Boolean(stream && stream.isTTY));
  const trueColor = color && /^(truecolor|24bit)$/i.test(env.COLORTERM || '');
  const columns = (stream && stream.columns) || Number(env.COLUMNS) || 80;
  return { color, trueColor, columns };
}

function visibleLength(text) {
  return Array.from(String(text).replace(ANSI_PATTERN, '')).length;
}

function createStyle({ color = false, trueColor = false, columns = 80 } = {}) {
  function paint(name, text, { italic = false, bold = false, dim = false } = {}) {
    if (!color) return String(text);
    const [rgb, index] = PALETTE[name];
    const codes = [];
    if (bold) codes.push('1');
    if (dim) codes.push('2');
    if (italic) codes.push('3');
    codes.push(trueColor ? `38;2;${rgb.join(';')}` : `38;5;${index}`);
    return `\u001b[${codes.join(';')}m${text}${RESET}`;
  }

  // Break text into lines no wider than `width`, on spaces. A single word longer than a line is cut.
  function wrap(text, width) {
    const lines = [];
    for (const paragraph of String(text).split('\n')) {
      let line = '';
      for (const word of paragraph.split(/\s+/).filter(Boolean)) {
        let rest = word;
        while (visibleLength(rest) > width) {
          if (line) {
            lines.push(line);
            line = '';
          }
          const chars = Array.from(rest);
          lines.push(chars.slice(0, width).join(''));
          rest = chars.slice(width).join('');
        }
        if (line && visibleLength(line) + 1 + visibleLength(rest) > width) {
          lines.push(line);
          line = rest;
        } else {
          line = line ? `${line} ${rest}` : rest;
        }
      }
      lines.push(line);
    }
    return lines;
  }

  // A rounded box. `lines` may hold colours; the width is worked out from what you can see.
  function box(lines, { title = '', width = Math.min(62, columns - 2), tone = 'marigold' } = {}) {
    const inner = Math.max(20, width - 4);
    const edge = (text) => paint(tone, text);
    const head = title ? ` ${title} ` : '';
    const top = edge('╭─') + (title ? paint(tone, head, { bold: true }) : '') + edge('─'.repeat(Math.max(0, inner + 2 - 1 - visibleLength(head))) + '╮');
    const bottom = edge('╰' + '─'.repeat(inner + 2) + '╯');
    const body = lines.map((line) => {
      const pad = ' '.repeat(Math.max(0, inner - visibleLength(line)));
      return `${edge('│')} ${line}${pad} ${edge('│')}`;
    });
    return [top, ...body, bottom].join('\n');
  }

  // Write text one visible character at a time, but never take longer than maxMs in total.
  // Colour codes go out whole and instantly, so they are never typed out.
  async function typewrite(stream, text, { maxMs = 500 } = {}) {
    const value = String(text);
    const visible = visibleLength(value);
    if (!color || !stream.isTTY || visible === 0) {
      stream.write(value);
      return;
    }
    const pause = Math.min(28, Math.floor(maxMs / visible));
    const pieces = value.match(/\u001b\[[0-9;]*m|[\s\S]/gu) || [];
    for (const piece of pieces) {
      stream.write(piece);
      if (pause > 0 && !piece.startsWith('\u001b')) await new Promise((resolve) => setTimeout(resolve, pause));
    }
  }

  const glyph = { ghost: '☾', spark: '✦', flower: '✿', candle: 'i', dot: '·' };

  // The line shown for a whisper. `source` is "omen" (written by code) or "echo" (written by Gemma).
  function whisperLine(text, source) {
    return `  ${paint('violet', glyph.ghost)} ${paint('bone', text, { italic: true })} ${paint('ash', `${glyph.dot} ${source}`, { dim: true })}`;
  }

  return { paint, wrap, box, typewrite, whisperLine, glyph, color, columns };
}

module.exports = { createStyle, detect, visibleLength, PALETTE };
