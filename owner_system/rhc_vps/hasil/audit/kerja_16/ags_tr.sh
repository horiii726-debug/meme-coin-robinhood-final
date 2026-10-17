#!/bin/bash
K=/c/Users/horii/rhc-quant/rhc_vps/hasil/audit/kerja_16
cd $K/pipeline
p=$1
for try in 1 2 3 4 5 6 7 8; do
  BSZ=${BSZ:-40} node fetch_trb.js $K/dat/$p >> $K/log/tr_$p.log 2>&1 && break
  echo "RETRY $try $p $(date +%H:%M:%S)" >> $K/log/tr_$p.log
  sleep 20
done
echo "TR_SELESAI $p $(date +%H:%M:%S)" >> $K/log/tr_$p.log
