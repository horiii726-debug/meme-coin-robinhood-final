#!/bin/bash
# kosongkan keadaan runtime salinan bot + isi decisions.jsonl tiruan dari data/ags4
B=/c/Users/horii/rhc-quant/rhc_vps/hasil/audit/kerja_10/bot_salinan
rm -rf $B/store $B/state.json $B/trades.jsonl $B/events.jsonl $B/account.json $B/account.json.tmp $B/status.json $B/live.log $B/snaps_live.jsonl $B/feats_live.jsonl $B/decisions.jsonl $B/runner_*.log $B/penjaga.log $B/stop.txt
cp /c/Users/horii/rhc-quant/rhc_vps/bot/dev_history.json $B/dev_history.json
node -e "
const fs=require('fs');const D='/c/Users/horii/rhc-quant/rhc_vps/data/ags4/'.replace('/c/','C:/');
const v4=new Set(fs.readFileSync(D+'trades.jsonl','utf8').trim().split('\n').map(JSON.parse).filter(x=>x.plan==='v4').map(x=>x.pool));
const out=[];for(const l of fs.readFileSync(D+'pools.csv','utf8').split('\n').slice(1)){if(!l)continue;const id=l.split(',')[0];const ok=v4.has(id);
out.push(JSON.stringify({pool:id,filterOk:ok,score:ok?0.9:0.1,honeypot:false,hpWhy:'uji',dev:null,t:'uji'}));}
fs.writeFileSync('$B/decisions.jsonl'.replace('/c/','C:/'),out.join('\n')+'\n');console.log('decisions',out.length,'v4',v4.size);"
