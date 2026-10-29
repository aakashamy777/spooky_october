'use strict';

// Writes demo/history: a made-up zsh history for a fictional developer, so the ofrenda can be
// shown without anyone's real commands. Deterministic: running it again gives the same file.
//   node scripts/make-demo-history.js > demo/history

const DAY = 86400;
const START = Date.UTC(2025, 0, 6, 9, 0, 0) / 1000;

// A small fixed random number generator, so the output never changes.
let seed = 2026;
function random() {
  seed = (seed * 1664525 + 1013904223) >>> 0;
  return seed / 2 ** 32;
}
const pick = (list) => list[Math.floor(random() * list.length)];

const ALWAYS = ['git status', 'git commit -m "wip"', 'git push', 'git pull', 'npm test', 'npm run dev', 'ls -la', 'cd ..', 'vim notes.md', 'node app.js', 'make build', 'docker compose up -d', 'cargo build', 'cat package.json', 'echo done'];

// Make sure each old tool has the counts the demo wants, then spread them over the old era.
const OLD_COUNTS = { 'gulp watch': 9, 'gulp build': 5, 'bower install': 7, 'grunt build': 9, 'python2 manage.py runserver': 7, 'python2 manage.py migrate': 4, 'heroku logs --tail': 6 };

const lines = [];
for (const [command, count] of Object.entries(OLD_COUNTS)) {
  for (let i = 0; i < count; i++) lines.push([START + Math.floor(random() * 150 * DAY), command]);
}
const total = 330;
for (let i = 0; i < total; i++) lines.push([START + Math.floor(random() * 660 * DAY), pick(ALWAYS)]);
// The everyday commands are still in use: make sure each one shows up in the last two months.
for (const command of ALWAYS) {
  for (let i = 0; i < 2; i++) lines.push([START + Math.floor((600 + random() * 58) * DAY), command]);
}
// A few modern ones that only appear late.
for (let i = 0; i < 18; i++) lines.push([START + Math.floor((500 + random() * 160) * DAY), pick(['cargo test', 'cargo clippy', 'docker compose logs', 'git rebase main'])]);

lines.sort((a, b) => a[0] - b[0]);
for (const [ts, command] of lines) process.stdout.write(`: ${ts}:0;${command}\n`);
