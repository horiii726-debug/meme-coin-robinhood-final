#!/bin/bash
cd /c/Users/horii/rhc-quant/rhc_vps/hasil/audit/kerja_07
go(){ n=$1; o=$2; [ -f a_$n/am_ags24/trades.jsonl ] && return
  bash ags_replay.sh a_$n "$o" >/dev/null 2>&1; echo "a_$n SELESAI $(date +%H:%M:%S)" >> batch_ags.log; }
go base '{}'
go rug  '{"rugExit":true}'
go t40  '{"rugExit":true,"trail":0.40}'
go d12  '{"rugExit":true,"dumpFrac":0.12}'
go t40d12 '{"rugExit":true,"trail":0.40,"dumpFrac":0.12}'
go t30d12 '{"rugExit":true,"trail":0.30,"dumpFrac":0.12}'
go arm '{"rugExit":true,"dumpFrac":0.12,"armAt":3.0,"armTrail":0.35}'
echo "BATCH_AGS SELESAI" >> batch_ags.log
