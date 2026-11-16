#!/bin/zsh
# usage: tx.sh '<keys, printf escapes allowed>' [wait_seconds]   send keys through bridge.py, then print the new console output (macOS stat)
D=${0:A:h}; before=$(stat -f %z $D/console.log)
printf "$1" > $D/tx; sleep ${2:-2}
tail -c +$((before+1)) $D/console.log | tr -d '\0' | sed 's/\x1b\[2J//g' | tr '\r' '\n' | grep -v '^ *[0-9]*%$' | grep -v '^ *$'
