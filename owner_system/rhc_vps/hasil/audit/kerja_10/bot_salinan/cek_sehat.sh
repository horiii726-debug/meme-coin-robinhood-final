#!/bin/bash
# DETEKSI BOT HANG (pengganti watchdog.ps1 di Windows). Pasang di cron tiap menit:
#   * * * * * /jalur/ke/bot/cek_sehat.sh >> /jalur/ke/bot/cek_sehat.log 2>&1
# pm2 sudah menghidupkan ulang kalau proses MATI. Skrip ini menangani yang lebih licik:
# proses HIDUP tapi tidak bekerja (status basi) atau tertinggal jauh dari ujung chain.
cd "$(dirname "$0")"
[ -f status.json ] || exit 0
umur=$(( $(date +%s) - $(stat -c %Y status.json) ))
lag=$(node -e 'try{console.log(JSON.parse(require("fs").readFileSync("status.json","utf8")).lag_blocks||0)}catch(e){console.log(0)}')
upt=$(node -e 'try{console.log(Math.floor(JSON.parse(require("fs").readFileSync("status.json","utf8")).uptime_min||0))}catch(e){console.log(0)}')
if [ "$umur" -gt 180 ]; then echo "[$(date -Is)] status basi ${umur} dtk -> restart"; pm2 restart rhc-paper; fi
if [ "$lag" -gt 20000 ] && [ "$upt" -gt 20 ]; then echo "[$(date -Is)] tertinggal ${lag} blok -> restart"; pm2 restart rhc-paper; fi
