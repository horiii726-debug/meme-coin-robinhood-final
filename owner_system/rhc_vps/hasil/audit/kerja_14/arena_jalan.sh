#!/bin/bash
# ARENA untuk satu varian keluar. Aturan pemilik: maks 5 posisi, 1/4 Kelly, gas nyata.
cd "$(dirname "$0")"
NM=$1
G="tr_$NM/ags1.jsonl,tr_$NM/ags4.jsonl,tr_$NM/u_ds5d.jsonl,tr_$NM/u_ds24.jsonl,tr_$NM/m1.jsonl,tr_$NM/m2.jsonl"
for MP in 5 10; do
  SCORED=scored_$NM.csv GASDIRS=$G NAMA="$NM maks$MP" MAXPOS=$MP QTHR=0.90 SLIP=1 EXPMAX=0.5 REM=1 LPCAP=0.01 \
    OUT=eq_${NM}_$MP node arena.js 2>&1 | grep -E "^peluang|^tolak|^win|^akun|^  |^TRADE|^catatan|^==="
done
