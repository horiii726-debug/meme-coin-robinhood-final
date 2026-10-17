#!/bin/bash
# AUDIT16: replay 9 periode dgn aturan keluar baru (rugExit + trail 0,40 + dump 12% LP)
# dan MASUK JALUR KEDUA: riseTrig (0 = masuk menit-1 seperti biasa).
K=/c/Users/horii/rhc-quant/rhc_vps/hasil/audit/kerja_16; D=/c/Users/horii/rhc-quant/rhc_vps/data
N6=C:/Users/horii/rhc-quant/rhc_vps/hasil/audit/kerja_06
RUN=$K/$1; RISE=${2:-0}
BASE="{\"latb\":30,\"entryLat\":30,\"keepNoAfter\":true,\"strictSnap\":true,\"lpAdjust\":true,\"fillOnTime\":true,\"gasUsd\":0.06,\"approveUsd\":0.03,\"worstOrder\":true,\"hz\":324000,\"failBuy\":0.0185,\"failSell\":0.0054,\"sellImpact\":\"sell\",\"sellLast\":true,\"nonceFile\":\"$N6/nonce_dasar.json\",\"rugExit\":true,\"trail\":0.40,\"dumpFrac\":0.12,\"riseTrig\":$RISE}"
export AUDIT="$BASE"
mkdir -p $RUN; echo "AUDIT=$AUDIT" > $RUN.log
cd $K/pipeline
for p in "am_ags01 24800000 26800000 -" "am_ags07 30000000 32000000 A1" "am_ags13 35000000 37000000 A2" "am_ags18 40000000 42000000 A3" "am_ags24 45000000 47000000 A4" \
         "u_ds5d 55566162 56218961 W2" "u_ds24 59886162 60750162 W3" "m1 61866030 63600000 W4" "m2 64401245 65698903 W5"; do
  set -- $p; nm=$1; a=$2; b=$3; mdl=$4
  [ -f $RUN/$nm/trades.jsonl ] && continue
  mkdir -p $RUN/$nm; t0=$(date +%s)
  if [ "$mdl" = "-" ]; then
    DANGER_FILE=danger_model_v3.json DANGER_TH=1.1 UP_TH=1 TP_UP=1 node replay.js $D/$nm $a $b $RUN/$nm/trades.jsonl auto 2>&1 | tail -1 >> $RUN.log
  else
    DANGER_FILE=wf_bahaya_$mdl.json DANGER_TH=0.4 UP_FILE=wf_naik_$mdl.json UP_TH=0.5 TP_UP=0.5 node replay.js $D/$nm $a $b $RUN/$nm/trades.jsonl auto 2>&1 | tail -1 >> $RUN.log
  fi
  echo "$nm selesai $(( $(date +%s)-t0 )) dtk" >> $RUN.log
done
echo SELESAI >> $RUN.log
