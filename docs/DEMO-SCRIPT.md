# Demo script: about 85 seconds

Record the screen with macOS `Cmd+Shift+5`. One terminal window, large font (about 18 pt), dark background, nothing else on screen. Say the spoken lines in your own words; they are here so you know what each beat must show.

## Before you press record (3 minutes)

1. Open Ollama and warm the model so the first whisper is quick (it unloads after 10 idle minutes):
   `ollama run gemma3:4b "hello"` then `/bye`.
2. Make a throwaway folder so nothing real is touched:
   ```
   mkdir -p ~/wraith-demo && cd ~/wraith-demo && git init -q
   ```
3. Add the hook to a **test copy** of your shell, not your real `~/.zshrc`:
   ```
   export WRAITH_LEVEL=chatty        # the wraith speaks after every failure, so the recording is reliable
   source ~/Desktop/spooky_october/shell/wraith.zsh
   ```
   Say in the video or post that `chatty` was used for the demo. The default is `normal`, where a plain failure gets a whisper about 60% of the time.
4. Set a short prompt so lines do not wrap: `PROMPT='%F{214}%~%f ✦ '`
5. Run `clear`. Start recording.

## The beats

| Time | Type | What the viewer should see | Say |
| --- | --- | --- | --- |
| 0:00 | `wraith doctor` | Checks: node, ollama, model `gemma3:4b`, zsh, hook loaded | "This is plain zsh. Wraith is one line in my config, and a small local model, Gemma 3 4B, running on this laptop." |
| 0:10 | `gti status` | Command not found, then a whisper such as "gti is not here. Perhaps it never was." appears above the prompt | "A typo. The wraith notices." |
| 0:18 | `cat nothing.txt` three times | After the third, a whisper that mentions the repeat (the count comes from code, not the model) | "It counts repeats itself. The model only gets to dress up the facts." |
| 0:32 | `git push --force origin main` | The red-orange card: "the wraith bars the door", the reason, a line from the wraith, `Let it run? [y/N]`. Press **Enter**. | "This is the part I wanted. It steps in before the command runs." |
| 0:45 | Point at the prompt | The command is still in the buffer: "it stays where it is" | "Enter means no. Nothing ran. I can edit it or leave." |
| 0:50 | Clear the line (`Ctrl-U`), then `rm -rf /tmp/wraith-demo-old` | Yellow card, "the wraith stirs". Press **y**. A line from the wraith appears after it runs. | "Here I say yes. The folder does not exist, so nothing is lost." |
| 1:02 | `wraith ofrenda --history ~/Desktop/spooky_october/demo/history` | The altar draws: candles, one framed card each for gulp, python2, grunt, bower, heroku, with a line from Gemma | "For Día de los Muertos: an ofrenda for the commands I stopped using. This history is made up; I did not use real commands." |
| 1:20 | Stop | Hold on the altar for two seconds | "Open weights, on my laptop. Nothing is sent anywhere." |

The ofrenda takes about 20 seconds to draw while Gemma writes the lines. Either speed that part up when editing (say so on screen) or keep it real; do not cut the wait and call it instant.

## Things not to say

- Do not say it was tested offline or on Linux, Windows, bash or fish. It was not.
- Do not say it catches every risky command. It catches the patterns in `lib/rules.js` only.
- Do not say the whispers are always true. Gemma writes flavour, and the check does not catch everything.

## After recording

- Upload to YouTube (unlisted is fine) or to DEV directly, then paste the link where the post says `REPLACE-WITH-VIDEO-LINK`.
- Remove the demo hook: `wraith exorcise` shows what to delete, and `rm -rf ~/wraith-demo` removes the throwaway folder.
