#!/bin/bash
cd /c/Users/horii/rhc-quant/rhc_vps/hasil/audit/kerja_07
go(){ n=$1; o=$2; shift 2; [ -f $n/gasdyn.json ] && return
  env "$@" bash jalan_replay.sh $n "$o" >/dev/null 2>&1; bash rantai07.sh $n >> batch_g.log 2>&1; echo "$n SELESAI $(date +%H:%M:%S)" >> batch_g.log; }
go g2 '{"rugExit":true}'
go g3 '{"rugExit":true,"warnTick":true,"trail":0.30}'
go g4 '{"rugExit":true,"warnTick":true,"trail":0.20}'
go g5 '{"rugExit":true,"warnTick":true,"trail":0.40}'
go g6 '{"rugExit":true,"warnTick":true,"tpLadder":[[1.2,0.30],[2.0,0.30],[4.0,0.20]]}'
go g7 '{"rugExit":true,"warnTick":true,"noCap":true,"quietMin":45,"quietAll":true}'
go g8 '{"rugExit":true,"warnTick":true}' DTH=0.6
echo "BATCH_G SELESAI" >> batch_g.log
