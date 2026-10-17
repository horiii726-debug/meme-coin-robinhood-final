#!/bin/bash
# AUDIT06: build fitur -> skor ML kausal -> arena, untuk satu folder varian (berisi <dir>/trades.jsonl)
set -e
K=/c/Users/horii/rhc-quant/rhc_vps/hasil/audit/kerja_06
R=$K/$1; shift
cd $R
DATA=/c/Users/horii/rhc-quant/rhc_vps/data node $K/pipeline/build_feats2.js ags1 ags4 u_ds5d u_ds24 m1 m2 2>&1 | tail -1
python $K/pipeline/arena_score.py 2>&1 | tail -1
MAXPOS=10 QTHR=0.90 SLIP=1 EXPMAX=0.5 REM=1 LPCAP=0.01 DUMP=$R/dump.json OUT=$R/arena_equity env "$@" node $K/pipeline/arena.js > $R/arena.txt 2>&1
grep -E "^peluang|^tolak|^win|^akun|^  " $R/arena.txt
