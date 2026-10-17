// AUDIT07: return per HARI WIB dari kurva equity arena (data on-chain nyata, bukan proyeksi).
const fs=require("fs");
const ANK=Object.entries(JSON.parse(fs.readFileSync("C:/Users/horii/rhc-quant/rhc_vps/data/block_time.json","utf8"))).map(([b,t])=>[+b,+t]).sort((a,b)=>a[0]-b[0]);
function bt(b){ if(b<=ANK[0][0])return ANK[0][1]-(ANK[0][0]-b)*0.1013;
  if(b>=ANK.at(-1)[0])return ANK.at(-1)[1]+(b-ANK.at(-1)[0])*0.1013;
  for(let i=1;i<ANK.length;i++) if(b<=ANK[i][0]){const[b0,t0]=ANK[i-1],[b1,t1]=ANK[i];return t0+(t1-t0)*(b-b0)/(b1-b0);} }
const J=JSON.parse(fs.readFileSync(process.argv[2]||"eq_tmp.json","utf8"));
const hari=new Map();
for(const [b,eq] of J.eqCurve){ const t=bt(b); const d=Math.floor((t+7*3600)/86400);
  if(!hari.has(d)) hari.set(d,{first:eq,last:eq,n:0,t});
  const h=hari.get(d); h.last=eq; h.n++; }
const ks=[...hari.keys()].sort((a,b)=>a-b);
let prev=100; const rows=[];
for(const k of ks){ const h=hari.get(k); const r=h.last/prev; rows.push({tgl:new Date((k*86400)*1000).toISOString().slice(0,10),n:h.n,eq0:prev,eq1:h.last,ret:r}); prev=h.last; }
const R=rows.map(r=>r.ret).sort((a,b)=>a-b);
const med=R[Math.floor(R.length/2)];
console.log("hari WIB dengan trade tutup:",rows.length,"| rentang kalender",rows[0].tgl,"s/d",rows.at(-1).tgl);
for(const r of rows) console.log(`  ${r.tgl} | tutup ${String(r.n).padStart(3)} | $${r.eq0.toFixed(2)} -> $${r.eq1.toFixed(2)} | x${r.ret.toFixed(3)} (${((r.ret-1)*100).toFixed(1)}%)`);
console.log(`HARI: terbaik x${R.at(-1).toFixed(3)} | median x${med.toFixed(3)} | terburuk x${R[0].toFixed(3)} | hari rugi ${R.filter(x=>x<1).length}/${R.length}`);
