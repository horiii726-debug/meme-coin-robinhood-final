#!/bin/bash
set -e
cd "$(dirname "$0")"
export AUDIT='{"latb":30,"entryLat":30,"keepNoAfter":true,"strictSnap":true,"lpAdjust":true,"fillOnTime":true,"gasUsd":0.06,"approveUsd":0.03,"worstOrder":true,"hz":324000,"failBuy":0.0185,"failSell":0.0054}'
export VARIAN='[{"nm":"base","minB":600},{"nm":"d900","minB":900},{"nm":"d1200","minB":1200},{"nm":"d1800","minB":1800},{"nm":"d3000","minB":3000},{"nm":"g600","minB":600,"lpGate":0.3},{"nm":"g1200","minB":1200,"lpGate":0.3},{"nm":"g1800","minB":1800,"lpGate":0.3},{"nm":"g3000","minB":3000,"lpGate":0.3}]'
run(){ nm=$1; dir=$2; a=$3; b=$4; dm=$5; up=$6; th=$7; upth=$8; tpup=$9
  echo "[$(date +%H:%M:%S)] $nm mulai"
  DANGER_FILE=$dm UP_FILE=$up DANGER_TH=$th UP_TH=$upth TP_UP=$tpup \
    node replay15.js ../../../data/$dir $a $b out/${nm}_%.jsonl auto 2>&1 | tail -2
  echo "[$(date +%H:%M:%S)] $nm selesai"
}
run ags1   ags1   25872800 26225599 danger_model_v3.json "" 1.1 1 1
run ags4   ags4   40834000 41179599 wf_bahaya_W1.json wf_naik_W1.json 0.4 0.5 0.5
run ds5d   u_ds5d 55566162 56218961 wf_bahaya_W2.json wf_naik_W2.json 0.4 0.5 0.5
run ds24   u_ds24 59886162 60750162 wf_bahaya_W3.json wf_naik_W3.json 0.4 0.5 0.5
run m1     m1     61866030 63600000 wf_bahaya_W4.json wf_naik_W4.json 0.4 0.5 0.5
run m2     m2     64401245 65698903 wf_bahaya_W5.json wf_naik_W5.json 0.4 0.5 0.5
echo "SEMUA SELESAI"
