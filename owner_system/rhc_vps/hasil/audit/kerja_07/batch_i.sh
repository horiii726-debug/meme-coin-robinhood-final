#!/bin/bash
cd /c/Users/horii/rhc-quant/rhc_vps/hasil/audit/kerja_07
while [ ! -f batch_h.log ] || ! grep -q "BATCH_H SELESAI" batch_h.log; do node -e 'setTimeout(()=>{},20000)'; done
go(){ n=$1; o=$2; shift 2; [ -f $n/gasdyn.json ] && return
  env "$@" bash jalan_replay.sh $n "$o" >/dev/null 2>&1; bash rantai07.sh $n >> batch_i.log 2>&1; echo "$n SELESAI $(date +%H:%M:%S)" >> batch_i.log; }
go g13 '{"rugExit":true,"trail":0.30,"dumpFrac":0.12}'
go g14 '{"rugExit":true,"dumpFrac":0.12}'
echo "BATCH_I SELESAI" >> batch_i.log
