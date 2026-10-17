#!/bin/bash
K=/c/Users/horii/rhc-quant/rhc_vps/hasil/audit/kerja_16; D=/c/Users/horii/rhc-quant/rhc_vps/data
G=/c/Users/horii/rhc-quant/rhc_vps/hasil/audit/kerja_07/g11
mkdir -p $K/mfe $K/tdir
for p in am_ags01 am_ags07 am_ags13 am_ags18 am_ags24; do
  [ -f $K/mfe/$p.csv ] && continue
  t0=$(date +%s); node $K/pipeline/mfe.js $K/dat/$p $D/$p/swaps_sorted.csv $K/mfe/$p.csv 2>&1 | tail -1 >> $K/log/mfe.log
  echo "$p mfe $(( $(date +%s)-t0 )) dtk" >> $K/log/mfe.log
done
for p in u_ds5d u_ds24 m1 m2; do
  [ -f $K/mfe/$p.csv ] && continue
  mkdir -p $K/tdir/$p; cp $G/$p/trades.jsonl $K/tdir/$p/; cp $D/$p/pools.csv $K/tdir/$p/
  t0=$(date +%s); node $K/pipeline/mfe.js $K/tdir/$p $D/$p/swaps_sorted.csv $K/mfe/$p.csv 2>&1 | tail -1 >> $K/log/mfe.log
  echo "$p mfe $(( $(date +%s)-t0 )) dtk" >> $K/log/mfe.log
done
echo MFE_SELESAI >> $K/log/mfe.log
