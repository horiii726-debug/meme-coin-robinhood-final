#!/bin/bash
# AUDIT07: bangun potret state (bahan latih model KELUAR) untuk periode Agustus baru. Tidak butuh jaringan.
K=/c/Users/horii/rhc-quant/rhc_vps/hasil/audit/kerja_07; D=/c/Users/horii/rhc-quant/rhc_vps/data
cd $K/pipeline
for p in "am_ags01 26800000" "am_ags07 32000000" "am_ags13 37000000" "am_ags18 42000000" "am_ags24 47000000"; do
  set -- $p; nm=$1; b=$2
  [ -f $K/state/state_$nm.csv ] && continue
  t0=$(date +%s)
  DIR=$D/$nm SPLIT=99999999 ENDBLK=$b OUT=$K/state/state_$nm.csv node state_rows.js 2>&1 | tail -1
  echo "$nm state selesai $(( $(date +%s)-t0 )) dtk" >> $K/ags_state.log
done
echo STATE_SELESAI >> $K/ags_state.log
