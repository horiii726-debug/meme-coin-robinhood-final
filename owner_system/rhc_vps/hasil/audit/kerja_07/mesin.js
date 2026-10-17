// AUDIT07: statistik tingkat MESIN (semua koin kandidat, tanpa aturan akun) — dasar pemilihan parameter keluar.
// PILIH = ags1+ags4+ds5d+ds24 (periode lama), BUKTI = m1+m2.
const fs=require("fs");
const R=process.argv[2];
const G={pilih:["ags1","ags4","u_ds5d","u_ds24"],bukti:["m1","m2"],ds5d:["u_ds5d"],ds24:["u_ds24"]};
const load=ds=>{let a=[];for(const d of ds)for(const l of fs.readFileSync(`${R}/${d}/trades.jsonl`,"utf8").trim().split("\n")){const t=JSON.parse(l);if(t.plan==="v4")a.push(t);}return a;};
const med=a=>{const s=[...a].sort((x,y)=>x-y);return s.length?s[Math.floor(s.length/2)]:NaN;};
const out=[];
for(const [k,ds] of Object.entries(G)){
  const a=load(ds); const r=a.map(t=>t.ret);
  const g=a.filter(t=>t.pnl>0).reduce((s,t)=>s+t.pnl,0), l=-a.filter(t=>t.pnl<=0).reduce((s,t)=>s+t.pnl,0);
  out.push(`${k}: n ${a.length} | ret rata2 ${(r.reduce((x,y)=>x+y,0)/r.length).toFixed(3)} | ret median ${med(r).toFixed(3)} | win ${(100*r.filter(x=>x>1).length/r.length).toFixed(1)}% | PF ${(g/l).toFixed(2)} | ret>=3x ${a.filter(t=>t.ret>=3).length} | ret>=10x ${a.filter(t=>t.ret>=10).length} | tangkap puncak ${(100*med(a.filter(t=>t.perfect>1.05).map(t=>t.ret/t.perfect))).toFixed(0)}%`);
}
console.log(process.argv[3]||R); console.log("  "+out.join("\n  "));
