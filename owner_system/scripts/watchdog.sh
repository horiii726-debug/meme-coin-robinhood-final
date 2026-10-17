#!/usr/bin/env bash
# Hentikan kolektor SEBELUM pipeline mulai membaca, supaya tidak membaca file
# yang sedang ditulis. Pipeline batas 07:42; kolektor dihentikan 07:10.
cd "$(dirname "$0")"
TARGET=$(date -d "2026-09-13 07:10:00" +%s 2>/dev/null || echo 0)
if [ "$TARGET" = "0" ]; then TARGET=$(( $(date +%s) + 20400 )); fi   # fallback: 5h40m
while [ "$(date +%s)" -lt "$TARGET" ]; do
  if grep -q "SELESAI" collect5d.log 2>/dev/null; then
    echo "[$(date +%H:%M:%S)] kolektor selesai sendiri — watchdog tidak perlu bertindak" >> overnight_status.txt
    exit 0
  fi
  sleep 180
done
CK=$(node -e 'try{const c=JSON.parse(require("fs").readFileSync("ds5d/checkpoint.json","utf8"));console.log(c.done.length)}catch(e){console.log(0)}')
echo "[$(date +%H:%M:%S)] WATCHDOG: menghentikan kolektor di $CK/3600 chunk agar file stabil" >> overnight_status.txt
# hentikan proses collect.js saja
powershell.exe -NoProfile -Command "Get-CimInstance Win32_Process -Filter \"Name='node.exe'\" | Where-Object { \$_.CommandLine -like '*collect.js*' } | ForEach-Object { Stop-Process -Id \$_.ProcessId -Force }" 2>/dev/null
sleep 20
echo "[$(date +%H:%M:%S)] WATCHDOG: kolektor dihentikan, file ds5d stabil" >> overnight_status.txt
