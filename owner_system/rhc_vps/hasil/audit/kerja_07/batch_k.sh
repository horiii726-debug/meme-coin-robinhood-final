#!/bin/bash
cd /c/Users/horii/rhc-quant/rhc_vps/hasil/audit/kerja_07
go(){ n=$1; o=$2; shift 2; [ -f $n/gasdyn.json ] && return
  env "$@" bash jalan_replay.sh $n "$o" >/dev/null 2>&1; bash rantai07.sh $n >> batch_k.log 2>&1; echo "$n SELESAI $(date +%H:%M:%S)" >> batch_k.log; }
B='"rugExit":true,"dumpFrac":0.12'
go k1 "{$B,\"armAt\":1.5,\"armTrail\":0.35}"
go k2 "{$B,\"armAt\":2.0,\"armTrail\":0.35}"
go k3 "{$B,\"armAt\":1.5,\"armTrail\":0.25}"
go k4 "{$B,\"armAt\":1.5,\"armTrail\":0.45}"
go k5 "{$B,\"armAt\":3.0,\"armTrail\":0.35}"
go k6 "{$B,\"armAt\":2.0,\"armTrail\":0.25}"
echo "BATCH_K SELESAI" >> batch_k.log
