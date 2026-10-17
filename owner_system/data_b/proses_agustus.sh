#!/bin/bash
# Pipeline otomatis: tunggu kolektor selesai -> proses tiap jendela -> hapus data mentah -> arena final.
cd /c/Users/horii/rhc-quant/data_b
LOG=proses_agustus.log
say(){ echo "[$(date +%H:%M:%S)] $*" | tee -a $LOG; }

say "menunggu kolektor selesai..."
while true; do
  n=$(powershell.exe -NoProfile -Command "(Get-CimInstance Win32_Process -Filter \"Name='node.exe'\" | Where-Object { \$_.CommandLine -match 'collect\.js' }).Count" 2>/dev/null | tr -d '\r ')
  [ "$n" = "0" ] && break
  sleep 120
done
say "kolektor selesai. mulai proses."

export AUDIT='{"latb":30,"entryLat":30,"keepNoAfter":true,"strictSnap":true,"lpAdjust":true,"fillOnTime":true,"gasUsd":0.06,"approveUsd":0.03,"worstOrder":true,"hz":324000}'
export DANGER_FILE=danger_model_baru.json DANGER_TH=0.4 UP_FILE=pnaik_model.json UP_TH=0.5

for d in arena/w0*; do
  nm=$(basename $d)
  [ -f "$d/trades.jsonl" ] && { say "$nm sudah diproses, lewat"; continue; }
  [ -f "$d/swaps.csv" ] || { say "$nm tidak ada data, lewat"; continue; }
  say "=== $nm: urutkan & buang duplikat"
  (head -1 $d/pools.csv; tail -n +2 $d/pools.csv | awk -F, '!s[$1]++') > $d/p.tmp && mv $d/p.tmp $d/pools.csv
  (head -1 $d/liq.csv; tail -n +2 $d/liq.csv | LC_ALL=C sort -t, -k1,1 -k2,2n -k3,3n -u) > $d/l.tmp && mv $d/l.tmp $d/liq.csv
  (head -1 $d/swaps.csv; tail -n +2 $d/swaps.csv | LC_ALL=C sort -t, -k1,1 -k2,2n -k3,3n -u) > $d/swaps_sorted.csv
  rng=$(awk -F, 'NR>1{if($2<mn||mn==""){mn=$2};if($2>mx)mx=$2} END{print mn, mx}' $d/swaps_sorted.csv)
  set -- $rng
  say "$nm: blok $1-$2, replay strategi final"
  (cd ../scripts && node replay.js ../data_b/$d $1 $2 ../data_b/$d/trades.jsonl auto 2>&1 | tail -1 >> ../data_b/$LOG)
  n=$(grep -c '"plan":"v4"' $d/trades.jsonl 2>/dev/null || echo 0)
  say "$nm: $n trade v4"
  node extract_m1.js $d 2>>$LOG
  node fetch_tr.js $d 2>>$LOG | tail -1
  OUT=$d/dev_creator node dev_creator_m.js $d 2>>$LOG | tail -1
  cp $d/dev_creator.json $d/dev_creator.json 2>/dev/null
  say "$nm: hapus data mentah (hemat disk)"
  rm -f $d/swaps.csv $d/swaps_sorted.csv $d/liq.csv
  say "$nm SELESAI. sisa disk: $(df -h /c | tail -1 | awk '{print $4}')"
done

say "=== bangun fitur gabungan (Agustus + September)"
node build_feats2.js arena/w01_ags01 arena/w02_ags07 arena/w03_ags13 arena/w04_ags18 arena/w05_ags24 arena/w06_ags30 arena/w07_sep05 m1 m2 2>&1 | tail -2 >> $LOG
say "=== skor ML kausal (model belajar dari nol, tidak boleh lihat masa depan)"
python arena_score.py 2>&1 | tail -1 >> $LOG
say "=== ARENA FINAL"
for m in 5 10 15; do
  echo "--- slot $m ---" >> $LOG
  MAXPOS=$m QTHR=0.90 SLIP=1 node arena.js 2>&1 | grep -E "^peluang|^win|^akun|^  |^TRADE|^catatan" >> $LOG
done
say "SEMUA SELESAI"
