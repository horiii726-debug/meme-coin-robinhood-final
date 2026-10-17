#!/bin/sh
# Uji maju otomatis: tunggu kolektor -> lengkapi potongan gagal -> urutkan -> putar ulang mesin -> laporan.
cd "$(dirname "$0")"
FROM=60750163; TO=61866033; DIR=dsfwd
until grep -q "^SELESAI" collect_fwd.log; do sleep 20; done
total=$(node -e "console.log(Math.ceil(($TO-$FROM+1)/1200))")
for round in 1 2 3 4 5 6 7 8; do
  done_n=$(node -e "console.log(JSON.parse(require('fs').readFileSync('$DIR/checkpoint.json')).done.length)")
  echo "putaran $round: $done_n/$total potongan" >> fwd_pipeline.log
  [ "$done_n" -ge "$total" ] && break
  PAR=2 node collect.js $FROM $TO $DIR >> collect_fwd_retry.log 2>&1
done
done_n=$(node -e "console.log(JSON.parse(require('fs').readFileSync('$DIR/checkpoint.json')).done.length)")
if [ "$done_n" -lt "$total" ]; then echo "DATA TIDAK LENGKAP $done_n/$total — berhenti" >> fwd_pipeline.log; exit 1; fi
LC_ALL=C sort -t, -k1,1 -s -S 1G $DIR/swaps.csv > $DIR/swaps_sorted.csv
echo "diurutkan" >> fwd_pipeline.log
node --max-old-space-size=4096 replay.js $DIR $FROM $TO fwd_trades.jsonl auto >> fwd_pipeline.log 2>&1
cp fwd_trades.jsonl C:/Users/horii/rhc-quant/live/fwd_trades.jsonl
node C:/Users/horii/rhc-quant/live/paper_report.js fwd_trades.jsonl "Uji maju v4 — data belum pernah dilihat (blok 60.750.163–61.866.033)" > C:/Users/horii/rhc-quant/FORWARD_TEST_RESULT.md
echo "PIPELINE SELESAI" >> fwd_pipeline.log
