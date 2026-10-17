#!/bin/bash
# UJI STANDAR satu varian (dipakai semua agent). Tidak menyentuh bot/trades.jsonl asli.
# Pakai: VAR=nama [EXTRA=',"opsiAudit":nilai'] [ENGINE=.../replay.exe] [ARENA=arena.js] [SCORER=arena_score_of.py] [ARENA_ENV="X=1 Y=2"] [SEEDS="0 1 2"] bash uji_varian.sh
#  - Ags-Sep: uji maju penuh (model keluar per tahap dari periode sebelumnya), skor ML kausal, akun $100.
#  - Oktober: holdout BEKU (model keluar & filter live 17 Sep), akun $100, Kelly mulai dari nol.
# Pembanding (VAR=par): Ags-Sep s0 $11.372,92 | s1 $14.920,09 | s2 $12.533,13 | Okt $208,70
set -e
cd /c/Users/horii/rhc-quant/data_b
VAR=${VAR:?VAR wajib}; EXTRA=${EXTRA:-}; ARENA=${ARENA:-arena.js}; SCORER=${SCORER:-arena_score_of.py}; SEEDS=${SEEDS:-"0 1 2"}
ENGINE=${ENGINE:-/c/Users/horii/rhc-quant/rust/port_engine/target/release/replay.exe}
export AUDIT='{"latb":30,"entryLat":30,"keepNoAfter":true,"strictSnap":true,"lpAdjust":true,"fillOnTime":true,"gasUsd":0.06,"approveUsd":0.03,"worstOrder":true,"hz":324000,"failBuy":0.0185,"failSell":0.0054'"$EXTRA"'}'
if [ "$SKIP_REPLAY" != "1" ]; then
  VAR=$VAR EXTRA="$EXTRA" ENGINE=$ENGINE bash wf_rust.sh > uji_$VAR.replay.log 2>&1
  (cd ../rhc_vps/pipeline && DANGER_TH=0.4 UP_TH=0.5 TP_UP=0.5 DANGER_FILE=../bot/danger_model.json UP_FILE=../bot/pnaik_model.json $ENGINE ../../data_b/okt1 77491976 78519175 ../../data_b/okt1/trades_$VAR.jsonl auto >> ../../data_b/uji_$VAR.replay.log 2>&1)
  python feats_var.py $VAR >/dev/null; python feats_var_okt.py $VAR >/dev/null
fi
STD="MAXPOS=10 QTHR=0.90 SLIP=1 EXPMAX=0.5 REM=1 LPCAP=0.01"
fmt(){ grep -E "^peluang|^win|^akun" | tr '\n' ' ' | sed -E 's/peluang [0-9]+ \| //; s/\| tutup [0-9]+ \|//; s/lewat jalur roket 0 \| jalur sepi 0 \| rem rezim 0//; s/rug dimakan \(ret<0,3\)/rug/; s/\([0-9.-]+%\) //; s/\| kill tidak//'; }
echo "=== VARIAN $VAR  EXTRA=[$EXTRA]  ARENA_ENV=[$ARENA_ENV]"
for s in $SEEDS; do
  SEED=$s FE_MODE=base INF=arena_feats_$VAR.csv OUTF=sc_${VAR}_s$s.csv python $SCORER >/dev/null
  echo "Ags-Sep s$s: $(env $STD $ARENA_ENV TRF=trades_$VAR.jsonl SCORED=sc_${VAR}_s$s.csv node $ARENA 2>&1 | fmt)"
done
THR=$(python -c "import json;print(json.load(open('../rhc_vps/bot/filter_cat.json'))['thr_start'])")
echo "OKTOBER   : $(env $STD $ARENA_ENV TRF=trades_$VAR.jsonl SCORED=arena_scored_okt_$VAR.csv THR0=$THR DEVPRE=arena_feats_$VAR.csv node $ARENA 2>&1 | fmt)"
