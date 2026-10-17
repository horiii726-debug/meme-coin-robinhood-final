// Isi dev_history.json dari transfer menit-1 yang sudah tersimpan (tanpa RPC).
const fs=require("fs");
const PM="0x8366a39cc670b4001a1121b8f6a443a643e40951", NATIVE="0x0000000000000000000000000000000000000000";
const hist={};
let n=0;
for(const D of ["d1","d2","d3"]){
  const tr=fs.readFileSync(`${D}/trades.jsonl`,"utf8").trim().split("\n").map(JSON.parse).filter(t=>t.plan==="v4").sort((a,b)=>a.init-b.init);
  const tf=JSON.parse(fs.readFileSync(`${D}/transfers.json`,"utf8"));
  for(const t of tr){
    const e=tf[t.pool]; if(!e) continue;
    const bal=new Map();
    for(const [,,fr,to,amt] of e.tr){const v=Number(amt);const F=fr.toLowerCase(),T=to.toLowerCase();
      if(F!==NATIVE) bal.set(F,(bal.get(F)||0)-v); if(T!==NATIVE) bal.set(T,(bal.get(T)||0)+v);}
    let best=null,bv=0;
    for(const [k,v] of bal) if(v>bv&&k!==PM&&k!==NATIVE){best=k;bv=v;}
    if(!best) continue;
    (hist[best]=hist[best]||[]).push(+t.ret.toFixed(4)); n++;
  }
}
fs.writeFileSync("../live/dev_history.json",JSON.stringify(hist));
const devs=Object.entries(hist);
const bersih=devs.filter(([,r])=>r.every(x=>x>=0.3));
const ulang=devs.filter(([,r])=>r.length>1);
console.log(`dev tercatat: ${devs.length} | trade: ${n} | dev berulang (>1 koin): ${ulang.length} | dev bersih (tak pernah rug): ${bersih.length}`);
const retAll=devs.flatMap(([,r])=>r);
console.log(`ret rata2 semua: ${(retAll.reduce((a,b)=>a+b,0)/retAll.length).toFixed(3)}`);
