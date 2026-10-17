#!/bin/bash
# jalan_arena.sh <run_dir_abs> <gasdyn_abs> <nama> [EXTRA ENV...]
R=$1; G=$2; NM=$3; shift 3
cd $R
env GASALL=1 GASDYN=$G QTHR=0.90 SLIP=1 EXPMAX=0.5 REM=1 LPCAP=0.01 MAXPOS=5 NAMA="$NM" \
    OUT=/c/Users/horii/rhc-quant/rhc_vps/hasil/audit/kerja_07/eq_tmp "$@" \
    node /c/Users/horii/rhc-quant/rhc_vps/hasil/audit/kerja_07/pipeline/arena.js
