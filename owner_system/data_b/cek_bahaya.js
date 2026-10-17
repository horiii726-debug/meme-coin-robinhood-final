// Apakah "model bahaya" benar-benar meramal, atau cuma tebak? Ukur harga SETELAH bot menjual.
const fs=require("fs"), readline=require("readline");
const Q96=Math.pow(2,96), NATIVE="0x0000000000000000000000000000000000000000";
(async()=>{
for(const D of ["m1","m2"]){
  const tr=fs.readFileSync(`${D}/trades.jsonl`,"utf8").trim().split("\n").map(JSON.parse).filter(t=>t.plan==="v4");
  const pools=new Map(fs.readFileSync(`${D}/pools.csv`,"utf8").trim().split("\n").slice(1).map(l=>l.trim().split(",")).map(p=>[p[0].toLowerCase(),p]));
  const want=new Map(tr.map(t=>[t.pool,t]));
  const after={};                       // pool -> {exitP, maxP, minP, lastP}
  const rl=readline.createInterface({input:fs.createReadStream(`${D}/swaps_sorted.csv`),crlfDelay:Infinity});
  for await(const line of rl){
    const id=line.slice(0,line.indexOf(",")).toLowerCase(); const t=want.get(id); if(!t) continue;
    const p=line.split(","); const blk=+p[1]; const sp=Number(p[6])/Q96;
    const meta=pools.get(id); const q1=meta[2].toLowerCase()===NATIVE;
    const price=q1?sp*sp:1/(sp*sp);
    if(!Number.isFinite(price)||price<=0) continue;
    const a=after[id]=after[id]||{};
    if(blk<=t.exitBlk){a.exitP=price;continue;}           // harga terakhir sampai saat jual
    if(blk>t.exitBlk+18000) continue;                     // 30 menit setelah jual
    a.maxP=Math.max(a.maxP||0,price); a.minP=Math.min(a.minP===undefined?price:a.minP,price); a.lastP=price;
  }
  const grup={};
  for(const t of tr){
    const a=after[t.pool]; if(!a||!a.exitP||a.maxP===undefined) continue;
    const g=grup[t.reason]=grup[t.reason]||{n:0,turun:0,naik:0,sumMax:0,sumLast:0};
    g.n++; if(a.lastP<a.exitP)g.turun++; else g.naik++;
    g.sumMax+=a.maxP/a.exitP; g.sumLast+=a.lastP/a.exitP;
  }
  console.log(`\n=== ${D}: harga 30 MENIT SETELAH bot menjual ===`);
  console.log("sebab keluar            |   n | harga turun | puncak setelah jual | harga akhir");
  for(const [k,g] of Object.entries(grup).sort((a,b)=>b[1].n-a[1].n)){
    if(g.n<10) continue;
    console.log(`${k.padEnd(23)} | ${String(g.n).padStart(3)} | ${(100*g.turun/g.n).toFixed(0).padStart(9)}% | ${(g.sumMax/g.n).toFixed(2).padStart(17)}x | ${(g.sumLast/g.n).toFixed(2)}x`);
  }
}
})();
