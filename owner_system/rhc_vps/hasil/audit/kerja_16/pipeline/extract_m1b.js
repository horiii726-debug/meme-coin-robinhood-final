// Swap menit-1 (<= init+600) untuk tiap koin yang ditrade v4, per dataset.
const fs=require("fs"), readline=require("readline");
const D=process.argv[2];
const trades=fs.readFileSync(`${D}/trades.jsonl`,"utf8").trim().split("\n").map(JSON.parse).filter(t=>t.plan==="v4");
const want=new Map(trades.map(t=>[t.pool,t.init]));
const out={};
(async()=>{
  const rl=readline.createInterface({input:fs.createReadStream(process.env.SWAPS||`${D}/swaps_sorted.csv`),crlfDelay:Infinity});
  for await(const line of rl){
    const id=line.slice(0,line.indexOf(",")).toLowerCase(); const init=want.get(id); if(init===undefined) continue;
    const p=line.split(","); const blk=+p[1]; if(blk>init+600) continue;
    (out[id]=out[id]||[]).push([blk,+p[2],p[4],p[5],p[6],p[7],+p[9]]);   // blk,li,a0,a1,sqrtPX96,L,fee
  }
  fs.writeFileSync(`${D}/swaps_m1.json`,JSON.stringify(out));
  console.error(D,"swap menit-1 untuk",Object.keys(out).length,"pool dari",want.size);
})();
