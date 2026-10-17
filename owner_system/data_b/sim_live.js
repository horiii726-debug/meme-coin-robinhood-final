// Simulasi akun PERSIS aturan bot live: ambang bergerak (kuantil 30% dari 100 skor terakhir, warm-up 30),
// dev rule kausal, 1/4 Kelly kausal (warm-up 2%, KELLY_HIST 0.094 sampai 100 trade), cap 1% LP, maks 20 posisi, kill -35%.
const fs=require("fs");
const PM="0x8366a39cc670b4001a1121b8f6a443a643e40951", NATIVE="0x0000000000000000000000000000000000000000";
const rows=fs.readFileSync("scores_oof.csv","utf8").split(String.fromCharCode(13)).join("").trim().split(String.fromCharCode(10));
const hdr=rows[0].split(","); const ix=k=>hdr.indexOf(k);
// blok masuk/keluar + dev dari trades.jsonl & transfers
const meta=new Map();
const CREATOR=process.env.DEVSRC==="creator"?JSON.parse(fs.readFileSync("dev_creator2.json","utf8")):null;
for(const D of ["d1","d2","d3"]){
  const tf=JSON.parse(fs.readFileSync(`${D}/transfers.json`,"utf8"));
  for(const t of fs.readFileSync(`${D}/trades.jsonl`,"utf8").trim().split("\n").map(JSON.parse).filter(x=>x.plan==="v4")){
    let dev=null; const e=tf[t.pool];
    if(e){const bal=new Map();
      for(const [,,fr,to,amt] of e.tr){const v=Number(amt),F=fr.toLowerCase(),T=to.toLowerCase();
        if(F!==NATIVE)bal.set(F,(bal.get(F)||0)-v); if(T!==NATIVE)bal.set(T,(bal.get(T)||0)+v);}
      let bv=0; for(const [k,v] of bal) if(v>bv&&k!==PM&&k!==NATIVE){dev=k;bv=v;}}
    if(CREATOR) dev=(CREATOR[t.pool]||{}).dev||null;
    meta.set(t.pool,{entry:t.entryBlk,exit:t.exitBlk,dev,ds:D});
  }
}
const tr=rows.slice(1).map(l=>{const p=l.split(",");const o={};hdr.forEach((h,i)=>o[h]=p[i]);return o;})
  .filter(o=>o.score&&o.score!=="")
  .map(o=>({pool:o.pool,init:+o.init,ret:+o.ret,score:+o.score,lp:parseFloat(o.lp_m1)||0,...meta.get(o.pool)}))
  .filter(o=>o.entry!==undefined)
  .filter(o=>!process.env.ONLY||process.env.ONLY.split(",").includes(o.ds))
  .sort((a,b)=>a.entry-b.entry);

const DEVRULE=process.argv[2]!=="nodev";
const PRELOAD=process.env.PRELOAD||"";
const MODE=process.env.DEVMODE||"whitelist";     // isi riwayat dev dari dataset ini dulu (seperti dev_history.json di live)
let cash=100,peak=100,dd=0,killed=false;
const open=[]; const closed=[]; const recent=[]; const devHist={};
const q=(a,p)=>{const s=[...a].sort((x,y)=>x-y);return s[Math.min(s.length-1,Math.floor(p*s.length))];};
function kelly(){
  const r=closed.map(c=>c.ret);
  if(r.length<30) return 0.02;                                  // warm-up
  if(r.length<100) return 0.094;                                // 1/4 Kelly historis
  let best=0.02,bv=-1e9;
  for(let f=0.01;f<=0.6;f+=0.005){let s=0,ok=true;
    for(const x of r){const v=1+f*(x-1); if(v<=0){ok=false;break;} s+=Math.log(v);}
    if(ok&&s/r.length>bv){bv=s/r.length;best=f;}}
  return Math.max(0.01,Math.min(0.25,best/4));                  // 1/4 Kelly
}
if(PRELOAD){
  for(const D of PRELOAD.split(",")){
    const tf=JSON.parse(fs.readFileSync(`${D}/transfers.json`,"utf8"));
    for(const t of fs.readFileSync(`${D}/trades.jsonl`,"utf8").trim().split(String.fromCharCode(10)).map(JSON.parse).filter(x=>x.plan==="v4")){
      const e=tf[t.pool]; if(!e) continue;
      const bal=new Map();
      for(const [,,fr,to,amt] of e.tr){const v=Number(amt),F=fr.toLowerCase(),T=to.toLowerCase();
        if(F!==NATIVE)bal.set(F,(bal.get(F)||0)-v); if(T!==NATIVE)bal.set(T,(bal.get(T)||0)+v);}
      let dev=null,bv=0; for(const [k,v] of bal) if(v>bv&&k!==PM&&k!==NATIVE){dev=k;bv=v;}
      if(CREATOR) dev=(CREATOR[t.pool]||{}).dev||null;
      if(dev)(devHist[dev]=devHist[dev]||[]).push(t.ret);
    }
  }
  console.log(`riwayat dev diisi dari ${PRELOAD}: ${Object.keys(devHist).length} dev`);
}
const ev=[];
for(const t of tr){ev.push({b:t.entry,type:"in",t});ev.push({b:t.exit,type:"out",t});}
ev.sort((a,b)=>a.b-b.b||(a.type==="out"?-1:1));
let nMl=0,nDev=0,nSlot=0,nKill=0,nBuy=0;
const posOf=new Map();
for(const e of ev){
  if(e.type==="out"){
    const p=posOf.get(e.t.pool); if(!p) continue;
    posOf.delete(e.t.pool);
    const back=p.size*e.t.ret; cash+=back;
    closed.push({ret:e.t.ret,pnl:back-p.size,pool:e.t.pool,blk:e.b});
    const d=e.t.dev; if(d)(devHist[d]=devHist[d]||[]).push(e.t.ret);
    const eq=cash+[...posOf.values()].reduce((a,x)=>a+x.size,0);
    peak=Math.max(peak,eq); dd=Math.max(dd,1-eq/peak);
    if(!killed&&1-eq/peak>0.35){killed=true;}
    continue;
  }
  const t=e.t;
  recent.push(t.score); if(recent.length>100) recent.shift();
  const thr=recent.length<30?0.195:q(recent,0.30);
  if(t.score<thr){nMl++;continue;}
  if(DEVRULE){
    const h=devHist[t.dev];
    // daftar-putih: dev wajib sudah dikenal DAN tak pernah rug. daftar-hitam: tolak hanya kalau pernah rug.
    const tolak = MODE==="blacklist" ? (h && h.some(r=>r<0.3)) : (!h||!h.length||!h.every(r=>r>=0.3));
    if(tolak){nDev++;continue;}
  }
  if(killed){nKill++;continue;}
  if(posOf.size>=20){nSlot++;continue;}
  const eq=cash+[...posOf.values()].reduce((a,x)=>a+x.size,0);
  let size=Math.min(kelly()*eq, 0.01*t.lp, cash);
  if(size<1) {continue;}
  cash-=size; posOf.set(t.pool,{size}); nBuy++;
}
const eqAkhir=cash+[...posOf.values()].reduce((a,x)=>a+x.size,0);
const wins=closed.filter(c=>c.ret>1);
const pf=wins.reduce((a,c)=>a+c.pnl,0)/Math.max(-closed.filter(c=>c.ret<=1).reduce((a,c)=>a+c.pnl,0),1e-9);
const jam=(tr[tr.length-1].entry-tr[0].entry)*0.1/3600;
console.log(`${DEVRULE?"ML CatBoost + dev("+MODE+") + cap":"TANPA aturan dev"}`);
console.log(`  peluang dilihat ${tr.length} | beli ${nBuy} | tolak: ml ${nMl}, dev ${nDev}, slot ${nSlot}, kill ${nKill}`);
console.log(`  trade selesai ${closed.length} | win ${(100*wins.length/Math.max(closed.length,1)).toFixed(1)}% | PF ${pf.toFixed(2)}`);
console.log(`  akun $100 -> $${eqAkhir.toFixed(2)} (${((eqAkhir/100-1)*100).toFixed(0)}%) dalam ${jam.toFixed(1)} jam data | DD maks ${(100*dd).toFixed(1)}% | kill ${killed?"AKTIF":"tidak"}`);
const top=[...closed].sort((a,b)=>b.pnl-a.pnl).slice(0,5);
console.log("  5 trade terbaik:",top.map(c=>`${c.pool.slice(0,8)} x${c.ret.toFixed(2)} $${c.pnl.toFixed(1)}`).join(" | "));
