#!/bin/bash
K=/c/Users/horii/rhc-quant/rhc_vps/hasil/audit/kerja_16; D=/c/Users/horii/rhc-quant/rhc_vps/data
mkdir -p $K/mfe2
for p in am_ags01 am_ags07 am_ags13 am_ags18 am_ags24; do
  [ -f $K/mfe2/$p.csv ] && continue
  node $K/pipeline/mfe2.js $K/dat/$p $D/$p/swaps_sorted.csv $K/mfe2/$p.csv 2>&1 | tail -1 >> $K/log/mfe2.log
done
for p in u_ds5d u_ds24 m1 m2 ags1 ags4; do
  [ -f $K/mfe2/$p.csv ] && continue
  mkdir -p $K/tdir/$p; cp C:/Users/horii/rhc-quant/rhc_vps/hasil/audit/kerja_07/g11/$p/trades.jsonl $K/tdir/$p/; cp $D/$p/pools.csv $K/tdir/$p/
  node $K/pipeline/mfe2.js $K/tdir/$p $D/$p/swaps_sorted.csv $K/mfe2/$p.csv 2>&1 | tail -1 >> $K/log/mfe2.log
done
echo MFE2_SELESAI >> $K/log/mfe2.log
