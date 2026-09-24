#!/usr/bin/env bash
# Notification hook: desktop notice when Claude Code waits for you (plan approval,
# permission prompt). Best effort — silent if no notifier exists.
msg=$(node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{try{process.stdout.write(JSON.parse(s).message??"")}catch{}})')
msg="${msg:-Claude Code is waiting for you}"
{
  if command -v osascript; then osascript -e "display notification \"${msg//\"/}\" with title \"Claude Code · SmartReceipts\""
  elif command -v notify-send; then notify-send "Claude Code · SmartReceipts" "$msg"
  elif command -v powershell.exe; then powershell.exe -NoProfile -Command "[console]::beep(880,200)"
  fi
} >/dev/null 2>&1
exit 0
