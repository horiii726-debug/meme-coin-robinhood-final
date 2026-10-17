#!/bin/bash
cd /c/Users/horii/rhc-quant/rhc_vps/hasil/audit/kerja_10
./reset.sh >/dev/null
./cfg.sh 40835500 200 40840300 >/dev/null
powershell -ExecutionPolicy Bypass -File mulai.ps1 -arg 40835500 >/dev/null
sleep 30
./cfg.sh 40840300 10 40860000 >/dev/null
L=uji_rpc.log; : > $L
snap(){ echo "$(date +%T) [$1] $(./status.sh 2>/dev/null | head -1 | node -e "const s=JSON.parse(require('fs').readFileSync(0,'utf8'));console.log('last',s.last,'tip',s.tip,'lag',s.lag,'aman',s.aman,'err',s.err,'open',s.akun.posisi_terbuka,'eq',s.akun.equity_harga_beli,'basi',s.basi)") mock=$(cat mock_tip.txt) stmtime=$(stat -c %Y bot_salinan/status.json)" >> $L; }
for i in 1 2; do snap normal; sleep 15; done
node -e "const f='mock_cfg.json',c=JSON.parse(require('fs').readFileSync(f));c.down=true;require('fs').writeFileSync(f,JSON.stringify(c))"
echo "$(date +%T) RPC DIPUTUS" >> $L
for i in $(seq 1 30); do snap putus; sleep 20; done
node -e "const f='mock_cfg.json',c=JSON.parse(require('fs').readFileSync(f));c.down=false;require('fs').writeFileSync(f,JSON.stringify(c))"
echo "$(date +%T) RPC PULIH" >> $L
for i in $(seq 1 12); do snap pulih; sleep 10; done
echo SELESAI >> $L
