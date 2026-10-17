#!/usr/bin/env bash
# PIPELINE OTOMATIS SEMALAM (v3 — streaming, hemat memori, aman di RAM 8 GB)
set -u
cd "$(dirname "$0")"
PY=/c/Users/horii/AppData/Local/Programs/Python/Python313/python.exe
STATUS=overnight_status.txt
say() { echo "[$(date +%H:%M:%S)] $*" | tee -a "$STATUS"; }
rows() { echo $(( $(wc -l < "$1" 2>/dev/null || echo 1) - 1 )); }

say "=== PIPELINE v3 (streaming) DIMULAI ==="
say "RAM sistem 7,9 GB -> semua langkah dibatasi heap <=3 GB"

# ---------- 1. tunggu kolektor (maks 6,5 jam) ----------
DEADLINE=$(( $(date +%s) + 23400 ))
while ! grep -q "SELESAI" collect5d.log 2>/dev/null; do
  [ "$(date +%s)" -ge "$DEADLINE" ] && { say "batas waktu — lanjut dengan data yang ada"; break; }
  sleep 120
done
CK=$(node -e 'try{const c=JSON.parse(require("fs").readFileSync("ds5d/checkpoint.json","utf8"));console.log(c.done.length)}catch(e){console.log(0)}')
say "kolektor: $CK / 3600 chunk | ds5d swaps $(ls -la ds5d/swaps.csv 2>/dev/null | awk '{printf "%.0f MB",$5/1048576}')"

# ---------- 2. gabung ----------
say "menggabungkan ds5d + ds24 -> ds6d"
rm -rf ds6d && mkdir -p ds6d
for f in pools liq; do
  head -1 ds24/$f.csv > ds6d/$f.csv
  tail -n +2 ds5d/$f.csv >> ds6d/$f.csv 2>/dev/null || true
  tail -n +2 ds24/$f.csv >> ds6d/$f.csv
done
cp eth_usd.json ds6d/ 2>/dev/null || true
say "ds6d: $(rows ds6d/pools.csv) pool, $(rows ds6d/liq.csv) event likuiditas"

# ---------- 3. sort swaps per pool (external sort, tidak makan RAM) ----------
say "mengurutkan swaps per pool_id (external sort) ..."
{ tail -n +2 ds5d/swaps.csv 2>/dev/null; tail -n +2 ds24/swaps.csv; } \
  | sort -t, -k1,1 -S 400M > ds6d/swaps_sorted.csv
say "swaps terurut: $(wc -l < ds6d/swaps_sorted.csv) baris"

# ---------- 4. fitur + simulasi (streaming) ----------
say "membangun fitur + simulasi (W=600 masuk menit-1, horizon 1 jam) ..."
W=600 HZ=36000 LAT=600 node --max-old-space-size=3000 build_stream.js ds6d >> "$STATUS" 2>&1
say "fitur: $(rows ds6d/features.csv) | simulasi: $(rows ds6d/sim.csv)"

# ---------- 5. deployer ----------
say "deployer: Bitquery utk rentang baru (realtime menjangkau ~4-5 hari) ..."
RANGE_FILE=range5d.txt OUT_CSV=ds5d/deployers_bq.csv STEP=288000 \
  node dev_bq.js >> "$STATUS" 2>&1 || say "dev_bq: sebagian rentang di luar jangkauan (diharapkan)"
head -1 ds24/deployers_bq.BACKUP.csv > ds6d/deployers_bq.csv
tail -n +2 ds5d/deployers_bq.csv >> ds6d/deployers_bq.csv 2>/dev/null || true
tail -n +2 ds24/deployers_bq.BACKUP.csv >> ds6d/deployers_bq.csv
say "deployer ds6d: $(rows ds6d/deployers_bq.csv) baris"

# ---------- 6. tabel ML ----------
say "membangun tabel ML ..."
FEAT=features.csv node --max-old-space-size=3000 mltable.js ds6d >> "$STATUS" 2>&1
say "tabel ML: $(rows ds6d/ml.csv) baris"

# ---------- 7. latih + audit ----------
say "melatih model ..."
"$PY" train.py ds6d > train_6d.txt 2>&1 && say "OK -> train_6d.txt" || say "GAGAL latih"
say "audit noise + stabilitas 10 seed ..."
"$PY" audit.py ds6d > audit_6d.txt 2>&1 && say "OK -> audit_6d.txt" || say "GAGAL audit"

# ---------- 8. stabilitas per hari ----------
say "uji stabilitas per hari ..."
"$PY" daily.py ds6d > daily_6d.txt 2>&1 && say "OK -> daily_6d.txt" || say "daily.py tidak ada / gagal"

# ---------- 9. ringkasan ----------
{
  echo "# RINGKASAN OTOMATIS — $(date '+%Y-%m-%d %H:%M')"
  echo
  echo "## Data"
  echo "- pool: $(rows ds6d/pools.csv)  (sebelumnya 15.582 di 24 jam)"
  echo "- swap: $(wc -l < ds6d/swaps_sorted.csv)"
  echo "- tabel ML: $(rows ds6d/ml.csv) baris  (sebelumnya 1.963)"
  echo "- deployer: $(rows ds6d/deployers_bq.csv)"
  echo
  echo "## Model"
  sed -n '1,200p' train_6d.txt 2>/dev/null
  echo
  echo "## Audit"
  sed -n '1,120p' audit_6d.txt 2>/dev/null
  echo
  echo "## Stabilitas per hari"
  sed -n '1,80p' daily_6d.txt 2>/dev/null
  echo
  echo "## Radar live (mode kertas)"
  echo "- sinyal tercatat: $(wc -l < radar_log.jsonl 2>/dev/null || echo 0)"
} > RINGKASAN_6HARI.md
say "=== PIPELINE SELESAI -> RINGKASAN_6HARI.md ==="
