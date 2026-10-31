'use strict';

// Small animations for the silly commands. On a terminal with colour they play out over a second or two.
// Anywhere else (a pipe, a log, a test) they print the finished picture at once, so nothing hangs.

const { pick, emojiRow, ouijaAnswer, OUIJA_BOARD } = require('./fun');

const CLEAR_LINE = '\u001b[2K\r';

function isLive(stream, style) {
  return Boolean(stream.isTTY && style.color);
}

// A ghost floats across the screen from right to left and says BOO.
async function boo({ stream, style, sleep, columns = 80 }) {
  const { paint } = style;
  const word = paint('ember', 'B O O !', { bold: true });
  if (!isLive(stream, style)) {
    stream.write(`👻 ${word}\n`);
    return;
  }
  const span = Math.max(10, columns - 12);
  for (let pos = span; pos >= 0; pos -= 3) {
    stream.write(`${CLEAR_LINE}${' '.repeat(pos)}👻`);
    await sleep(35);
  }
  stream.write(`${CLEAR_LINE}👻 ${word}\n`);
}

// A stream of falling emoji, one row at a time.
async function rain({ stream, style, random, sleep, seconds = 4, columns = 80 }) {
  const live = isLive(stream, style);
  const cells = Math.max(6, Math.floor((columns - 2) / 3));
  const rows = live ? Math.max(1, Math.round((seconds * 1000) / 130)) : 8;
  for (let i = 0; i < rows; i++) {
    stream.write(`${emojiRow(random, cells, 0.22)}\n`);
    if (live) await sleep(130);
  }
}

// A spider lowers itself on a thread.
async function spider({ stream, style, random, sleep }) {
  const live = isLive(stream, style);
  const thread = style.paint('ash', '        |');
  for (let i = 0; i < 7; i++) {
    stream.write(`${thread}\n`);
    if (live) await sleep(110);
  }
  stream.write(`${style.paint('ember', '    //\\\\(oo)//\\\\')}\n`);
  stream.write(`${style.paint('ash', `     ${pick(['it has moved in.', 'hello. i live here now.', 'do not look up.', 'it is very polite about it.'], random)}`)}\n`);
}

// The board, then the answer one letter at a time.
async function ouija({ stream, style, random, sleep, question }) {
  const { paint } = style;
  const live = isLive(stream, style);
  if (question) stream.write(`${paint('ash', `  you asked: ${question}`)}\n`);
  stream.write(`${OUIJA_BOARD.map((line) => paint('marigold', line)).join('\n')}\n\n`);
  stream.write(`  ${paint('violet', '☾')} the planchette moves... `);
  const answer = ouijaAnswer(random);
  for (const letter of answer) {
    stream.write(paint('bone', letter === ' ' ? '  ' : `${letter} `, { bold: true }));
    if (live) await sleep(260);
  }
  stream.write('\n');
  return answer;
}

module.exports = { boo, rain, spider, ouija, isLive };
