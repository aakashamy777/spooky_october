'use strict';

// Hide secrets in a command line before it goes to the model or into the local log.
// This works by pattern, so it will miss things. Wraith never sends command output anywhere.

const HIDDEN = '[hidden]';

const SECRET_WORDS = '(?:password|passwd|pass|pwd|token|secret|api[-_]?key|access[-_]?key|private[-_]?key|auth|authorization|credentials?)';
const VALUE = '(?:"[^"]*"|\'[^\']*\'|\\S+)';

// Each rule has a name and a global regex. `replace` may use $1, $2 to keep the part before the secret.
const RULES = [
  {
    // API_KEY=abc, export DB_PASSWORD="abc"
    name: 'env-assignment',
    // The secret word has to be a whole part of the name (split by _), so PASSENGER_COUNT is not caught.
    re: new RegExp(`\\b((?:[A-Za-z0-9]+_)*${SECRET_WORDS}(?:_[A-Za-z0-9]+)*=)${VALUE}`, 'gi'),
    replace: `$1${HIDDEN}`,
  },
  {
    // --password hunter2, --token=abc, --api-key "abc"
    name: 'long-flag',
    re: new RegExp(`(--[a-z0-9-]*${SECRET_WORDS}[a-z0-9-]*(?:=|\\s+))${VALUE}`, 'gi'),
    replace: `$1${HIDDEN}`,
  },
  {
    // curl -u user:pass, curl --user user:pass (only for curl: mysql -u root is just a name)
    name: 'curl-user',
    re: /\b(curl\b[^|;&]*?\s(?:-u|--user)\s+)\S+/g,
    replace: `$1${HIDDEN}`,
  },
  {
    // sshpass -p secret
    name: 'sshpass',
    re: /\b(sshpass\s+-p\s*)\S+/g,
    replace: `$1${HIDDEN}`,
  },
  {
    // mysql -u root -psecret (the password is glued to -p)
    name: 'mysql-password',
    re: /\b(mysql\w*\b[^|;&]*?\s-p)\S+/g,
    replace: `$1${HIDDEN}`,
  },
];

// Returns the safe text and how many secrets were hidden.
function redact(command) {
  let text = String(command || '');
  let hidden = 0;
  for (const rule of RULES) {
    const found = text.match(rule.re);
    if (found) {
      hidden += found.length;
      text = text.replace(rule.re, rule.replace);
    }
  }
  return { text, hidden };
}

module.exports = { redact, HIDDEN, RULES };
