# Wraith: the plain functions behind the shell hook. Sourcing this prints nothing and changes no shell options.
# shell/wraith.zsh wires them into zsh. They are kept apart so they can be tested without a terminal.

typeset -g WRAITH_LEVEL="${WRAITH_LEVEL:-normal}"
typeset -gi _wraith_streak=0
typeset -g _wraith_failed_cmd=''

# A cheap first look at a command line, in pure zsh, so ordinary commands never wake node.
# It must catch everything lib/rules.js can flag (a test checks that). Catching too much is fine:
# `wraith gate` makes the real decision.
typeset -g _wraith_coarse_re='(^|[;&|([:space:]])(sudo[[:space:]]+|doas[[:space:]]+)?rm[[:space:]].*(-[[:alnum:]]*[rR]|--recursive)'
_wraith_coarse_re+='|git[[:space:]].*(push|reset|clean|checkout|restore)'
_wraith_coarse_re+='|(^|[^[:alnum:]_./-])(dd|mkfs[.[:alnum:]_]*|newfs[[:alnum:]_]*|diskutil|chown|chmod|shutdown|reboot|halt|poweroff|psql|mysql[[:alnum:]_]*|mariadb|sqlite3|mongosh|sqlcmd)([[:space:]]|$)'
_wraith_coarse_re+='|\|[[:space:]]*((sudo|doas)[[:space:]]+)?(sh|bash|zsh|dash|ksh|fish)([[:space:]]|$)'
_wraith_coarse_re+='|(sh|bash|zsh|dash|ksh|fish)[[:space:]]+-c'
_wraith_coarse_re+='|>|:[[:space:]]*\(\)'

# 0 if the line might be risky.
_wraith_coarse() {
  [[ $1 =~ $_wraith_coarse_re ]]
}

# Keep count of the same command failing again and again. Ctrl-C (130) is not a failure.
_wraith_track() {
  local code=$1 cmd=$2
  if (( code != 0 && code != 130 )); then
    if [[ $cmd == $_wraith_failed_cmd ]]; then
      (( _wraith_streak++ ))
    else
      _wraith_streak=1
      _wraith_failed_cmd=$cmd
    fi
  else
    _wraith_streak=0
    _wraith_failed_cmd=''
  fi
}

# Should node be asked about this command at all? Returns 0 for yes.
# Node applies the real speaking policy (lib/policy.js); this only avoids waking it for boring commands.
# args: exit-code seconds command hour
_wraith_wants() {
  local code=$1 secs=$2 cmd=$3 hour=$4
  if [[ $WRAITH_LEVEL == quiet ]]; then
    (( _wraith_streak >= 3 )) && return 0
    _wraith_coarse "$cmd" && return 0
    return 1
  fi
  (( code != 0 )) && return 0          # failures, and Ctrl-C (node decides how often)
  (( secs >= 30 )) && return 0         # slow commands
  _wraith_coarse "$cmd" && return 0    # risky commands that ran
  local late=8 plain=20                # now and then, a remark about nothing at all
  [[ $WRAITH_LEVEL == chatty ]] && { late=3; plain=6 }
  (( hour < 5 )) && (( RANDOM % late == 0 )) && return 0
  (( RANDOM % plain == 0 )) && return 0
  return 1
}
