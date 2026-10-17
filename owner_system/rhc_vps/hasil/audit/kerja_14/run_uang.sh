#!/bin/bash
# Agent 14 - UJI UANG: replay 6 periode dengan aturan keluar berbeda, lalu ARENA (aturan pemilik).
set -e
cd "$(dirname "$0")"
export AUDIT='{"latb":30,"entryLat":30,"keepNoAfter":true,"strictSnap":true,"lpAdjust":true,"fillOnTime":true,"gasUsd":0.06,"approveUsd":0.03,"worstOrder":true,"hz":324000,"failBuy":0.0185,"failSell":0.0054}'
V=$1                 # "" | trail15 | trail20 | trail30 | adapt
NM=${V:-dasar}
OUT=tr_$NM; mkdir -p $OUT
D=../../../data
run(){  # nama dir awal akhir model_idx
  local nm=$1 dir=$2 a=$3 b=$4 w=$5
  if [ "$w" = "0" ]; then
    X14=$V DANGER_FILE=danger_model_v3.json DANGER_TH=1.1 UP_TH=1 TP_UP=1 \
      node replay.js $D/$dir $a $b $OUT/$nm.jsonl auto 2>&1 | tail -1
  else
    X14=$V DANGER_FILE=wf_bahaya_W$w.json DANGER_TH=0.4 UP_FILE=wf_naik_W$w.json UP_TH=0.5 TP_UP=0.5 \
      node replay.js $D/$dir $a $b $OUT/$nm.jsonl auto 2>&1 | tail -1
  fi
}
run ags1   ags1   25872800 26225599 0
run ags4   ags4   40834000 41179599 1
run u_ds5d u_ds5d 55566162 56218961 2
run u_ds24 u_ds24 59886162 60750162 3
run m1     m1     61866030 63600000 4
run m2     m2     64401245 65698903 5
TRPRE=$OUT FEATOUT=feats_$NM.csv node build_feats2.js $D/ags1 $D/ags4 $D/u_ds5d $D/u_ds24 $D/m1 $D/m2 2>&1 | tail -2
FEATIN=feats_$NM.csv OUTF=scored_$NM.csv python arena_score.py
echo "SELESAI $NM"
