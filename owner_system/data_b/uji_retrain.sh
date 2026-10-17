#!/bin/bash
cd /c/Users/horii/rhc-quant/data_b
: > uji_retrain.log
for cfg in "100 60" "50 60" "20 60" "10 60" "5 60" "10 30" "5 30"; do
  set -- $cfg; n=$1; m=$2
  RETRAIN=$n MINSTART=$m OUTF=sc_r${n}_m${m}.csv python arena_score.py > r_tmp.txt 2>&1
  latih=$(grep -o "dilatih ulang [0-9]*x" r_tmp.txt)
  hasil=$(SCORED=sc_r${n}_m${m}.csv MAXPOS=10 QTHR=0.90 SLIP=1 EXPMAX=0.5 REM=1 LPCAP=0.01 node arena.js 2>&1 | grep -E "^peluang|^win|^akun|^  " | tr '\n' ' ')
  echo "LATIH ULANG TIAP $n TRADE | mulai setelah $m trade | $latih | $hasil" >> uji_retrain.log
done
echo SELESAI >> uji_retrain.log
