'use strict';

const { generateJson } = require('./ollama');
const { captionPrompt, rememberPrompt } = require('./prompts');
const { findUngrounded, groundItems } = require('./grounding');

const FALLBACK_CAPTION = 'A photo you added.';

// A caption from the model may only describe what is visible. If it contains digits or names, do not trust it.
function safeCaption(text) {
  if (typeof text !== 'string') return FALLBACK_CAPTION;
  const caption = text.replace(/\s+/g, ' ').trim().slice(0, 140);
  if (!caption) return FALLBACK_CAPTION;
  const issues = findUngrounded(caption, '');
  if (issues.numbers.length > 0 || issues.names.length > 0) return FALLBACK_CAPTION;
  return caption;
}

// Split text into sentences, keep the ones that only use the writer's own details,
// and report the ones that were removed. If nothing is left, fall back to the writer's own memories.
function removeUngroundedSentences(text, inputText, fallbackText) {
  const sentences = String(text).match(/[^.!?]+(?:[.!?]+|$)/g) || [];
  const kept = [];
  const removed = [];

  for (const sentence of sentences) {
    const trimmed = sentence.trim();
    if (!trimmed) continue;
    (findUngrounded(trimmed, inputText).any ? removed : kept).push(trimmed);
  }

  if (kept.length === 0) {
    return { text: fallbackText, removed, usedFallback: true };
  }
  return { text: kept.join(' '), removed, usedFallback: false };
}

function describeProblems(issues) {
  return [...issues.numbers, ...issues.names, ...issues.sensitive];
}

async function writeDraft(form, captions, problems) {
  const answer = await generateJson({
    prompt: rememberPrompt(form, captions, problems),
    temperature: 0.4,
    numPredict: 800,
    timeoutMs: 150000,
  });

  const remembrance = typeof answer.remembrance === 'string' ? answer.remembrance.trim() : '';
  if (!remembrance) {
    throw new Error('The local model returned an empty remembrance. Please try again.');
  }

  return { remembrance: remembrance.slice(0, 1500), ofrendaItems: answer.ofrenda_items };
}

// Turn the user's words and photos into a remembrance. `onStep` tells the page what is happening.
async function buildRemembrance(form, onStep) {
  // 1. Photo captions: the user's own caption wins; otherwise the model describes only what is visible.
  const photos = [];
  for (let i = 0; i < form.photos.length; i++) {
    const photo = form.photos[i];
    if (photo.caption) {
      photos.push({ caption: photo.caption, source: 'you' });
      continue;
    }
    onStep(`Looking at photo ${i + 1} of ${form.photos.length}`);
    try {
      const answer = await generateJson({
        prompt: captionPrompt(),
        images: [photo.data],
        temperature: 0.2,
        numPredict: 120,
        timeoutMs: 90000,
      });
      photos.push({ caption: safeCaption(answer.caption), source: 'model' });
    } catch (err) {
      photos.push({ caption: FALLBACK_CAPTION, source: 'model' });
    }
  }

  // Only the writer's own words count as facts. A caption the model wrote about a photo is shown
  // beside the photo for them to edit, but it is not used as a fact in the remembrance.
  const writerCaptions = photos.filter((p) => p.source === 'you').map((p) => p.caption);

  // Everything the writer gave us. The remembrance may only use words from here.
  const inputText = [
    form.name, form.relation, form.years, form.favourites,
    ...form.memories,
    ...writerCaptions,
  ].filter(Boolean).join('. ');

  // 2. Write the remembrance, check it, and try once more if it invented something.
  onStep('Writing the remembrance');
  const captions = writerCaptions;
  let draft = await writeDraft(form, captions, null);
  let issues = findUngrounded(draft.remembrance, inputText);
  let retried = false;

  if (issues.any) {
    onStep('Checking the details against what you wrote');
    retried = true;
    try {
      const second = await writeDraft(form, captions, describeProblems(issues));
      const secondIssues = findUngrounded(second.remembrance, inputText);
      // Keep the second draft only if it is cleaner than the first.
      if (describeProblems(secondIssues).length <= describeProblems(issues).length) {
        draft = second;
        issues = secondIssues;
      }
    } catch (err) {
      // Keep the first draft and its warnings.
    }
  }

  // 3. If the model still added details the writer never gave, take those sentences out rather than keep them.
  let removedSentences = [];
  let usedFallback = false;
  if (issues.any) {
    const fallbackText = form.memories.length > 0 ? form.memories.join(' ') : `I remember ${form.name}.`;
    const cleaned = removeUngroundedSentences(draft.remembrance, inputText, fallbackText);
    draft.remembrance = cleaned.text;
    removedSentences = cleaned.removed;
    usedFallback = cleaned.usedFallback;
    issues = findUngrounded(draft.remembrance, inputText);
  }

  const items = groundItems(draft.ofrendaItems, inputText);

  return {
    title: `Remembering ${form.name}`,
    remembrance: draft.remembrance,
    removedSentences,
    usedFallback,
    ofrendaItems: items.kept,
    droppedItems: items.dropped,
    photos,
    warnings: describeProblems(issues),
    retried,
  };
}

module.exports = { buildRemembrance, safeCaption, removeUngroundedSentences };
