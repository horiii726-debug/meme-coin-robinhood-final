#!/bin/bash
# catat tiap 10 dtk: pid bot, umur status.json, lag
cd /c/Users/horii/rhc-quant/rhc_vps/hasil/audit/kerja_10; B=bot_salinan
while [ ! -f stop_pantau ]; do
  P=$(powershell -NoProfile -Command "(Get-CimInstance Win32_Process -Filter \"Name='node.exe'\" | Where-Object { \$_.CommandLine -match 'paper_live\.js' }).ProcessId -join ','")
  U=$(( $(date +%s) - $(stat -c %Y $B/status.json 2>/dev/null || echo 0) ))
  L=$(node -e "try{const s=require('./$B/status.json');console.log(s.lag_blocks,s.uptime_min)}catch(e){console.log('-')}")
  echo "$(date +%T) pid=$P umur_status=${U}s lag/uptime=$L cfg=$(cat mock_cfg.json | tr -d '\n' | cut -c1-120)" >> pantau.log
  sleep 10
done
