#!/bin/bash
# hitung gas dinamis per trade dari gas_cache (receipt on-chain nyata) untuk sebuah run
cd /c/Users/horii/rhc-quant/rhc_vps/hasil/audit/kerja_07
node analisis_gas.js $1 $1/gasdyn.json 2>&1 | tail -1
