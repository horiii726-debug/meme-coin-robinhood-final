// AUDIT06 (c): antrean nonce SATU dompet. Tx dikirim berurutan; tx berikutnya baru bisa dikirim setelah tx sebelumnya
// ditambang (latb blok). Urutan: beli -> approve (langsung setelah beli) -> TP1 -> jual keluar. Hanya pool yang diambil arena.
// pakai: node antrean_nonce.js <run_events> <dump.json> <latb> <out.json>
const fs=require("fs");
const [RUN,DUMP,LATB,OUT]=process.argv.slice(2); const lat=+LATB;
const taken=new Set(JSON.parse(fs.readFileSync(DUMP,"utf8")).map(t=>t.pool));
const tx=[];
for(const D of ["ags1","ags4","u_ds5d","u_ds24","m1","m2"]){
  for(const e of fs.readFileSync(`${RUN}/${D}/events.jsonl`,"utf8").trim().split("\n").filter(Boolean).map(JSON.parse)){
    if(!taken.has(e.pool)) continue;
    if(e.type==="entry"){ tx.push({pool:e.pool,k:"e",want:e.blk-lat,occ:lat}); tx.push({pool:e.pool,k:"ap",want:e.blk,occ:lat}); }
    else if(e.plan==="v4"&&e.type==="tp1") tx.push({pool:e.pool,k:"t",want:e.blk,occ:e.tgt-e.blk});
    else if(e.plan==="v4"&&e.type==="exit_signal") tx.push({pool:e.pool,k:"x",want:e.blk,occ:e.tgt-e.blk});
  }
}
tx.sort((a,b)=>a.want-b.want||(a.k==="ap"?-1:1));
let free=-1; const map={}; const d=[];
for(const t of tx){ const start=Math.max(t.want,free); const dl=start-t.want; free=start+t.occ;
  if(t.k!=="ap"){ (map[t.pool]=map[t.pool]||{})[t.k]=dl; d.push(dl); } }
d.sort((a,b)=>a-b);
const q=p=>d[Math.min(d.length-1,Math.floor(p*d.length))];
console.log(`tx ${tx.length} | tertunda ${d.filter(x=>x>0).length}/${d.length} | tunda p50 ${q(.5)} p90 ${q(.9)} p99 ${q(.99)} maks ${d[d.length-1]} blok`);
fs.writeFileSync(OUT,JSON.stringify(map));
