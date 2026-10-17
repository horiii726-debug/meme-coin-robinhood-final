#!/bin/bash
cd /c/Users/horii/rhc-quant/rhc_vps/hasil/audit/kerja_07
go(){ n=$1; o=$2; shift 2; [ -f $n/gasdyn.json ] && return
  env "$@" bash jalan_replay.sh $n "$o" >/dev/null 2>&1; bash rantai07.sh $n >> batch_h.log 2>&1; echo "$n SELESAI $(date +%H:%M:%S)" >> batch_h.log; }
go g9  '{"rugExit":true,"trail":0.40,"tpLadder":[[1.2,0.30],[2.0,0.30],[4.0,0.20]]}'
go g10 '{"rugExit":true,"trail":0.30,"tpLadder":[[1.2,0.30],[2.0,0.30],[4.0,0.20]]}'
go g11 '{"rugExit":true,"trail":0.40,"dumpFrac":0.12}'
go g12 '{"rugExit":true,"trail":0.40,"tpLadder":[[1.2,0.30],[2.0,0.30],[4.0,0.20]],"dumpFrac":0.12}'
echo "BATCH_H SELESAI" >> batch_h.log
