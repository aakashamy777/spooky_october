# Measurements

Everything here came from running the code on one machine on 31 October 2026. Nothing is estimated. It is one laptop and small samples, so read it as "what I saw", not as a benchmark.

**Machine:** Apple M3, 8 GB memory, macOS. **Model:** `gemma3:4b` through Ollama, Q4 build as pulled by `ollama pull gemma3:4b`.

## Whisper quality and speed

Command: `npm run measure 3` (ten sample events, three runs each, so 30 whispers; the model was already loaded).

```
First request of the session (includes any model load): 3548 ms
Lines accepted by the grounding check: 29 of 30
Needed a second try (first line rejected): 2 of 30
Latency per whisper, including retries: median 3689 ms, p90 5285 ms, max 8897 ms
Rejections by kind: {"numbers":3,"gave up: UNGROUNDED":1}
```

- A whisper is one model call (about 2 to 2.5 seconds on its own), plus a second call when the first line fails the check. The whisper arrives above the prompt in the background, so it never delays a prompt.
- When the check rejects both tries, the hand-written omen is shown instead. That happened once in 30.
- All three rejections in that run were invented or miscounted numbers. The check compares every digit and spelled-out number with the real facts.

## Cold start

The first request after the model had been unloaded took about 10.8 seconds (8.7 seconds of that was loading the model). This was a single observation. Whispers give up after 8 seconds and use an omen, so a whisper right after a long idle spell is usually an omen. `wraith ofrenda` waits up to 30 seconds because you asked for it.

## What I found while measuring

These are the three things the measuring turned up, in the order they happened:

1. **The check had a hole.** In the first run, "Thirty one seconds" and "Twenty-two seconds" were accepted as grounded when the real times were 310 and 52 seconds, because only spelled-out numbers up to twelve were checked. Fixed: teens, tens and two-part numbers are now read as the numbers they are. Acceptance in my development runs went 26 of 30, then 27 of 30, then 29 of 30 as I fixed this and the next item (those earlier runs used a scratch copy of the same ten events).
2. **The model fixated on one image.** After I told it to use "candles, doors, dust, echoes", nearly every line was "Dust motes dance in the failing light." Fix: each call is given one random image and one tone, and told to use at most one fact.
3. **Repeated numbers are not everything.** Some accepted lines say things that are true in form but invented in meaning, such as "seven installations" for a tool named bower. The check catches numbers, names, claims of action and instructions. It does not catch every invented detail, and I do not claim it does.

## Tests

`npm test` runs 200 tests in about 15 seconds. They need no network and no model. One of them starts a real interactive zsh and drives the hook through `expect`.

## What I did not measure

- Other Macs, Linux, Windows, bash, fish.
- Memory use while the model is loaded (it is about 3 GB for the weights).
- Any run with the network switched off.
- Any user other than me.
