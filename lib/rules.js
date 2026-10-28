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

// Break the tokens into simple commands. Each remembers whether it was fed by a pipe.
function segments(line) {
  const result = [];
  let current = [];
  let pipedFromPrevious = false;
  let nextPiped = false;

  const close = () => {
    if (current.length) result.push({ words: current, piped: pipedFromPrevious });
    current = [];
    pipedFromPrevious = nextPiped;
    nextPiped = false;
  };

  for (const token of tokenize(line)) {
    if (token.type === 'word') {
      current.push(token.value);
    } else {
      nextPiped = token.value === '|';
      close();
    }
  }
  close();
  return result;
}

// Wrapper commands, and which of their flags take a value (sudo -u someone rm ...).
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
  return { name, args: words.slice(1), sudo, piped: segment.piped };
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

const RULES = [ruleRm, ruleGit, ruleDisk, rulePermissions, rulePower];

// Returns null when the command looks fine, or { id, level, reason, command }.
function judge(line) {
  let worst = null;
  for (const segment of segments(line)) {
    const cmd = describe(segment);
    if (!cmd.name) continue;
    for (const rule of RULES) {
      let found = rule(cmd);
      if (!found) continue;
      // Running as root removes the safety net, so a caution becomes a danger.
      if (cmd.sudo && found.level === 'caution') found = { ...found, level: 'danger' };
      if (!worst || LEVELS[found.level] > LEVELS[worst.level]) worst = found;
    }
  }
  return worst;
}

module.exports = { judge, tokenize, segments, describe, parseArgs };
