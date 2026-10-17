#!/bin/bash
cd /c/Users/horii/rhc-quant/rhc_vps/hasil/audit/kerja_07
while ! grep -q "BATCH_I SELESAI" batch_i.log; do node -e 'setTimeout(()=>{},20000)'; done
# F: model KELUAR dibekukan (tidak pernah dilatih ulang) -> W1 dipakai untuk semua periode, di atas config G11
for i in 2 3 4 5; do cp pipeline/wf_bahaya_W1.json pipeline/beku_bahaya_W$i.json; cp pipeline/wf_naik_W1.json pipeline/beku_naik_W$i.json; done
cp pipeline/wf_bahaya_W1.json pipeline/beku_bahaya_W1.json; cp pipeline/wf_naik_W1.json pipeline/beku_naik_W1.json
sed 's/wf_bahaya_W\$i/beku_bahaya_W\$i/; s/wf_naik_W\$i/beku_naik_W\$i/' jalan_replay.sh > jalan_replay_beku.sh
bash jalan_replay_beku.sh g15 '{"rugExit":true,"trail":0.40,"dumpFrac":0.12}' >/dev/null 2>&1
bash rantai07.sh g15 >> batch_j.log 2>&1; echo "g15 SELESAI $(date +%H:%M:%S)" >> batch_j.log
echo "BATCH_J SELESAI" >> batch_j.log
