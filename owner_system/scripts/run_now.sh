#!/usr/bin/env bash
cd "$(dirname "$0")"
PY=/c/Users/horii/AppData/Local/Programs/Python/Python313/python.exe
LOG=run_now_status.txt
say(){ echo "[$(date +%H:%M:%S)] $*" | tee -a $LOG; }
say "menunggu deployer ds5d ..."
while ! grep -q "SELESAI" deploy5d.log 2>/dev/null; do sleep 30; done
say "deployer selesai: $(tail -1 deploy5d.log)"
rm -rf ds6d && mkdir -p ds6d
for f in pools liq; do head -1 ds24/$f.csv > ds6d/$f.csv; tail -n +2 ds5d/$f.csv >> ds6d/$f.csv; tail -n +2 ds24/$f.csv >> ds6d/$f.csv; done
head -1 ds24/deployers_bq.BACKUP.csv > ds6d/deployers_bq.csv
tail -n +2 ds5d/deployers_bq.csv >> ds6d/deployers_bq.csv
tail -n +2 ds24/deployers_bq.BACKUP.csv >> ds6d/deployers_bq.csv
say "gabung: $(($(wc -l < ds6d/pools.csv)-1)) pool, $(($(wc -l < ds6d/deployers_bq.csv)-1)) deployer"
{ tail -n +2 ds5d/swaps.csv; tail -n +2 ds24/swaps.csv; } | sort -t, -k1,1 -S 400M > ds6d/swaps_sorted.csv
say "sort: $(wc -l < ds6d/swaps_sorted.csv) swap"
W=600 HZ=36000 LAT=600 node --max-old-space-size=3000 build_stream.js ds6d >> $LOG 2>&1
say "fitur $(($(wc -l < ds6d/features.csv)-1)) | sim $(($(wc -l < ds6d/sim.csv)-1))"
FEAT=features.csv node --max-old-space-size=3000 mltable.js ds6d >> $LOG 2>&1
say "ml: $(($(wc -l < ds6d/ml.csv)-1)) baris"
"$PY" daily.py ds6d > daily_6d.txt 2>&1 && say "walk-forward per hari -> daily_6d.txt"
PERIOD=288000 "$PY" daily.py ds6d > daily_8h.txt 2>&1 && say "walk-forward per 8 jam -> daily_8h.txt"
"$PY" train.py ds6d > train_6d.txt 2>&1 && say "train -> train_6d.txt"
cp daily_6d.txt daily_8h.txt train_6d.txt /c/Users/horii/rhc-quant/ 2>/dev/null
mkdir -p /c/Users/horii/rhc-quant/data/ds6d && cp ds6d/features.csv ds6d/sim.csv ds6d/ml.csv ds6d/deployers_bq.csv /c/Users/horii/rhc-quant/data/ds6d/
say "SELESAI"
