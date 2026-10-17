#!/bin/bash
# UJI MAJU PENUH: 2 Agustus -> 17 September, bot mulai dari NOL. Tiap periode, model keluar
# hanya dilatih dari periode yang SUDAH LEWAT. Tidak ada data masa depan.
set -e
cd "$(dirname "$0")/../data"
LOG=wf_penuh.log; : > $LOG
say(){ echo "[$(date +%H:%M:%S)] $*" | tee -a $LOG; }
export AUDIT='{"latb":30,"entryLat":30,"keepNoAfter":true,"strictSnap":true,"lpAdjust":true,"fillOnTime":true,"gasUsd":0.06,"approveUsd":0.03,"worstOrder":true,"hz":324000,"failBuy":0.0185,"failSell":0.0054}'
# urutan waktu: nama | folder | blok awal | blok akhir
P=( "ags1 ags1 25872800 26225599" "ags4 ags4 40834000 41179599" "ds5d u_ds5d 55566162 56218961" "ds24 u_ds24 59886162 60750162" "m1 m1 61866030 63600000" "m2 m2 64401245 65698903" )
STATES=()
for i in "${!P[@]}"; do
  set -- ${P[$i]}; nm=$1; dir=$2; a=$3; b=$4
  if [ ${#STATES[@]} -eq 0 ]; then
    say "TAHAP $nm: model keluar BELUM ADA (bot tidak tahu apa-apa)"
    (cd ../pipeline && DANGER_FILE=danger_model_v3.json DANGER_TH=1.1 UP_TH=1 TP_UP=1 node replay.js ../data/$dir $a $b ../data/$dir/trades.jsonl auto 2>&1 | tail -1 >> ../data/$LOG)
  else
    say "TAHAP $nm: model keluar dari ${STATES[*]}"
    python latih_keluar_wf.py W$i "${STATES[@]}" >> $LOG
    (cd ../pipeline && DANGER_FILE=wf_bahaya_W$i.json DANGER_TH=0.4 UP_FILE=wf_naik_W$i.json UP_TH=0.5 TP_UP=0.5 node replay.js ../data/$dir $a $b ../data/$dir/trades.jsonl auto 2>&1 | tail -1 >> ../data/$LOG)
  fi
  say "$nm: $(grep -c '"plan":"v4"' $dir/trades.jsonl) trade v4"
  if [ ! -f state_$nm.csv ]; then
    (cd ../pipeline && DIR=../data/$dir SPLIT=99999999 ENDBLK=$b OUT=../data/state_$nm.csv node state_rows.js 2>&1 | tail -1 >> ../data/$LOG)
  fi
  STATES+=("state_$nm.csv")
done
say "data menit-1 + transfer + dev untuk Agustus"
for d in ags1 ags4; do node extract_m1.js $d 2>>$LOG; node fetch_tr.js $d 2>>$LOG | tail -1; done
OUT=ags_dev node dev_creator_m.js ags1 ags4 2>>$LOG | tail -1
node -e 'const fs=require("fs");let all={};for(const f of ["dev_creator_m.json","u_dev.json","ags_dev.json"]){try{Object.assign(all,JSON.parse(fs.readFileSync(f,"utf8")))}catch(e){}}for(const d of ["ags1","ags4","u_ds5d","u_ds24","m1","m2"])fs.writeFileSync(d+"/dev_creator.json",JSON.stringify(all));'
say "bangun fitur seluruh garis waktu"
node build_feats2.js ags1 ags4 u_ds5d u_ds24 m1 m2 2>&1 | tail -1 >> $LOG
say "skor ML kausal dari nol"
python arena_score.py 2>&1 | tail -1 >> $LOG
say "ARENA: aturan live persis, akun \$100"
for cap in 0.01 0.02; do
  echo "--- posisi maks $cap likuiditas ---" >> $LOG
  MAXPOS=10 QTHR=0.90 SLIP=1 EXPMAX=0.5 REM=1 LPCAP=$cap node arena.js 2>&1 | grep -E "^peluang|^tolak|^win|^akun|^  |^TRADE|^KELLY|^catatan" >> $LOG
done
say "SELESAI"
