'use strict';

// The model must only use what the user wrote. These checks catch details it made up:
// numbers, names and heavy claims (like how someone died) that are not in the input.

const SENSITIVE_PHRASES = [
  'heaven', 'angel', 'angels', 'watching over', 'watches over', 'smiling down',
  'rest in peace', 'passed away', 'passing', 'died', 'death', 'funeral', 'cancer',
  'illness', 'sickness', 'hospital', 'soul', 'spirit',
];

// Lowercase words, keeping apostrophes inside words ("grandma's" -> "grandma").
function wordsOf(text) {
  const words = String(text).toLowerCase().match(/[\p{L}\p{N}]+(?:['’][\p{L}]+)?/gu) || [];
  return words.map((w) => w.replace(/['’]s$/, '').replace(/['’]/g, ''));
}

// The set of every word the user gave us (including photo captions).
function allowedWords(inputText) {
  return new Set(wordsOf(inputText));
}

function numbersOf(text) {
  // Digits with optional inner separators (1,000 or 3.5). A full stop at the end of a sentence is not part of it.
  return String(text).match(/\d+(?:[.,]\d+)*/g) || [];
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

// Return the details in `output` that do not appear in `inputText`.
function findUngrounded(output, inputText) {
  const allowed = allowedWords(inputText);
  const inputLower = String(inputText).toLowerCase();
  const outputLower = String(output).toLowerCase();

  const numbers = [...new Set(numbersOf(output))]
    .filter((n) => !String(inputText).includes(n));

  const names = [...new Set(midSentenceCapitals(output))]
    .filter((n) => !allowed.has(n.toLowerCase()));

  const sensitive = SENSITIVE_PHRASES
    .filter((phrase) => outputLower.includes(phrase) && !inputLower.includes(phrase));

  return { numbers, names, sensitive, any: numbers.length + names.length + sensitive.length > 0 };
}

// Keep only list items (for the ofrenda) made of words the user actually wrote.
function groundItems(items, inputText) {
  const allowed = allowedWords(inputText);
  const kept = [];
  const dropped = [];

  for (const item of Array.isArray(items) ? items : []) {
    if (typeof item !== 'string') continue;
    const text = item.trim().slice(0, 60);
    if (!text) continue;
    const words = wordsOf(text).filter((w) => w.length >= 3);
    const allKnown = words.length > 0 && words.every((w) => allowed.has(w));
    (allKnown ? kept : dropped).push(text);
  }

  return { kept: [...new Set(kept)], dropped };
}

module.exports = { findUngrounded, groundItems, wordsOf, allowedWords };
