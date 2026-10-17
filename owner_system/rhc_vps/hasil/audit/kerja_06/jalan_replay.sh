#!/bin/bash
# AUDIT06: replay 6 periode BERURUTAN (bukan paralel) dengan AUDIT dasar wf_penuh.sh + opsi tambahan.
# pakai: bash jalan_replay.sh <run_dir> '<json opsi tambahan>' [latb]
K=/c/Users/horii/rhc-quant/rhc_vps/hasil/audit/kerja_06; D=/c/Users/horii/rhc-quant/rhc_vps/data
RUN=$K/$1; EXTRA=${2:-"{}"}; LAT=${3:-30}
BASE="{\"latb\":$LAT,\"entryLat\":$LAT,\"keepNoAfter\":true,\"strictSnap\":true,\"lpAdjust\":true,\"fillOnTime\":true,\"gasUsd\":0.06,\"approveUsd\":0.03,\"worstOrder\":true,\"hz\":324000,\"failBuy\":0.0185,\"failSell\":0.0054}"
export AUDIT=$(node -e "console.log(JSON.stringify(Object.assign(JSON.parse(process.argv[1]),JSON.parse(process.argv[2]))))" "$BASE" "$EXTRA")
echo "AUDIT=$AUDIT" > $RUN.log
P=( "ags1 ags1 25872800 26225599" "ags4 ags4 40834000 41179599" "ds5d u_ds5d 55566162 56218961" "ds24 u_ds24 59886162 60750162" "m1 m1 61866030 63600000" "m2 m2 64401245 65698903" )
cd $K/pipeline
for i in "${!P[@]}"; do
  set -- ${P[$i]}; nm=$1; dir=$2; a=$3; b=$4; mkdir -p $RUN/$dir
  t0=$(date +%s)
  if [ $i -eq 0 ]; then
    EVT=$RUN/$dir/events.jsonl DANGER_FILE=danger_model_v3.json DANGER_TH=1.1 UP_TH=1 TP_UP=1 node replay.js $D/$dir $a $b $RUN/$dir/trades.jsonl auto 2>&1 | tail -1 >> $RUN.log
  else
    EVT=$RUN/$dir/events.jsonl DANGER_FILE=wf_bahaya_W$i.json DANGER_TH=0.4 UP_FILE=wf_naik_W$i.json UP_TH=0.5 TP_UP=0.5 node replay.js $D/$dir $a $b $RUN/$dir/trades.jsonl auto 2>&1 | tail -1 >> $RUN.log
  fi
  echo "$nm selesai $(( $(date +%s)-t0 )) dtk" >> $RUN.log
done
echo SELESAI >> $RUN.log
