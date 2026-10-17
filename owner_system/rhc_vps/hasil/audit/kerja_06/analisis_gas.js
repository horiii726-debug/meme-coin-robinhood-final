// AUDIT06 (d): distribusi gas NYATA per tx swap (receipt: gasUsed x effectiveGasPrice x ETH/USD saat itu), per periode + jam ramai.
// Juga menulis gas dinamis per trade arena: jumlah biaya receipt di tiap tx kita (beli, TP1, jual, ulang gagal) + approve.
const fs=require("fs");
const C=JSON.parse(fs.readFileSync("gas_cache.json","utf8"));
const DIRS=["ags1","ags4","u_ds5d","u_ds24","m1","m2"];
const RUN=process.argv[2]||"run_dasar", OUTG=process.argv[3]||"gas_dinamis_dasar.json";
const q=(a,p)=>{const s=[...a].sort((x,y)=>x-y);return s.length?s[Math.min(s.length-1,Math.floor(p*s.length))]:NaN;};
const f=x=>isFinite(x)?"$"+x.toFixed(4):"-";
const perTrade={}; const rows=[];
for(const D of DIRS){
  const eth={}; for(const l of fs.readFileSync(`${RUN}/${D}/trades.jsonl`,"utf8").trim().split("\n").filter(Boolean)){const t=JSON.parse(l); eth[t.pool]=t.ethUsd; }
  const ev=fs.readFileSync(`${RUN}/${D}/events.jsonl`,"utf8").trim().split("\n").filter(Boolean).map(JSON.parse);
  const b0=Math.min(...ev.map(e=>e.blk)); const hr=b=>Math.floor((b-b0)*0.1013/3600);
  const act={}; for(const e of ev) act[hr(e.blk)]=(act[hr(e.blk)]||0)+1;
  const hs=Object.values(act).sort((a,b)=>a-b); const busyThr=q(hs,0.9);
  const usd=[],busy=[],gp=[],gu=[]; const seen=new Set();
  for(const e of ev){ const r=C[e.tx]; if(!r||seen.has(e.tx)||!eth[e.pool]) continue; seen.add(e.tx);
    const c=r.gas*r.gp/1e18*eth[e.pool]; usd.push(c); gp.push(r.gp/1e9); gu.push(r.gas); if(act[hr(e.blk)]>=busyThr) busy.push(c); }
  rows.push(`${D} | n ${usd.length} | median ${f(q(usd,.5))} p90 ${f(q(usd,.9))} p99 ${f(q(usd,.99))} maks ${f(Math.max(...usd))} | jam ramai (top10% jam) n ${busy.length} median ${f(q(busy,.5))} p90 ${f(q(busy,.9))} | gasPrice gwei med ${q(gp,.5)?.toFixed(4)} p90 ${q(gp,.9)?.toFixed(4)} maks ${Math.max(...gp).toFixed(4)} | gasUsed med ${q(gu,.5)}`);
  // per trade (plan v4)
  const byPool={}; for(const e of ev){ if(e.plan!==undefined&&e.plan!=="v4") continue; (byPool[e.pool]=byPool[e.pool]||[]).push(e); }
  for(const l of fs.readFileSync(`${RUN}/${D}/trades.jsonl`,"utf8").trim().split("\n").filter(Boolean)){ const t=JSON.parse(l); if(t.plan!=="v4") continue;
    const es=byPool[t.pool]||[]; let tot=0, miss=0; const costs=[];
    for(const e of es){ const r=C[e.tx]; if(r){ const c=r.gas*r.gp/1e18*t.ethUsd; costs.push(c); tot+=c; } else miss++; }
    if(t.reason==="beli gagal"){ continue; }   // tidak ada event -> gas tidak diganti (tetap dari replay)
    if(miss||!costs.length){ continue; }
    const txs=t.txs||costs.length+1;          // txs = beli + TP1 + jual + ulang gagal
    const avg=tot/costs.length;
    perTrade[t.pool]= tot + Math.max(0,txs-costs.length)*avg + avg;   // tx tanpa event (ulang gagal) = rata2 biaya saat itu; approve = biaya 1 tx saat itu (batas atas, tidak ada receipt approve)
  }
}
console.log(rows.join("\n"));
const v=Object.values(perTrade); console.log(`gas dinamis per trade: n ${v.length} median ${f(q(v,.5))} p90 ${f(q(v,.9))} maks ${f(Math.max(...v))} (asumsi lama: 3x0,06+0,03 = $0,21)`);
fs.writeFileSync(OUTG,JSON.stringify(perTrade));
