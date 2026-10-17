#!/bin/bash
# UJI JENDELA ACAK: tiap jendela (acak_jendela.json) -> unduh on-chain -> replay Rust -> data menit-1 -> simulasi BOT RUST
# (kode sama dengan live), model BEKU, setelan AUDIT07 & resmi, mulai $100. Hasil: acak_hasil.jsonl
cd /c/Users/horii/rhc-quant/data_b
B=/c/Users/horii/rhc-quant/rust/rhc-live/target/release/rhc-live.exe
R=/c/Users/horii/rhc-quant/rust/port_engine/target/release/replay.exe
C=/c/PortableGit/mingw64/bin/curl.exe
CR=$(printf '\r')
export AUDIT='{"latb":30,"entryLat":30,"keepNoAfter":true,"strictSnap":true,"lpAdjust":true,"fillOnTime":true,"gasUsd":0.06,"approveUsd":0.03,"worstOrder":true,"hz":324000,"failBuy":0.0185,"failSell":0.0054}'
waktu(){ $C -s -m 30 --doh-url https://cloudflare-dns.com/dns-query -X POST https://rpc.mainnet.chain.robinhood.com -H "Content-Type: application/json" -d "{\"jsonrpc\":\"2.0\",\"id\":1,\"method\":\"eth_getBlockByNumber\",\"params\":[\"$(printf '0x%x' $1)\",false]}" | python -c "import sys,json,datetime;sys.stdout.write(datetime.datetime.utcfromtimestamp(int(json.load(sys.stdin)['result']['timestamp'],16)).strftime('%Y-%m-%d %H:%M'))"; }
python -c "import json,sys;[sys.stdout.write(j['nama']+' '+str(j['dari'])+' '+str(j['sampai'])+'\n') for j in json.load(open('acak_jendela.json'))]" > acak_daftar.txt
while read nama dari sampai; do
  dari=${dari%$CR}; sampai=${sampai%$CR}
  echo "##### $nama $dari-$sampai | $(waktu $dari) s/d $(waktu $sampai) UTC" | tee -a acak_log.txt
  if [ ! -s $nama/swaps_sorted.csv ] || [ $(wc -l < $nama/swaps_sorted.csv) -lt 3 ]; then JALUR=3 $B unduh $dari $sampai $nama 2>&1 | grep -E "SELESAI|GAGAL" | tee -a acak_log.txt; fi
  if [ ! -s $nama/trades.jsonl ]; then (cd ../rhc_vps/pipeline && DANGER_TH=0.4 UP_TH=0.5 TP_UP=0.5 DANGER_FILE=../bot/danger_model.json UP_FILE=../bot/pnaik_model.json $R ../../data_b/$nama $dari $sampai ../../data_b/$nama/trades.jsonl auto 2>&1 | tail -1 | tee -a ../../data_b/acak_log.txt); fi
  if [ ! -s $nama/transfers.json ]; then $B menit1 $nama 2>&1 | grep -E "SELESAI|GAGAL" | tee -a acak_log.txt; fi
  DEV=""; case $nama in acak_A*) DEV="--devpre arena_feats.csv";; esac
  for set in a07 resmi; do
    if [ $set = a07 ]; then E="TUTUP_SAAT_RUG=1 TRAIL_PUNCAK=0.4 DUMP_FRAC=0.12 MAX_POS=5"; else E="MAX_POS=10"; fi
    r=$(env $E $B sim $nama $dari $sampai $nama/sim_$set.jsonl $DEV --akun-out $nama/akun_$set.json 2>/dev/null | head -2 | tr '\n' ' ')
    echo "$set | $r" | tee -a acak_log.txt
    python -c "import json,sys;print(json.dumps({'nama':sys.argv[2],'set':sys.argv[3],'dari':int(sys.argv[4]),'sampai':int(sys.argv[5]),'ringkas':sys.argv[1]}))" "$r" "$nama" "$set" "$dari" "$sampai" >> acak_hasil.jsonl
  done
done < acak_daftar.txt
echo "SEMUA JENDELA SELESAI" | tee -a acak_log.txt
