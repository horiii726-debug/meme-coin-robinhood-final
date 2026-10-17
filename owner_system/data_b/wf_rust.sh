#!/bin/bash
# Uji maju penuh dengan MESIN RUST. VAR = nama varian, EXTRA = tambahan AUDIT (mis. ,"momMin":10)
# Model keluar tiap tahap = model uji maju lama (wf_*_W$i.json), dilatih hanya dari periode sebelumnya.
set -e
cd /c/Users/horii/rhc-quant/scripts
VAR=${VAR:-base}; EXTRA=${EXTRA:-}
export AUDIT='{"latb":30,"entryLat":30,"keepNoAfter":true,"strictSnap":true,"lpAdjust":true,"fillOnTime":true,"gasUsd":0.06,"approveUsd":0.03,"worstOrder":true,"hz":324000,"failBuy":0.0185,"failSell":0.0054'"$EXTRA"'}'
R=${ENGINE:-/c/Users/horii/rhc-quant/rust/port_engine/target/release/replay.exe}
P=( "ags1 25872800 26225599" "ags4 40834000 41179599" "u_ds5d 55566162 56218961" "u_ds24 59886162 60750162" "m1 61866030 63600000" "m2 64401245 65698903" )
for i in "${!P[@]}"; do
  set -- ${P[$i]}; dir=$1; a=$2; b=$3
  if [ $i -eq 0 ]; then
    DANGER_FILE=danger_model_v3.json DANGER_TH=1.1 UP_TH=1 TP_UP=1 $R ../data_b/$dir $a $b ../data_b/$dir/trades_$VAR.jsonl auto 2>&1 | tail -1
  else
    DANGER_FILE=wf_bahaya_W$i.json DANGER_TH=0.4 UP_FILE=wf_naik_W$i.json UP_TH=0.5 TP_UP=0.5 $R ../data_b/$dir $a $b ../data_b/$dir/trades_$VAR.jsonl auto 2>&1 | tail -1
  fi
done
