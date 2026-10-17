// MFE mesin: nilai posisi tertinggi yang BISA dijual (sudah termasuk slippage kita), dari replay.
// perfect = max V sepanjang jendela pelacakan; diambil maksimum atas 3 rencana (v2 memegang paling lama).
const fs=require("fs");
const out=[["ds","pool","init","entry","mfe","ret_v4","peakV_v4","size","lp_entry"].join(",")];
for(const a of process.argv.slice(2)){
  const [ds,path]=a.split("=");
  const per={};
  for(const l of fs.readFileSync(path,"utf8").trim().split("\n")){
    const t=JSON.parse(l);
    const o=per[t.pool]=per[t.pool]||{init:t.init,entry:t.entryBlk,mfe:0,size:t.size};
    if(t.perfect>o.mfe) o.mfe=t.perfect;
    if(t.plan==="v4"){o.ret=t.ret;o.peakV=t.peakV;o.entry=t.entryBlk;o.size=t.size;}
  }
  let n=0;
  for(const [pool,o] of Object.entries(per)){ if(o.ret===undefined) continue; n++;
    out.push([ds,pool,o.init,o.entry,o.mfe,o.ret,o.peakV,o.size,""].join(",")); }
  console.error(ds,n,"koin");
}
fs.writeFileSync(process.env.OUT||"mfe_eng.csv",out.join("\n"));
