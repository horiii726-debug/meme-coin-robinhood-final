// MFE (maximum favorable excursion) dari data swap on-chain nyata.
// Untuk tiap koin yang ditrade v4: harga acuan = sqrtP swap terakhir <= entryBlk,
// lalu maksimum rasio harga pada beberapa horizon setelah masuk. Tidak ada asumsi/sintetis.
const fs=require("fs"), readline=require("readline");
const D=process.argv[2], SW=process.argv[3], OUT=process.argv[4];
const NATIVE="0x0000000000000000000000000000000000000000";
const tr=fs.readFileSync(`${D}/trades.jsonl`,"utf8").trim().split("\n").map(JSON.parse).filter(t=>t.plan==="v4");
const pools=new Map(fs.readFileSync(`${D}/pools.csv`,"utf8").trim().split("\n").slice(1).map(l=>l.trim().split(",")).map(p=>[p[0].toLowerCase(),p]));
const HZ=[3000,9000,36000,108000,324000];   // ~5mnt, 15mnt, 1jam, 3jam, 9jam (blok 0,1013 dtk)
const M=new Map();
for(const t of tr){
  const p=pools.get(t.pool); if(!p) continue;
  M.set(t.pool,{e:t.entryBlk,q1:p[2].toLowerCase()===NATIVE,ref:null,refB:-1,
    mx:HZ.map(()=>1),mb:HZ.map(()=>0),last:1,lastB:0,n:0,peakV:t.peakV,ret:t.ret,init:t.init});
}
(async()=>{
  const rl=readline.createInterface({input:fs.createReadStream(SW),crlfDelay:Infinity});
  let ln=0;
  for await(const line of rl){
    if(++ln===1&&line.startsWith("pool_id")) continue;
    const c=line.indexOf(","); const id=line.slice(0,c).toLowerCase();
    const o=M.get(id); if(o===undefined) continue;
    const p=line.split(","); const blk=+p[1]; const sp=Number(p[6]);
    if(!isFinite(sp)||sp<=0) continue;
    if(blk<=o.e){ if(blk>=o.refB){o.ref=sp;o.refB=blk;} continue; }
    if(o.ref===null) continue;
    const r=o.q1?Math.pow(sp/o.ref,2):Math.pow(o.ref/sp,2);
    if(!isFinite(r)||r<=0) continue;
    o.n++; o.last=r; o.lastB=blk;
    for(let i=0;i<HZ.length;i++) if(blk<=o.e+HZ[i]&&r>o.mx[i]){o.mx[i]=r;o.mb[i]=blk;}
  }
  const rows=[["pool","init","entry","q1","nswap","ref"].concat(HZ.map(h=>"mfe"+h)).concat(HZ.map(h=>"mfeb"+h)).concat(["peakV","ret"]).join(",")];
  for(const [k,o] of M) rows.push([k,o.init,o.e,o.q1?1:0,o.n,o.ref===null?"":o.ref.toExponential(8)]
    .concat(o.mx.map(x=>x.toFixed(6))).concat(o.mb).concat([o.peakV,o.ret]).join(","));
  fs.writeFileSync(OUT,rows.join("\n"));
  console.error(D,"MFE untuk",M.size,"koin ->",OUT);
})();
