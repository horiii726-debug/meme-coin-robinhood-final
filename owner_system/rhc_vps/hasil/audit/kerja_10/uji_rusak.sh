#!/bin/bash
# uji_rusak.sh <nama> <perintah perusak>
cd /c/Users/horii/rhc-quant/rhc_vps/hasil/audit/kerja_10; B=bot_salinan
rm -rf $B/store; cp -r cadangan/store $B/; cp cadangan/{state.json,trades.jsonl,dev_history.json,decisions.jsonl,account.json} $B/
: > $B/live.log
eval "$2"
powershell -ExecutionPolicy Bypass -File mulai.ps1 >/dev/null
sleep 14
PID=$(cat pid_bot.txt); HIDUP=$(powershell -Command "if (Get-Process -Id $PID -ErrorAction SilentlyContinue) {'HIDUP'} else {'MATI'}")
echo "== $1: proses $HIDUP | $(grep -h 'putar ulang\|FATAL' $B/live.log | head -2 | cut -c1-160) | err: $(tail -2 $B/run_err.log | grep -v parity | cut -c1-200)"
powershell -Command "Stop-Process -Id $PID -Force -ErrorAction SilentlyContinue"
