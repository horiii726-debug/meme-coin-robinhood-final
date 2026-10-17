// AUDIT06: ambil receipt NYATA tx swap (gasUsed x effectiveGasPrice) lewat RPC+DoH, jeda antar batch, cache bisa dilanjut.
// Sumber tx: (1) semua event trade yang diambil arena (pool sama, saat kejadian); (2) sampel acak event tiap periode (untuk distribusi per jam).
const fs=require("fs"),{spawnSync}=require("child_process");
const env={}; for(const l of fs.readFileSync("C:/Users/horii/rhc-quant/rhc_vps/bot/.env","utf8").split(/\r?\n/)){const m=l.match(/^([A-Z_]+)=(.*)$/); if(m) env[m[1]]=m[2].trim();}
const URL=(env.RPC_URLS||"").split(",")[0].trim(), DOH=env.DOH_URL;
const CACHE="gas_cache.json"; const C=fs.existsSync(CACHE)?JSON.parse(fs.readFileSync(CACHE,"utf8")):{};
const DIRS=["ags1","ags4","u_ds5d","u_ds24","m1","m2"];
const RUNS=(process.env.RUNS||"run_dasar").split(",");
const taken=new Set(); for(const f of (process.env.DUMPS||"run_base/dump.json").split(",")) for(const t of JSON.parse(fs.readFileSync(f,"utf8"))) taken.add(t.pool);
let need=new Set();
let seed=12345; const rnd=()=>{seed=(seed*1103515245+12345)%2147483648; return seed/2147483648;};
for(const R of RUNS) for(const D of DIRS){
  const ev=fs.readFileSync(`${R}/${D}/events.jsonl`,"utf8").trim().split("\n").filter(Boolean).map(JSON.parse).filter(e=>e.tx);
  for(const e of ev) if(taken.has(e.pool)&&(e.plan===undefined||e.plan==="v4")) need.add(e.tx);
  if(R===RUNS[0]){ const n=+(process.env.SAMPLE||150); for(const e of ev) if(rnd()<n/ev.length) need.add(e.tx); }
}
need=[...need].filter(t=>!(t in C));
console.error("tx perlu diambil:",need.length,"| sudah di cache:",Object.keys(C).length);
const sleep=ms=>spawnSync("node",["-e",`setTimeout(()=>{},${ms})`]);
const B=10;
for(let i=0;i<need.length;i+=B){
  const part=need.slice(i,i+B);
  const body=JSON.stringify(part.map((h,k)=>({jsonrpc:"2.0",id:k,method:"eth_getTransactionReceipt",params:[h]})));
  let ok=false;
  for(let a=0;a<6&&!ok;a++){
    const r=spawnSync("curl",["-s","-m","30",...(DOH?["--doh-url",DOH]:[]),"-X","POST",URL,"-H","Content-Type: application/json","-d",body],{encoding:"utf8"});
    try{ const j=JSON.parse(r.stdout); if(!Array.isArray(j)) throw 0;
      for(const x of j){ const rc=x.result; if(!rc) continue; C[part[x.id]]={blk:parseInt(rc.blockNumber,16),gas:parseInt(rc.gasUsed,16),gp:parseInt(rc.effectiveGasPrice,16),l1:parseInt(rc.gasUsedForL1||"0x0",16),ok:rc.status==="0x1"}; }
      ok=true; }catch(e){ sleep(1500*2**a); }
  }
  if(i%100===0){ fs.writeFileSync(CACHE,JSON.stringify(C)); console.error(i+part.length,"/",need.length); }
  sleep(700);
}
fs.writeFileSync(CACHE,JSON.stringify(C)); console.error("SELESAI cache",Object.keys(C).length);
