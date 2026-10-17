const fs=require("fs");
const DIR=process.argv[2]||"dsp";
const L=fs.readFileSync(DIR+"/sim.csv","utf8").trim().split("\n");
const h=L[0].split(","); const I={}; h.forEach((x,i)=>I[x]=i);
const R=L.slice(1).map(l=>{const p=l.split(",");return{
  lpEntry:+p[I.lp_entry_usd], lpPeak:+p[I.lp_peak_usd], size:+p[I.size_usd],
  best:+p[I.best_mult], lag:+p[I.best_lag], end:+p[I.end_mult],
  dip:+p[I.dip_mult], postDip:+p[I.post_dip_mult], rem:+p[I.liq_rem_frac],
  fee:+p[I.med_fee], n:+p[I.n_swap], hooks:p[I.hooks]};}).filter(r=>isFinite(r.best));
const pct=(a,q)=>{const s=[...a].sort((x,y)=>x-y);return s.length?s[Math.min(s.length-1,Math.floor(q*s.length))]:NaN;};
const f=(n,d=2)=>Number(n).toFixed(d);
function rep(S,t){
  if(!S.length){console.log("\n### "+t+": 0");return;}
  console.log("\n"+"=".repeat(66));console.log("### "+t+"  (n="+S.length+")");console.log("=".repeat(66));
  const b=S.map(r=>r.best);
  console.log("EXIT TERBAIK (perfect foresight, sesudah fee+slippage+gas):");
  [0.5,0.75,0.9,0.95,0.99].forEach(q=>console.log("   p"+String(Math.round(q*100)).padEnd(3)+f(pct(b,q))+"x"));
  console.log("   max  "+f(Math.max(...b))+"x");
  const br=(n,l)=>console.log("   "+l.padEnd(36)+String(n).padStart(5)+"  "+f(100*n/S.length)+"%");
  console.log("\nBASE RATE:");
  br(S.filter(r=>r.best>=11).length,"peak >= 1000% (11x)");
  br(S.filter(r=>r.best>=6).length, "peak >= 500%  (6x)");
  br(S.filter(r=>r.best>=2).length, "peak >= 100%  (2x)");
  br(S.filter(r=>r.best>=1.3).length,"peak >= 30%   (rencana awal)");
  br(S.filter(r=>r.best<1).length,  "TIDAK PERNAH balik modal");
  br(S.filter(r=>r.rem>0.8||r.end<0.1).length,"RUG (LP ditarik >80% / nilai ~0)");
  br(S.filter(r=>r.end<0.5&&!(r.rem>0.8||r.end<0.1)).length,"DECLINE (akhir < -50%)");
  const d=S.filter(r=>r.dip<=0.5);
  console.log("\nPOLA DIP (beli saat koreksi):");
  console.log("   turun >=50% dlm 1 jam : "+d.length+" ("+f(100*d.length/S.length)+"%)");
  if(d.length){const rr=d.map(r=>r.postDip/Math.max(r.dip,1e-9)).filter(isFinite);
    console.log("   pulih dari dasar: p50="+f(pct(rr,.5))+"x p75="+f(pct(rr,.75))+"x p90="+f(pct(rr,.9))+"x p99="+f(pct(rr,.99))+"x");
    console.log("   yg pulih >=3x dari dasar: "+rr.filter(x=>x>=3).length+" ("+f(100*rr.filter(x=>x>=3).length/d.length)+"% dr yg turun)");}
  console.log("\nwaktu ke exit terbaik (blok): p50="+pct(S.map(r=>r.lag),.5)+" ("+f(pct(S.map(r=>r.lag),.5)*0.1/60)+" mnt)  p90="+pct(S.map(r=>r.lag),.9));
  console.log("size median $"+f(pct(S.map(r=>r.size),.5))+" | LP entry median $"+pct(S.map(r=>r.lpEntry),.5).toLocaleString("en-US",{maximumFractionDigits:0})+" | fee median "+pct(S.map(r=>r.fee),.5)+"e-6");
}
console.log("total simulasi: "+R.length);
rep(R,"SEMUA POOL");
rep(R.filter(r=>r.lpPeak>=20000),"TRADABLE (LP peak >= $20.000)");
