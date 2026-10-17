// Berapa pemenang >=1000% yang bisa ditradingkan dengan modal BERARTI?
const fs=require("fs"),path=require("path"),readline=require("readline");
const NATIVE="0x0000000000000000000000000000000000000000";
const USDG="0x5fc5360d0400a0fd4f2af552add042d716f1d168";
const WETH="0x0bd7d308f8e1639fab988df18a8011f41eacad73";
const QDEC={[NATIVE]:18,[USDG]:6,[WETH]:18};const Q96=Math.pow(2,96);
const DIR=process.argv[2]||"dsh";const HOUR=36000;
const ethUsd=JSON.parse(fs.readFileSync("eth_usd.json","utf8")).ethUsd;
(async()=>{
const pools=new Map();
for(const l of fs.readFileSync(path.join(DIR,"pools.csv"),"utf8").trim().split("\n").slice(1)){
  const p=l.split(",");pools.set(p[0].toLowerCase(),{c0:p[1].toLowerCase(),c1:p[2].toLowerCase(),hook:p[5].toLowerCase(),init:+p[6]});}
const res=[];
function flush(pid,sw){const m=pools.get(pid);if(!m||sw.length<3)return;
 sw.sort((a,b)=>a.blk-b.blk); if(sw[sw.length-1].blk-m.init<2*HOUR)return;
 let q1; if(QDEC[m.c1]!==undefined)q1=true; else if(QDEC[m.c0]!==undefined)q1=false; else return;
 const quote=q1?m.c1:m.c0,qd=QDEC[quote],up=quote===USDG?1:ethUsd;
 const toUsd=r=>(Math.abs(r)/Math.pow(10,qd))*up;
 const lpUsd=x=>2*toUsd(q1?x.L*x.sqrtP:x.L/x.sqrtP);
 const ei=sw.findIndex(x=>x.blk>=m.init+600); if(ei<0||ei>=sw.length-1)return;
 const e=sw[ei]; const lpE=lpUsd(e);
 for(const CAP of [200,1000]){
  const size=Math.min(CAP,0.01*lpE); if(!isFinite(size)||size<=0.5) continue;
  const dIn=(size/up)*Math.pow(10,qd)*(1-e.fee/1e6);
  let base; if(q1){const s1=e.sqrtP+dIn/e.L;base=e.L*(1/e.sqrtP-1/s1);}else{const iv=1/e.sqrtP+dIn/e.L;base=e.L*(e.sqrtP-1/iv);}
  if(!isFinite(base)||base<=0) continue;
  let best=0;
  for(const x of sw.slice(ei+1)){const bIn=base*(1-x.fee/1e6);let rc;
   if(q1){const iv=1/x.sqrtP+bIn/x.L;rc=x.L*(x.sqrtP-1/iv);}else{const sb=x.sqrtP+bIn/x.L;rc=x.L*(1/x.sqrtP-1/sb);}
   if(isFinite(rc)&&rc>0){const v=toUsd(rc);if(v>best)best=v;}}
  res.push({pid,cap:CAP,size,mult:best/size,profit:best-size,hook:m.hook!==NATIVE});
 }
}
const rl=readline.createInterface({input:fs.createReadStream(path.join(DIR,"swaps_sorted.csv")),crlfDelay:Infinity});
let cur=null,sw=[];
for await(const line of rl){ if(!line)continue;
 const i1=line.indexOf(","); const pid=line.slice(0,i1).toLowerCase(); if(pid==="pool_id")continue;
 if(pid!==cur){if(cur)flush(cur,sw);cur=pid;sw=[];}
 const p=line.split(","); const sp=Number(p[6])/Q96,L=Number(p[7]);
 if(!isFinite(sp)||sp<=0||!isFinite(L)||L<=0)continue;
 sw.push({blk:+p[1],a0:+p[4],a1:+p[5],sqrtP:sp,L,fee:+p[9]});}
if(cur)flush(cur,sw);
for(const CAP of [200,1000]){
 const S=res.filter(r=>r.cap===CAP);
 const W=S.filter(r=>r.mult>=11);
 console.log("\n=== modal maks $"+CAP+" per posisi ===");
 console.log("pool dinilai:",S.length,"| naik >=+1000%:",W.length);
 const tiers=[[1,"semua"],[50,">= $50"],[100,">= $100"],[150,">= $150"]];
 console.log("  ukuran posisi   jumlah   total profit   profit rata2");
 for(const [mn,lbl] of tiers){
  const T=W.filter(r=>r.size>=mn);
  const tot=T.reduce((a,b)=>a+b.profit,0);
  console.log("  "+lbl.padEnd(14)+String(T.length).padStart(6)+("$"+tot.toLocaleString("en-US",{maximumFractionDigits:0})).padStart(15)+("$"+(T.length?tot/T.length:0).toLocaleString("en-US",{maximumFractionDigits:0})).padStart(15));
 }
 console.log("  dari yg >=$100: punya hook "+W.filter(r=>r.size>=100&&r.hook).length+" / "+W.filter(r=>r.size>=100).length);
}
})();
