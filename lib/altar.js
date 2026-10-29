'use strict';

// Draw the ofrenda: a garland, candles, and one framed remembrance for each command you stopped using.

const { visibleLength } = require('./style');

function center(text, width) {
  const pad = Math.max(0, Math.floor((width - visibleLength(text)) / 2));
  return ' '.repeat(pad) + text;
}

function quietPhrase(quietFor) {
  if (quietFor.days !== undefined) return `quiet for ${quietFor.days} ${quietFor.days === 1 ? 'day' : 'days'}`;
  return `quiet for the last ${quietFor.commands} ${quietFor.commands === 1 ? 'command' : 'commands'}`;
}

// entries: [{ name, uses, quietFor, epitaph: { text, source } }]
function renderAltar({ entries, total, dated }, style, { columns = style.columns } = {}) {
  const { paint, glyph } = style;
  const width = Math.max(40, Math.min(62, columns - 2));
  const lines = [];

  const garland = Array.from({ length: Math.floor(width / 2) }, () => glyph.flower).join(' ');
  lines.push(paint('marigold', center(garland, width)));
  lines.push('');
  lines.push(center(`${paint('violet', glyph.ghost)}  ${paint('marigold', 'ofrenda', { bold: true })}  ${paint('violet', glyph.ghost)}`, width));
  lines.push(center(paint('ash', 'for the commands you stopped running'), width));
  lines.push('');

  if (entries.length === 0) {
    lines.push(center(paint('bone', 'Nothing to remember yet.'), width));
    lines.push(center(paint('ash', 'Every command you used often is still in use.'), width));
  } else {
    // One candle for each remembrance.
    const gap = '     ';
    lines.push(paint('marigold', center(entries.map(() => '(').join(gap), width)));
    lines.push(paint('bone', center(entries.map(() => '|').join(gap), width)));
    lines.push(paint('ash', center('─'.repeat(Math.max(8, entries.length * 6 - 1)), width)));
    lines.push('');

    entries.forEach((entry, index) => {
      const body = [
        paint('ash', `used ${entry.uses} ${entry.uses === 1 ? 'time' : 'times'} ${glyph.dot} ${quietPhrase(entry.quietFor)}`),
        '',
        ...style.wrap(entry.epitaph.text, width - 4).map((line) => paint('bone', line, { italic: true })),
        paint('ash', `${glyph.dot} ${entry.epitaph.source}`, { dim: true }),
      ];
      lines.push(style.box(body, { title: paint('marigold', entry.name, { bold: true }), width, tone: 'violet' }));
      if (index < entries.length - 1) lines.push(paint('marigold', center(`${glyph.dot} ${glyph.flower} ${glyph.dot}`, width)));
    });
  }

  lines.push('');
  lines.push(paint('marigold', center(garland, width)));
  lines.push('');
  const count = `${entries.length} remembered, from ${total} commands in your history`;
  lines.push(center(paint('ash', count), width));
  if (!dated && total > 0) {
    lines.push(center(paint('ash', 'Your history has no dates, so "quiet" is counted in commands.'), width));
    lines.push(center(paint('ash', 'For days, add  setopt EXTENDED_HISTORY  to ~/.zshrc.'), width));
  }
  return lines.join('\n');
}

module.exports = { renderAltar, quietPhrase, center };
