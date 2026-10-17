#!/bin/bash
K=/c/Users/horii/rhc-quant/rhc_vps/hasil/audit/kerja_16; D=/c/Users/horii/rhc-quant/rhc_vps/data
cd $K/pipeline
for p in am_ags01 am_ags07 am_ags13 am_ags18 am_ags24; do
  [ -f $K/dat/$p/swaps_m1.json ] && continue
  t0=$(date +%s)
  SWAPS=$D/$p/swaps_sorted.csv node extract_m1b.js $K/dat/$p 2>&1 | tail -1 >> $K/log/m1.log
  echo "$p swaps_m1 $(( $(date +%s)-t0 )) dtk" >> $K/log/m1.log
done
echo M1_SELESAI >> $K/log/m1.log
