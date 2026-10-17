#!/bin/bash
# 3 aliran paralel, batch 20 (batas RPC gratis), resumable, jeda kecil antar batch.
K=/c/Users/horii/rhc-quant/rhc_vps/hasil/audit/kerja_16
run(){ for p in "$@"; do
  for try in 1 2 3 4 5 6 7 8 9 10 11 12; do
    BSZ=20 node $K/pipeline/fetch_trb.js $K/dat/$p >> $K/log/tr_$p.log 2>&1 && break
    echo "RETRY $try $p $(date +%H:%M:%S)" >> $K/log/tr_$p.log; sleep 15
  done
  echo "TR_SELESAI $p $(date +%H:%M:%S)" >> $K/log/tr.log
done; }
run am_ags07 &
run am_ags13 am_ags18 &
run am_ags24 &
wait
echo "SEMUA_TR_SELESAI $(date +%H:%M:%S)" >> $K/log/tr.log
