# Ofrenda

A small tool for building a remembrance page for someone you miss, using your own words and photos. A local open model (Gemma 3 through Ollama) helps write it. It runs on your own computer, and nothing is uploaded.

Made for the Hacktoberfest Open-Source AI Challenge, Week 4 ("Ghost in the Machine"). Día de los Muertos is about remembering people, and an ofrenda is the altar families build to do it. This tool helps you make a small one on a screen, for someone whose photos and stories you would rather keep private.

## What it does

1. You add a name, and optionally who they were to you, their years, and favourite things.
2. You write a few short memories in your own words (up to 8).
3. You can add up to 4 photos, each with your own caption.
4. The local model writes a short remembrance **using only what you wrote**.
5. You read it, edit anything, and add or remove items for the ofrenda.
6. You build the ofrenda page and download it as **one HTML file**. It has no scripts and makes no web requests, so it keeps working years from now, offline.

## Why it checks the model's work

A model asked to write about a real person wants to fill gaps: a birth year, a hometown, a cause of death, a quote. For a remembrance that is the worst thing it can do, because it puts invented memories next to real ones.

So the model's output is checked **in code**, not only by asking it nicely:

- Any number, name or place in the text that is not in what you wrote is flagged.
- Heavy claims you did not make (heaven, "passed away", illness, "watching over us") are flagged.
- If the first draft contains such details, the model is asked once more. If they are still there, **those sentences are removed**, the page tells you what was removed, and if nothing is left your own memories are used instead.
- Items for the ofrenda are kept only if every word of them appears in what you wrote.
- A caption the model writes about a photo is shown beside the photo for you to edit. It is never used as a fact in the remembrance.
- The title is fixed ("Remembering <name>") instead of left to the model.

## Why a local open model

- The memories, names and family photos stay on your computer. A hosted model would receive every one of them.
- It works with the internet off.
- The finished page does not depend on any service. Nothing can shut down and take it with it.
- There is no per-use cost, and the model can be swapped by changing one setting.

## Setup

1. Install [Ollama](https://ollama.com) and open it.
2. Pull the model: `ollama pull gemma3:4b`
3. Install and start:

```bash
npm install
npm start
```

4. Open http://127.0.0.1:3000. The pill at the top should say "Local model ready: gemma3:4b".

To use another model: `OFRENDA_MODEL=name:tag npm start`. Needs Node 18 or newer.

Writing a remembrance takes about a minute on a laptop (the first run is slower while the model loads).

## Tests

```bash
npm test
```

29 tests cover the input checks, the checks on the model's text, the sentence removal, and the page builder (including hostile names, captions and items that must stay inert text).

## Security notes

- The server only listens on `127.0.0.1`.
- All text from you or the model is inserted into pages as plain text, never as HTML.
- The preview runs in a sandboxed frame with scripts off.
- The downloaded page has no scripts and no web addresses. Photos are embedded.

## Known limits

- The checks catch invented **numbers, names, places and heavy claims**. They do not catch every invented detail, so you must read the result. A sentence like "she always hummed in the kitchen" would pass if it only uses words you wrote elsewhere.
- Removing a sentence can leave the text a little choppy. That is a deliberate trade: choppy and true over smooth and invented.
- A 4B model describes photos roughly. In my testing it miscounted objects, which is why its captions are editable and labelled.
- It does not identify people in photos and is told not to.
- Photos must be JPEG or PNG. HEIC files from some phones cannot be opened by the browser.
- Nothing is saved on the server. Closing the page loses the text unless you download the file.
- Tested on macOS with Node 22. I have not tested Windows or Linux.

## Licence

MIT
