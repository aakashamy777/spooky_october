'use strict';

// The model only gets to add flavour. These checks look for anything it added that is not a fact:
// numbers, names, claims of actions, instructions, and unsafe talk. If a line fails, it is not shown.

// Phrases that say the wraith or the command did something we cannot know about.
const CLAIMS = [
  /\bI (?:have |had |just )?(?:deleted|removed|erased|fixed|ran|run|executed|stopped|killed|blocked|prevented|saved|restored)\b/i,
  /\b(?:has|have|had|was|were) (?:been )?(?:deleted|removed|erased|destroyed|wiped|corrupted)\b/i,
  /\b(?:your|all|every) (?:files?|data|work|disk|system|computer|history|projects?) (?:is|are|was|were) (?:gone|lost|destroyed|deleted|wiped)\b/i,
];

// The wraith never tells anyone what to type.
const INSTRUCTIONS = [/`/, /\bsudo\b/i, /\byou (?:should|must|need to)\b/i, /\b(?:try|run|type|use) (?:the |this |that )?(?:command|following)\b/i];

// Things a ghost voice should never aim at a person.
const UNSAFE = [/\b(?:suicide|kill yourself|end your life|hurt yourself|self[- ]harm)\b/i];

const NUMBER_WORDS = {
  two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12,
  twice: 2, thrice: 3, dozen: 12, hundred: 100, thousand: 1000,
};

// Lowercase words, keeping apostrophes inside words ("shell's" -> "shell").
function wordsOf(text) {
  const words = String(text).toLowerCase().match(/[\p{L}\p{N}]+(?:['’][\p{L}]+)?/gu) || [];
  return words.map((w) => w.replace(/['’]s$/, '').replace(/['’]/g, ''));
}

function allowedWords(inputText) {
  return new Set(wordsOf(inputText));
}

function numbersOf(text) {
  // Digits with optional inner separators (1,000 or 3.5). A full stop at the end of a sentence is not part of it.
  return String(text).match(/\d+(?:[.,]\d+)*/g) || [];
}

// Numbers spelled out as words, as the digits they stand for.
function numberWordsOf(text) {
  const found = [];
  for (const word of wordsOf(text)) {
    if (Object.hasOwn(NUMBER_WORDS, word)) found.push({ word, value: NUMBER_WORDS[word] });
  }
  return found;
}

// Capitalised words in the middle of a sentence, which are usually names or places.
function midSentenceCapitals(text) {
  const found = [];
  const sentences = String(text).split(/(?<=[.!?])\s+|\n+/);
  for (const sentence of sentences) {
    const tokens = sentence.match(/[\p{L}][\p{L}'’-]*/gu) || [];
    tokens.slice(1).forEach((token) => {
      if (/^\p{Lu}/u.test(token) && token !== 'I' && !/^I['’]/.test(token)) {
        found.push(token.replace(/['’]s$/, ''));
      }
    });
  }
  return found;
}

// Return the things in `output` that do not come from `inputText` (the facts and the command).
function findUngrounded(output, inputText) {
  const allowed = allowedWords(inputText);
  const inputNumbers = new Set(numbersOf(inputText).map(Number));

  const numbers = [...new Set(numbersOf(output))]
    .filter((n) => !String(inputText).includes(n));
  for (const { word, value } of numberWordsOf(output)) {
    if (!inputNumbers.has(value)) numbers.push(word);
  }

  const names = [...new Set(midSentenceCapitals(output))]
    .filter((n) => !allowed.has(n.toLowerCase()));

  const claims = CLAIMS.filter((re) => re.test(output) && !re.test(inputText)).map((re) => output.match(re)[0]);
  const instructions = INSTRUCTIONS.filter((re) => re.test(output)).map((re) => output.match(re)[0]);
  const unsafe = UNSAFE.filter((re) => re.test(output)).map((re) => output.match(re)[0]);

  return {
    numbers, names, claims, instructions, unsafe,
    any: numbers.length + names.length + claims.length + instructions.length + unsafe.length > 0,
  };
}

const MAX_WHISPER_CHARS = 160;
const MAX_SENTENCES = 2;

// Tidy what the model wrote into one short plain line, or return null if it cannot be one.
function tidyWhisper(raw) {
  let text = String(raw || '')
    .replace(/[*_#>~]+/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^["“'‘]+|["”'’]+$/g, '')
    .trim();
  if (!text) return null;

  const sentences = text.match(/[^.!?]+[.!?]*/g) || [text];
  text = sentences.slice(0, MAX_SENTENCES).join('').trim();

  if (text.length > MAX_WHISPER_CHARS) return null;
  if (/[\u{1F300}-\u{1FAFF}☀-➿]/u.test(text)) return null; // the glyph is drawn by Wraith, not the model
  return text;
}

// One call that says whether a model line may be shown.
function checkWhisper(raw, factsInput) {
  const text = tidyWhisper(raw);
  if (!text) return { ok: false, text: null, problems: { empty: true } };
  const problems = findUngrounded(text, factsInput);
  return { ok: !problems.any, text, problems };
}

module.exports = { findUngrounded, checkWhisper, tidyWhisper, wordsOf, allowedWords, MAX_WHISPER_CHARS };
