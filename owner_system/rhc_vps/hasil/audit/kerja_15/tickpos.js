// Posisi harga di dalam rentang tick posisi LP pada blok keputusan (init+600) + arus menit-1.
const fs=require("fs"); const Q96=Math.pow(2,96);
const lp={};
for(const l of fs.readFileSync("kand.csv","utf8").trim().split("\n").slice(1)){
  const p=l.split(","); lp[p[1]]={lo:+p[19],hi:+p[20]};   // kolom lo_main,hi_main - dicek di bawah
}
const hdr=fs.readFileSync("kand.csv","utf8").split("\n")[0].split(",");
const iLo=hdr.indexOf("lo_main"), iHi=hdr.indexOf("hi_main"), iPool=hdr.indexOf("pool"), iInit=hdr.indexOf("init");
const rows=fs.readFileSync("kand.csv","utf8").trim().split("\n").slice(1).map(l=>l.split(","));
const meta={}; for(const p of rows) meta[p[iPool]]={lo:+p[iLo],hi:+p[iHi],init:+p[iInit]};
const out=["pool,tick_d,pos_rng,d_hi,d_lo,n_sw_m1,tick_move,tick_v"];
for(const D of ["ags1","ags4","u_ds5d","u_ds24","m1","m2"]){
  const sw=JSON.parse(fs.readFileSync(`../../../data/${D}/swaps_m1.json`,"utf8"));
  for(const [pid,arr] of Object.entries(sw)){
    const m=meta[pid]; if(!m) continue;
    const a=arr.filter(x=>x[0]<=m.init+600); if(!a.length) continue;
    const t=x=>{const sp=Number(x[4])/Q96; return Math.log(sp*sp)/Math.log(1.0001);};
    const td=t(a[a.length-1]), t0=t(a[0]);
    const w=m.hi-m.lo;
    out.push([pid,td.toFixed(1),w>0?((td-m.lo)/w).toFixed(4):"",(m.hi-td).toFixed(0),(td-m.lo).toFixed(0),a.length,(td-t0).toFixed(0),(a.length>1?((td-t0)/a.length).toFixed(1):"0")].join(","));
  }
}
fs.writeFileSync("tickpos.csv",out.join("\n"));
console.log("baris",out.length-1);
