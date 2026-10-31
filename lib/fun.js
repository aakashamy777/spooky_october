'use strict';

// The silly side of Wraith: goofy horror pictures and lines you can summon from the terminal.
// Nothing here needs the model or the network, and every picture is drawn from a random source you can fix
// with --seed, so the same seed gives the same picture.

const { visibleLength } = require('./style');

// A small fixed random number generator (mulberry32), so a seed always draws the same thing.
function seeded(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const pick = (list, random) => list[Math.floor(random() * list.length)];

const EMOJI = ['🎃', '👻', '🦇', '🕷️', '💀', '🕸️', '🕯️', '🧛', '🧟', '🪦', '🧙', '🍬', '👁️', '🦴', '🌕'];

const FORTUNES = [
  'You will find a bug in production. At midnight. During a full moon.',
  'A ghost is reading your code. It has notes.',
  'Beware the semicolon you forgot three files ago.',
  'The cursor blinks. Something blinks back.',
  'Your next merge conflict will be haunted.',
  'Treats are in your future. So are tricks. Mostly tricks.',
  'Someone is typing... in a room with no keyboard.',
  'The Wi-Fi is fine. The Wi-Fi is always fine. (The Wi-Fi is not fine.)',
  "Today's lucky number is 404. Soul not found.",
  'A friendly skeleton says you have good bones.',
  'Do not read the TODO from 2019.',
  'Your future holds a green build, a cold coffee and one very smug ghost.',
  'The thing in the basement is also waiting for npm install.',
  'Backups are for the living. Make one anyway.',
];

const EPITAPHS = [
  'Here lies my Wi-Fi password',
  'RIP node_modules (2 GB)',
  'Unsaved work. Gone, not forgotten',
  'R.I.P. my sleep schedule',
  'Here lies Internet Explorer',
  'Died as it lived: in a merge conflict',
  'Left on read',
  'My patience, 2019 to now',
  'RIP free trial',
  'Here lies a TODO',
  'Tabs and spaces: both lost',
  'Shipped on a Friday',
];

const INGREDIENTS = [
  'eye of newt', 'one (1) stale bagel', 'a single left sock', 'three unread emails',
  'dust from a forgotten meeting link', 'bat wing, lightly salted', 'a pinch of null',
  'the last slice of pizza', 'a cursed USB cable', 'whispers of an old git branch',
];

const OUIJA_ANSWERS = [
  'YES', 'NO', 'MAYBE', 'ASK AGAIN AFTER COFFEE', 'DEFINITELY NOT', 'SIGNS POINT TO BOO',
  'ONLY ON FRIDAYS', '404 SOUL NOT FOUND', 'YES BUT BEWARE', 'I HAVE SEEN WORSE', 'GOODBYE',
];

const TREATS = [
  '🍬 A fun-size compliment: your code compiles in my heart.',
  '🍫 One (1) chocolate bar of pure encouragement. No ghosts were harmed.',
  '🍭 You win a lollipop and the right to ignore one warning today.',
  '🧁 The wraith bakes you a cupcake. It is mostly ectoplasm. Enjoy.',
  '🍎 An apple. (Checked for razor blades: none, because this is a terminal.)',
];

const TRICKS = [
  '💀 TRICK! Your cursor is now haunted. (It always was.)',
  '🕷️ TRICK! A spider has moved into your scrollback. It pays no rent.',
  '👻 TRICK! Your prompt now says boo. Just kidding. Nothing changed. Or did it?',
  '🦇 TRICK! A bat took your last semicolon. Check line 42.',
  '🧟 TRICK! The build is fine. The build is always fine. Behind you.',
];

const GHOST_FACES = [
  { eyes: 'o   o', mouth: 'O' }, { eyes: 'O   O', mouth: '~' }, { eyes: '-   -', mouth: 'o' },
  { eyes: '>   <', mouth: 'D' }, { eyes: '@   @', mouth: '_' },
];

function pad(text, width) {
  return text + ' '.repeat(Math.max(0, width - visibleLength(text)));
}

// Put blocks of lines next to each other.
function sideBySide(blocks, gap = 3) {
  const height = Math.max(...blocks.map((b) => b.length));
  const widths = blocks.map((b) => Math.max(...b.map(visibleLength)));
  const lines = [];
  for (let i = 0; i < height; i++) {
    lines.push(blocks.map((b, j) => pad(b[i] || '', widths[j])).join(' '.repeat(gap)).replace(/\s+$/, ''));
  }
  return lines;
}

function ghostArt({ eyes, mouth }) {
  return [
    '  .-----.',
    ` / ${eyes} \\`,
    `|    ${mouth}    |`,
    '|         |',
    ' \\/\\/\\/\\/\\/',
  ];
}

function pumpkinArt(random) {
  const eyes = pick(['^   ^', 'o   o', '>   <', '@   @'], random);
  const mouth = pick(['\\_/', 'vvv', 'WWW', '---', 'ooo'], random);
  return ['    \\|', '  .-"""-.', ` / ${eyes} \\`, ` \\  ${mouth}  /`, "  '-...-'"];
}

function emojiRow(random, cells, density) {
  let row = '';
  for (let i = 0; i < cells; i++) row += random() < density ? `${pick(EMOJI, random)} ` : '   ';
  return row.replace(/\s+$/, '');
}

// Each scene returns the lines of one goofy picture. `width` is the terminal width.
const SCENES = {
  confetti(random, style, width) {
    const cells = Math.max(6, Math.floor((width - 2) / 3));
    return [pick(['  a little rain of spooks', '  something is falling', '  it is raining, but spookier'], random), '',
      ...Array.from({ length: 6 }, () => emojiRow(random, cells, 0.4))];
  },

  graveyard(random, style, width) {
    const count = Math.max(2, Math.min(3, Math.floor((width - 2) / 18)));
    const stones = [];
    const used = new Set();
    // Only epitaphs that fit on a stone (three short lines), so none is cut off.
    const fitting = EPITAPHS.filter((text) => style.wrap(text, 11).length <= 3);
    while (stones.length < count) {
      const text = pick(fitting, random);
      if (used.has(text)) continue;
      used.add(text);
      const words = style.wrap(text, 11);
      const rows = [words[0] || '', words[1] || '', words[2] || ''].map((w) => {
        const left = Math.floor((11 - w.length) / 2);
        return `|${' '.repeat(left)}${w}${' '.repeat(11 - left - w.length)}|`;
      });
      stones.push(['  _.-----._', ' /  R.I.P.  \\', ...rows.map((r) => ` ${r}`), ' |___________|']);
    }
    return [...sideBySide(stones, 2).map((l) => style.paint('bone', l)), style.paint('ash', '~'.repeat(Math.min(width - 2, 18 * count))), `  ${pick(['🦇', '👻', '🕯️', '🌕'], random)}  ${pick(['the grass here is suspiciously well kept', 'nobody is buried here. probably', 'visiting hours: always'], random)}`];
  },

  ghosts(random, style) {
    const faces = Array.from({ length: 3 }, () => pick(GHOST_FACES, random));
    const captions = ['  boo', ' uh oh', '  hi?', ' nope', ' wheee', ' rude'];
    const blocks = faces.map((face) => [...ghostArt(face), pick(captions, random)]);
    return sideBySide(blocks, 3).map((l) => style.paint('bone', l));
  },

  bats(random, style, width) {
    const limit = Math.min(width - 12, 50);
    const rows = [];
    for (let r = 0; r < 5; r++) {
      let line = '';
      let used = 0;
      let gap = Math.floor(random() * 6);
      while (used + gap < limit) {
        const bat = pick(['🦇', '^v^', '/\\^o^/\\', '🦇', '~^~'], random);
        line += ' '.repeat(gap) + bat;
        used += gap + visibleLength(bat);
        gap = 3 + Math.floor(random() * 12);
      }
      rows.push(line);
    }
    return rows.map((l) => style.paint('violet', l));
  },

  web(random, style) {
    const web = [' \\  |  /', '--\\ | /--', '---\\|/---', '---/|\\---', ' / | \\'];
    return [...web.map((l) => style.paint('ash', `     ${l}`)),
      style.paint('ash', '        |'), style.paint('ash', '        |'),
      style.paint('ember', '    //\\\\(oo)//\\\\'),
      style.paint('ash', `     ${pick(['it lives here now.', 'it has been waiting.', 'it is very polite about it.', 'rent is due.'], random)}`)];
  },

  pumpkins(random, style) {
    return sideBySide([pumpkinArt(random), pumpkinArt(random), pumpkinArt(random)], 3).map((l) => style.paint('marigold', l));
  },

  skull(random, style) {
    const word = pick(['NOPE', 'OOPS', 'HELLO', 'LOL', 'BOO', 'SPOOKY', 'WHY?'], random);
    return [
      '    _______', '   /       \\', '  |  () ()  |', '   \\   ^   /', '    | ||| |', "    '-----'",
    ].map((l, i) => style.paint('bone', i === 5 ? `${l}   ${style.paint('ember', word, { bold: true })}` : l));
  },

  cauldron(random, style) {
    const bubbles = ['   o   O    o', '     o   .  O', '  O    o'];
    const pot = ['  _.-------._', ' /           \\', '|  ~  ~  ~  ~ |', ' \\___________/', '   /\\     /\\'];
    const brew = Array.from({ length: 3 }, () => pick(INGREDIENTS, random));
    return [...bubbles.map((l) => style.paint('violet', l)), ...pot.map((l) => style.paint('marigold', l)),
      '', style.paint('bone', '  tonight the wraith is brewing:'),
      ...brew.map((item) => style.paint('ash', `    + ${item}`))];
  },
};

const SCENE_NAMES = Object.keys(SCENES);

// Draw one random scene, or the one asked for.
function haunt(random, style, { scene, width = 64 } = {}) {
  const name = scene && SCENES[scene] ? scene : pick(SCENE_NAMES, random);
  return { name, text: SCENES[name](random, style, width).join('\n') };
}

function fortune(random, style) {
  const lines = style.wrap(pick(FORTUNES, random), 52);
  return [style.paint('marigold', '  🥠 your spooky fortune:'), '', ...lines.map((l) => style.paint('bone', `     ${l}`, { italic: true })), '',
    style.paint('ash', `     lucky number: ${Math.floor(random() * 99) + 1}   lucky ghost: ${pick(['Gary', 'Brenda', 'Kevin', 'Sir Boo-nard', 'Dave'], random)}`)].join('\n');
}

// A ghost saying whatever you give it, in a speech bubble.
function say(text, random, style) {
  const message = text.trim() || 'boo.';
  const bubble = style.box(style.wrap(message, 38).map((l) => style.paint('bone', l)), { width: Math.min(46, style.columns - 2), tone: 'violet' });
  const ghost = ghostArt(pick(GHOST_FACES, random)).map((l) => style.paint('bone', `        ${l}`));
  return [bubble, style.paint('violet', '           \\'), ...ghost].join('\n');
}

const OUIJA_BOARD = [
  '   YES                    NO',
  ' A B C D E F G H I J K L M',
  ' N O P Q R S T U V W X Y Z',
  ' 1 2 3 4 5 6 7 8 9 0     GOODBYE',
];

function ouijaAnswer(random) {
  return pick(OUIJA_ANSWERS, random);
}

function treatOrTrick(choice, random) {
  const outcome = random() < 0.5 ? 'treat' : 'trick';
  return { outcome, text: pick(outcome === 'treat' ? TREATS : TRICKS, random), flipped: outcome !== choice };
}

module.exports = {
  seeded, pick, haunt, fortune, say, ouijaAnswer, treatOrTrick, emojiRow, sideBySide, ghostArt,
  OUIJA_BOARD, SCENE_NAMES, FORTUNES, EPITAPHS, INGREDIENTS, OUIJA_ANSWERS, TREATS, TRICKS, EMOJI,
};
