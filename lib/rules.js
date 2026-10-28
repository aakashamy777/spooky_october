'use strict';

// Decide whether a command is risky enough for the wraith to step in before it runs.
// The reason is written here, in code, so the warning is the same every time and never invented.

// ---- Reading a command line ----
// Split into words and operators. Quotes group words; a quoted string is one word without its quotes.
function tokenize(line) {
  const tokens = [];
  let word = '';
  let hasWord = false;
  let quote = null;

  const flush = () => {
    if (hasWord) tokens.push({ type: 'word', value: word });
    word = '';
    hasWord = false;
  };
  const op = (value) => {
    flush();
    tokens.push({ type: 'op', value });
  };

  const text = String(line || '');
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];

    if (quote) {
      if (ch === quote) quote = null;
      else if (ch === '\\' && quote === '"' && i + 1 < text.length) word += text[++i];
      else word += ch;
      continue;
    }

    if (ch === "'" || ch === '"') {
      quote = ch;
      hasWord = true;
    } else if (ch === '\\' && i + 1 < text.length) {
      word += text[++i];
      hasWord = true;
    } else if (/\s/.test(ch)) {
      if (ch === '\n') op(';');
      else flush();
    } else if (ch === '&' && text[i + 1] === '&') {
      op('&&');
      i++;
    } else if (ch === '|' && text[i + 1] === '|') {
      op('||');
      i++;
    } else if (ch === '&' && text[i + 1] === '>') {
      // &> file: the next loop turn reads the > as a redirect
    } else if (ch === '>' || ch === '<') {
      // A number glued in front (2>) names a stream, not a word.
      if (/^\d+$/.test(word)) {
        word = '';
        hasWord = false;
      }
      flush();
      let value = ch;
      if (ch === '>' && text[i + 1] === '>') {
        value = '>>';
        i++;
      }
      if (ch === '>' && text[i + 1] === '&') {
        // 2>&1 copies a stream. It is not a file.
        i++;
        while (/[\d-]/.test(text[i + 1] || '')) i++;
      } else {
        tokens.push({ type: 'redir', value });
      }
    } else if (ch === '|' || ch === ';' || ch === '&') {
      op(ch);
    } else {
      word += ch;
      hasWord = true;
    }
  }
  flush();
  return tokens;
}

// Break the tokens into simple commands. Each remembers whether it was fed by a pipe,
// and which files it redirects to or from.
function segments(line) {
  const result = [];
  let current = [];
  let redirects = [];
  let pendingRedirect = null;
  let pipedFromPrevious = false;
  let nextPiped = false;

  const close = () => {
    if (current.length || redirects.length) result.push({ words: current, redirects, piped: pipedFromPrevious });
    current = [];
    redirects = [];
    pendingRedirect = null;
    pipedFromPrevious = nextPiped;
    nextPiped = false;
  };

  for (const token of tokenize(line)) {
    if (token.type === 'word') {
      if (pendingRedirect) {
        redirects.push({ op: pendingRedirect, target: token.value });
        pendingRedirect = null;
      } else {
        current.push(token.value);
      }
    } else if (token.type === 'redir') {
      pendingRedirect = token.value;
    } else {
      nextPiped = token.value === '|';
      close();
    }
  }
  close();
  return result;
}

const WRAPPERS = {
  sudo: ['-u', '-g', '-h', '-p', '-C', '-U', '-D', '-r', '-t', '-T'],
  doas: ['-u', '-C'],
  env: ['-u', '-C', '-S'],
  nice: ['-n'],
  command: [],
  nohup: [],
  time: [],
  exec: [],
  builtin: [],
};

// Look past FOO=bar prefixes and wrappers like sudo, to the real command.
function describe(segment) {
  const words = segment.words.slice();
  let sudo = false;
  while (words.length) {
    const first = words[0];
    if (/^[A-Za-z_][A-Za-z0-9_]*=/.test(first)) {
      words.shift();
    } else if (Object.hasOwn(WRAPPERS, first)) {
      if (first === 'sudo' || first === 'doas') sudo = true;
      words.shift();
      // Skip the wrapper's own flags, and the value that some of them take.
      while (words.length && words[0].startsWith('-')) {
        const flag = words.shift();
        if (WRAPPERS[first].includes(flag)) words.shift();
      }
    } else {
      break;
    }
  }
  const name = words.length ? words[0].split('/').pop() : '';
  return { name, args: words.slice(1), sudo, piped: segment.piped, redirects: segment.redirects };
}

// Pull flags apart from operands. `-rf` gives r and f. `--` ends the flags.
function parseArgs(args) {
  const short = new Set();
  const long = new Set();
  const operands = [];
  let flagsDone = false;
  for (const arg of args) {
    if (flagsDone) operands.push(arg);
    else if (arg === '--') flagsDone = true;
    else if (arg.startsWith('--')) long.add(arg.slice(2).split('=')[0]);
    else if (arg.startsWith('-') && arg.length > 1) for (const letter of arg.slice(1)) short.add(letter);
    else operands.push(arg);
  }
  return { short, long, operands };
}

// ---- Rules ----
const LEVELS = { caution: 1, danger: 2 };

function result(id, level, reason, command) {
  return { id, level, reason, command };
}

// A path that is a whole system or home directory.
function isSystemTarget(target) {
  const t = target.length > 1 ? target.replace(/\/+$/, '') : target;
  if (['/', '/*', '~', '~/*', '$HOME', '$HOME/*', '${HOME}', '${HOME}/*'].includes(t)) return true;
  if (/^\/(Users|home)\/[^/]+(\/\*)?$/.test(t)) return true;
  return /^\/[^/]+(\/\*)?$/.test(t);
}

// For rm, the folder you are standing in and its parent are just as bad.
function isCatastrophicTarget(target) {
  const t = target.length > 1 ? target.replace(/\/+$/, '') : target;
  return isSystemTarget(t) || ['.', '..', '*', './*', '../*', '.*'].includes(t);
}

function isWideTarget(target) {
  return /[*?]/.test(target) || /^[/~$]/.test(target) || target.split('/').includes('..');
}

function ruleRm(cmd) {
  if (cmd.name !== 'rm') return null;
  const { short, long, operands } = parseArgs(cmd.args);
  const recursive = short.has('r') || short.has('R') || long.has('recursive');
  if (!recursive || operands.length === 0) return null;

  if (operands.some(isCatastrophicTarget)) {
    return result('rm-catastrophic', 'danger', 'This would delete a whole directory tree that holds far more than one project.', 'rm');
  }
  if (operands.some(isWideTarget)) {
    return result('rm-wide', 'caution', 'This deletes a directory tree outside the folder you are standing in, or everything a pattern matches.', 'rm');
  }
  return null;
}

const SHARED_BRANCHES = /^(?:[^:]+:)?(?:refs\/heads\/)?(main|master|trunk|production|prod|release)$/;

// The subcommand of a git line, skipping options that take a value (git -C dir push).
function gitSubcommand(args) {
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (['-C', '-c', '--git-dir', '--work-tree', '--namespace'].includes(arg)) i++;
    else if (!arg.startsWith('-')) return { sub: arg, rest: args.slice(i + 1) };
  }
  return { sub: '', rest: [] };
}

function ruleGit(cmd) {
  if (cmd.name !== 'git') return null;
  const { sub, rest } = gitSubcommand(cmd.args);
  const { short, long, operands } = parseArgs(rest);

  if (sub === 'push' && (short.has('f') || long.has('force'))) {
    if (operands.some((o) => SHARED_BRANCHES.test(o))) {
      return result('git-force-push-shared', 'danger', 'Force-pushing to a shared branch rewrites history that other people already have.', 'git');
    }
    return result('git-force-push', 'caution', 'Force-pushing rewrites the history on the remote.', 'git');
  }

  if (sub === 'reset' && long.has('hard')) {
    return result('git-reset-hard', 'caution', 'A hard reset throws away every uncommitted change.', 'git');
  }

  if (sub === 'clean' && short.has('f') && !short.has('n') && !long.has('dry-run')) {
    return result('git-clean', 'caution', 'This deletes every file git is not tracking, and there is no undo.', 'git');
  }

  if ((sub === 'checkout' || sub === 'restore') && operands.some((o) => o === '.' || o === ':/')) {
    return result('git-discard-all', 'caution', 'This discards your uncommitted changes in every file.', 'git');
  }

  return null;
}

function ruleDisk(cmd) {
  if (cmd.name === 'dd' && cmd.args.some((a) => /^of=\/dev\//.test(a))) {
    return result('dd-device', 'danger', 'This writes raw bytes straight onto a disk. The wrong target destroys everything on it.', 'dd');
  }
  if (cmd.name.startsWith('mkfs') || cmd.name.startsWith('newfs')) {
    return result('format-disk', 'danger', 'This formats a disk and erases what was on it.', cmd.name);
  }
  if (cmd.name === 'diskutil' && cmd.args.some((a) => /^(eraseDisk|eraseVolume|partitionDisk|reformat|secureErase|zeroDisk|randomDisk)$/i.test(a))) {
    return result('format-disk', 'danger', 'This erases or repartitions a disk.', 'diskutil');
  }
  return null;
}

const WORLD_WRITABLE = /^(?:0?777|[ugoa]*[+=]rwx|[ugoa]*\+w|a=rwx)$/;

function rulePermissions(cmd) {
  if (cmd.name !== 'chmod' && cmd.name !== 'chown') return null;
  const { short, long, operands } = parseArgs(cmd.args);
  const recursive = short.has('R') || long.has('recursive');
  if (!recursive || operands.length < 2) return null;

  const [spec, ...targets] = operands;
  if (cmd.name === 'chown' && targets.some(isSystemTarget)) {
    return result('chown-system', 'danger', 'Changing the owner of a whole system or home directory can lock you out of your own files.', 'chown');
  }
  if (cmd.name === 'chmod' && WORLD_WRITABLE.test(spec)) {
    if (targets.some(isSystemTarget)) {
      return result('chmod-system', 'danger', 'This lets everyone write to a whole system or home directory.', 'chmod');
    }
    return result('chmod-open', 'caution', 'This lets every user on the machine change everything under it.', 'chmod');
  }
  return null;
}

function rulePower(cmd) {
  if (['shutdown', 'reboot', 'halt', 'poweroff'].includes(cmd.name)) {
    return result('power-off', 'caution', 'This turns the machine off or restarts it, and unsaved work goes with it.', cmd.name);
  }
  return null;
}

const SHELLS = ['sh', 'bash', 'zsh', 'dash', 'ksh', 'fish'];
const DOWNLOADERS = ['curl', 'wget', 'fetch'];

// curl https://example.com/install.sh | sh
function rulePipeToShell(cmd, previous) {
  if (cmd.piped && previous && SHELLS.includes(cmd.name) && DOWNLOADERS.includes(previous.name)) {
    return result('pipe-to-shell', 'caution', 'This runs a script from the internet the moment it arrives, without you reading it first.', cmd.name);
  }
  // sh -c "$(curl ...)" does the same thing
  if (SHELLS.includes(cmd.name) && cmd.args[0] === '-c' && /^\$\(\s*(curl|wget)\b/.test(cmd.args[1] || '')) {
    return result('pipe-to-shell', 'caution', 'This runs a script from the internet the moment it arrives, without you reading it first.', cmd.name);
  }
  return null;
}

const SQL_CLIENTS = ['psql', 'mysql', 'mariadb', 'sqlite3', 'mongosh', 'sqlcmd'];

function ruleSql(cmd) {
  if (!SQL_CLIENTS.includes(cmd.name)) return null;
  const text = cmd.args.join(' ');
  if (/\bdrop\s+(database|schema)\b/i.test(text)) {
    return result('sql-drop-database', 'danger', 'This SQL drops a whole database.', cmd.name);
  }
  if (/\bdrop\s+table\b|\btruncate\s+(table\s+)?\w/i.test(text)) {
    return result('sql-drop-table', 'caution', 'This SQL removes a table or all of its rows.', cmd.name);
  }
  return null;
}

// Rules that look at the whole line, because the shell syntax gets in the way of reading it as words.
function judgeRaw(line) {
  if (/:\s*\(\s*\)\s*\{\s*:\s*\|\s*:\s*&\s*\}\s*;\s*:/.test(line)) {
    return result('fork-bomb', 'danger', 'This is a fork bomb. It starts copies of itself until the machine stops answering.', ':');
  }
  return null;
}

const PROTECTED_FILE = /(?:^|\/)\.(?:zshrc|zprofile|zshenv|bashrc|bash_profile|profile|gitconfig|npmrc|netrc)$|(?:^|\/)\.(?:ssh|aws|gnupg)\/|^\/etc\//;
const DISK_DEVICE = /^\/dev\/(?:r?disk|sd|nvme|hd)/;

// echo x > ~/.zshrc replaces the whole file. >> adds to the end, which is normal, so it is not flagged.
function ruleRedirect(cmd) {
  for (const { op, target } of cmd.redirects) {
    if (op !== '>') continue;
    if (DISK_DEVICE.test(target)) {
      return result('redirect-device', 'danger', 'This writes straight onto a disk.', 'redirect');
    }
    if (PROTECTED_FILE.test(target)) {
      return result('overwrite-config', 'caution', 'A single > replaces the whole file. Use >> to add to the end instead.', 'redirect');
    }
  }
  return null;
}

const RULES = [ruleRm, ruleGit, ruleDisk, rulePermissions, rulePower, rulePipeToShell, ruleSql, ruleRedirect];

// Returns null when the command looks fine, or { id, level, reason, command }.
function judge(line) {
  let worst = judgeRaw(String(line || ''));
  let previous = null;
  for (const segment of segments(line)) {
    const cmd = describe(segment);
    const before = previous;
    previous = cmd;
    if (!cmd.name && cmd.redirects.length === 0) continue;
    for (const rule of RULES) {
      let found = rule(cmd, before);
      if (!found) continue;
      // Running as root removes the safety net, so a caution becomes a danger.
      if (cmd.sudo && found.level === 'caution') found = { ...found, level: 'danger' };
      if (!worst || LEVELS[found.level] > LEVELS[worst.level]) worst = found;
    }
  }
  return worst;
}

module.exports = { judge, tokenize, segments, describe, parseArgs };
