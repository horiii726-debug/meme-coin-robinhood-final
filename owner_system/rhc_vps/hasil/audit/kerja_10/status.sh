#!/bin/bash
B=/c/Users/horii/rhc-quant/rhc_vps/hasil/audit/kerja_10/bot_salinan
node -e "const s=require('$B/status.json'.replace('/c/','C:/'));console.log(JSON.stringify({last:s.last_block,tip:s.tip,lag:s.lag_blocks,err:s.last_error,aman:s.pengaman.mode_aman,basi:s.pengaman.data_basi,akun:s.akun,v4:s.results.v4}))" 2>&1
cat $B/state.json 2>/dev/null; echo
