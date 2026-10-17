#!/bin/bash
cd /c/Users/horii/rhc-quant/rhc_vps/hasil/audit/kerja_06
N="C:/Users/horii/rhc-quant/rhc_vps/hasil/audit/kerja_06"
bash jalan_replay.sh run_abcL "{\"sellImpact\":\"sell\",\"sellLast\":true,\"nonceFile\":\"$N/nonce_L.json\"}" 110
bash rantai.sh run_abcL GASALL=1 > run_abcL.hasil
RUNS=run_abcL DUMPS=run_abcL/dump.json SAMPLE=0 node ambil_gas.js 2>&1 | tail -1
node analisis_gas.js run_abcL gas_dinamis_abcL.json | tail -1
cd run_abcL && GASALL=1 GASDYN=../gas_dinamis_abcL.json MAXPOS=10 QTHR=0.90 SLIP=1 EXPMAX=0.5 REM=1 LPCAP=0.01 OUT=eq_abcdL node ../pipeline/arena.js > arena_abcdL.txt
grep -E "^peluang|^win|^akun|^  " arena_abcdL.txt
echo OK > ../L.done
