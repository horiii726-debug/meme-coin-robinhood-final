// MFE SEBENARNYA: nilai posisi kalau DIJUAL pada tiap swap, memakai rumus mesin (v4engine sellVal),
// dilacak penuh sampai entry+HZ tanpa dipotong aturan keluar. Data on-chain nyata, tanpa asumsi.
const fs=require("fs"), readline=require("readline");
const D=process.argv[2], SW=process.argv[3], OUT=process.argv[4];
const NATIVE="0x0000000000000000000000000000000000000000", Q96=Math.pow(2,96);
const HZ=[3000,9000,36000,108000,324000];
const tr={};
for(const l of fs.readFileSync(`${D}/trades.jsonl`,"utf8").trim().split("\n")){
  const t=JSON.parse(l); if(t.plan!=="v4") continue; tr[t.pool]=t;
}
const pools=new Map(fs.readFileSync(`${D}/pools.csv`,"utf8").trim().split("\n").slice(1).map(l=>l.trim().split(",")).map(p=>[p[0].toLowerCase(),p]));
const M=new Map();
for(const [pool,t] of Object.entries(tr)){
  const p=pools.get(pool); if(!p) continue;
  M.set(pool,{q1:p[2].toLowerCase()===NATIVE,e:t.entryBlk,size:t.size,ethUsd:t.ethUsd,init:t.init,ret:t.ret,peakV:t.peakV,
    ex:null,base:null,mx:HZ.map(()=>0),mb:HZ.map(()=>0),n:0,vlast:0,ethR:t.ethUsd});
}
const toUsd=(r,eth)=>(Math.abs(r)/1e18)*eth;
function sellVal(q1,sqrtP,L,fee,bTok,eth){
  if(bTok<=0) return 0; const bIn=bTok*(1-fee/1e6); let r;
  if(q1){const inv=1/sqrtP+bIn/L; r=L*(sqrtP-1/inv);} else {const spb=sqrtP+bIn/L; r=L*(1/sqrtP-1/spb);}
  return (!isFinite(r)||r<=0)?0:toUsd(r,eth);
}
(async()=>{
  const rl=readline.createInterface({input:fs.createReadStream(SW),crlfDelay:Infinity});
  let ln=0;
  for await(const line of rl){
    if(++ln===1&&line.startsWith("pool_id")) continue;
    const c=line.indexOf(","); const id=line.slice(0,c).toLowerCase();
    const o=M.get(id); if(o===undefined) continue;
    const p=line.split(","); const blk=+p[1];
    if(blk>o.e+HZ[HZ.length-1]) continue;
    const sqrtP=Number(p[6])/Q96, L=Number(p[7]), fee=+p[9];
    if(!isFinite(sqrtP)||sqrtP<=0||!isFinite(L)||L<=0) continue;
    if(blk<=o.e){ o.ex={sqrtP,L,fee}; continue; }           // kondisi pool tepat sebelum masuk
    if(o.base===null){
      if(!o.ex) continue;
      const x=o.ex, dIn=(o.size/o.ethUsd)*1e18*(1-x.fee/1e6); let base;
      if(o.q1){const sp1=x.sqrtP+dIn/x.L; base=x.L*(1/x.sqrtP-1/sp1);}
      else {const inv=1/x.sqrtP+dIn/x.L; base=x.L*(x.sqrtP-1/inv);}
      if(!isFinite(base)||base<=0){o.base=-1;continue;}
      o.base=base;
    }
    if(o.base<=0) continue;
    const v=sellVal(o.q1,sqrtP,L,fee,o.base,o.ethUsd)/o.size;
    if(!isFinite(v)) continue;
    o.n++; o.vlast=v;
    for(let i=0;i<HZ.length;i++) if(blk<=o.e+HZ[i]&&v>o.mx[i]){o.mx[i]=v;o.mb[i]=blk;}
  }
  const hdr=["ds","pool","init","entry","size","nswap"].concat(HZ.map(h=>"v"+h)).concat(HZ.map(h=>"vb"+h)).concat(["vlast","ret_v4","peakV_v4"]);
  const rows=[hdr.join(",")];
  const ds=D.split(String.fromCharCode(92)).join("/").split("/").filter(Boolean).pop();
  for(const [k,o] of M) rows.push([ds,k,o.init,o.e,o.size.toFixed(2),o.n]
    .concat(o.mx.map(x=>x.toFixed(5))).concat(o.mb).concat([o.vlast.toFixed(5),o.ret,o.peakV]).join(","));
  fs.writeFileSync(OUT,rows.join("\n"));
  console.error(ds,"MFE2 untuk",M.size,"koin ->",OUT);
})();
