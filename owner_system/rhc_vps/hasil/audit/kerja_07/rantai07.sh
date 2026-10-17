#!/bin/bash
set -e
K=/c/Users/horii/rhc-quant/rhc_vps/hasil/audit/kerja_07
cd $K/$1
DATA=/c/Users/horii/rhc-quant/rhc_vps/data node $K/pipeline/build_feats2.js ags1 ags4 u_ds5d u_ds24 m1 m2 2>&1 | tail -1
python $K/pipeline/arena_score.py 2>&1 | tail -1
cd $K && node analisis_gas.js $1 $K/$1/gasdyn.json 2>&1 | tail -1
