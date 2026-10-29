# Wraith: a ghost that possesses your zsh.
# Add one line to ~/.zshrc (run `wraith init` to see it):  source "/path/to/wraith/shell/wraith.zsh"
#
# What it does, and only this:
#   - after a command, it may ask the local model for one whispered line, in the background
#   - before a risky command runs, it shows a warning and asks (Enter means no)
# It never runs anything the model wrote, never sends command output anywhere, and stores no files.
# If anything is missing or breaks, it steps aside and your shell works as before.

# Only inside an interactive shell. WRAITH_FORCE=1 is for tests.
[[ -o interactive || -n $WRAITH_FORCE ]] || return 0

# Do not load twice.
(( ${+functions[_wraith_precmd]} )) && return 0

typeset -g _wraith_root="${${(%):-%x}:A:h:h}"
typeset -g WRAITH_BIN="${WRAITH_BIN:-$_wraith_root/bin/wraith}"

if [[ ! -x $WRAITH_BIN ]] || ! (( ${+commands[node]} )); then
  print -u2 -- "wraith: cannot find node or $WRAITH_BIN, so the wraith stays asleep."
  return 0
fi

source "${${(%):-%x}:A:h}/wraith-core.zsh"
zmodload zsh/datetime 2>/dev/null
autoload -Uz add-zsh-hook

typeset -gi _wraith_on=1
typeset -g _wraith_cmd=''
typeset -gi _wraith_start=0
typeset -gx WRAITH_LOADED=1

# ---- Before a command runs: remember it and when it started ----
_wraith_preexec() {
  _wraith_cmd=$1
  _wraith_start=$EPOCHSECONDS
}

# ---- After a command: maybe ask for a whisper, in the background ----
# This must be the first precmd function, or $? is no longer the command's exit code.
_wraith_precmd() {
  local code=$?
  [[ -n $_wraith_cmd ]] || return 0
  local cmd=$_wraith_cmd
  local secs=$(( EPOCHSECONDS - _wraith_start ))
  _wraith_cmd=''

  _wraith_track $code "$cmd"
  (( _wraith_on )) || return 0
  [[ $cmd == wraith || $cmd == wraith\ * ]] && return 0

  local hour
  strftime -s hour '%H' $EPOCHSECONDS
  hour=$(( 10#$hour ))
  _wraith_wants $code $secs "$cmd" $hour || return 0

  local colour=0
  [[ -t 1 ]] && colour=1

  local fd
  exec {fd}< <(
    FORCE_COLOR=$colour COLUMNS=$COLUMNS "$WRAITH_BIN" whisper \
      --level "$WRAITH_LEVEL" --exit "$code" --seconds "$secs" --streak "$_wraith_streak" \
      --cwd "${PWD:t}" --hour "$hour" -- "${cmd[1,400]}" 2>/dev/null
  )
  zle -F $fd _wraith_handler 2>/dev/null || exec {fd}<&-
  return 0
}

# ---- A whisper arrives while you sit at the prompt: print it above the prompt, then redraw ----
_wraith_handler() {
  local fd=$1 line=''
  [[ -z $2 || $2 == hup ]] && IFS= read -r -u $fd line
  zle -F $fd
  exec {fd}<&-
  if [[ -n $line ]]; then
    zle -I
    print -r -- "$line"
    zle reset-prompt
  fi
}

# ---- Before a risky command runs: the gate ----
_wraith_accept_line() {
  if (( _wraith_on )) && [[ -n $BUFFER ]] && _wraith_coarse "$BUFFER"; then
    local colour=0 card
    [[ -t 1 ]] && colour=1
    if card=$(FORCE_COLOR=$colour COLUMNS=$COLUMNS "$WRAITH_BIN" gate -- "$BUFFER" 2>/dev/null) && [[ -n $card ]]; then
      zle -I
      print -r -- "$card"
      local key='' saved=''
      print -Pn -- '%F{214}  Let it run? [y/N] %f'
      # Ask for one key press, with no waiting for Enter and no echo. Set the terminal mode ourselves,
      # because inside a widget zsh may have left it waiting for a whole line.
      saved=$(stty -g 2>/dev/null </dev/tty)
      [[ -n $saved ]] && stty -icanon -echo min 1 time 0 2>/dev/null </dev/tty
      read -k 1 -t 10 key
      [[ -n $saved ]] && stty "$saved" 2>/dev/null </dev/tty
      print
      if [[ $key != [yY] ]]; then
        print -P -- '  %F{141}☾%f %F{245}it stays where it is. (edit it, or press Enter to ask again)%f'
        zle reset-prompt
        return 0
      fi
    fi
  fi
  zle .accept-line
}

# ---- `wraith on`, `wraith off`, `wraith level`: these change this shell, so the shell must handle them ----
wraith() {
  case $1 in
    on)
      _wraith_on=1
      print -P -- '  %F{141}☾%f the wraith wakes.'
      ;;
    off)
      _wraith_on=0
      print -P -- '  %F{141}☾%f the wraith sleeps. (wraith on, to wake it)'
      ;;
    level)
      if [[ -z $2 ]]; then
        print -r -- "$WRAITH_LEVEL"
      elif [[ $2 == (quiet|normal|chatty) ]]; then
        WRAITH_LEVEL=$2
        print -P -- "  %F{141}☾%f level: $2"
      else
        print -u2 -- 'wraith: level must be quiet, normal or chatty.'
        return 2
      fi
      ;;
    *)
      command "$WRAITH_BIN" "$@"
      ;;
  esac
}

# Our precmd goes first. The gate wraps accept-line only when there is a line editor.
add-zsh-hook preexec _wraith_preexec
precmd_functions=(_wraith_precmd ${precmd_functions:#_wraith_precmd})
if [[ -o zle ]]; then
  zle -N accept-line _wraith_accept_line
fi
