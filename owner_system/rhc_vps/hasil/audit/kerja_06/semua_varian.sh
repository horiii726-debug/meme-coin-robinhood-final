#!/bin/bash
# AUDIT06: varian b, c, gabungan a+b+c, latensi p90, gabungan+latensi — BERURUTAN
cd /c/Users/horii/rhc-quant/rhc_vps/hasil/audit/kerja_06
N=$PWD
bash jalan_replay.sh run_b '{"sellLast":true}';                       bash rantai.sh run_b > run_b.hasil
bash jalan_replay.sh run_c "{\"nonceFile\":\"$N/nonce_dasar.json\"}"; bash rantai.sh run_c > run_c.hasil
bash jalan_replay.sh run_abc "{\"sellImpact\":\"sell\",\"sellLast\":true,\"nonceFile\":\"$N/nonce_dasar.json\"}"; bash rantai.sh run_abc GASALL=1 > run_abc.hasil
bash jalan_replay.sh run_L '{}' 110;                                    bash rantai.sh run_L > run_L.hasil
echo SEMUA_SELESAI > semua.done
