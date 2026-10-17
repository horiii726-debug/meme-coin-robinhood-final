#!/bin/bash
cd /c/Users/horii/rhc-quant/rhc_vps/hasil/audit/kerja_06
N="C:/Users/horii/rhc-quant/rhc_vps/hasil/audit/kerja_06"
bash jalan_replay.sh run_c "{\"nonceFile\":\"$N/nonce_dasar.json\"}"; bash rantai.sh run_c > run_c.hasil
bash jalan_replay.sh run_abc "{\"sellImpact\":\"sell\",\"sellLast\":true,\"nonceFile\":\"$N/nonce_dasar.json\"}"; bash rantai.sh run_abc GASALL=1 > run_abc.hasil
echo OK > sisa.done
