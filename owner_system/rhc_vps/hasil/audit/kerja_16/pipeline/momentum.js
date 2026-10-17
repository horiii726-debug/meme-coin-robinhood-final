// Jalur MASUK KEDUA ("momentum"): kalau koin sudah naik X kali dari harga menit-1, apakah masih layak dibeli?
// Semua dari swap on-chain nyata. Masuk di blok pemicu + latensi 30 blok, ukuran sama, slippage kita dihitung.
// Keluar didekati dengan trailing TRAIL dari puncak sesudah 1,2x + batas horizon (pendekatan aturan keluar baru).
const fs=require("fs"), readline=require("readline");
const D=process.argv[2], SW=process.argv[3], OUT=process.argv[4], LIQ=process.argv[5];
const NATIVE="0x0000000000000000000000000000000000000000", Q96=Math.pow(2,96);
const TRIG=(process.env.TRIG||"1.5,2,3,5").split(",").map(Number);
const CTRL=process.env.CTRL==="1";   // kontrol: pemicu diganti blok ACAK (uji permutasi waktu masuk)
const h32=str=>{let h=2166136261;for(let i=0;i<str.length;i++){h^=str.charCodeAt(i);h=Math.imul(h,16777619);}return (h>>>0)/4294967296;};
const LAT=+(process.env.LAT||30), HZ=+(process.env.HZ||324000), TRAIL=+(process.env.TRAIL||0.40);
const tr={};
for(const l of fs.readFileSync(`${D}/trades.jsonl`,"utf8").trim().split("\n")){const t=JSON.parse(l); if(t.plan==="v4") tr[t.pool]=t;}
const pools=new Map(fs.readFileSync(`${D}/pools.csv`,"utf8").trim().split("\n").slice(1).map(l=>l.trim().split(",")).map(p=>[p[0].toLowerCase(),p]));
const toUsd=(r,eth)=>(Math.abs(r)/1e18)*eth;
function sellVal(q1,sp,L,fee,bTok,eth){ if(bTok<=0) return 0; const bIn=bTok*(1-fee/1e6); let r;
  if(q1){const inv=1/sp+bIn/L; r=L*(sp-1/inv);} else {const spb=sp+bIn/L; r=L*(1/sp-1/spb);}
  return (!isFinite(r)||r<=0)?0:toUsd(r,eth); }
function buyBase(q1,sp,L,fee,size,eth){ const dIn=(size/eth)*1e18*(1-fee/1e6); let b;
  if(q1){const sp1=sp+dIn/L; b=L*(1/sp-1/sp1);} else {const inv=1/sp+dIn/L; b=L*(sp-1/inv);}
  return (isFinite(b)&&b>0)?b:0; }
const M=new Map();
for(const [pool,t] of Object.entries(tr)){
  const p=pools.get(pool); if(!p) continue;
  M.set(pool,{q1:p[2].toLowerCase()===NATIVE,e:t.entryBlk,size:t.size,eth:t.ethUsd,init:t.init,ret0:t.ret,
    ex:null,base:null,lp0:0,ns:0,nb:0,nsl:0,bu:0,su:0,vmax:0,arms:TRIG.map(()=>({state:0,trigBlk:0,entBlk:0,base:0,peak:0,v:0,exitV:null,exitBlk:0,mfe:0,lpEnt:0,lastBlk:0}))});
}
// rug: LP yang ditarik > 80% dari yang pernah ditambahkan (aturan sama dengan v4engine)
const RUG={};
if(LIQ&&fs.existsSync(LIQ)){
  const acc={};
  for(const line of fs.readFileSync(LIQ,"utf8").split(String.fromCharCode(10))){
    const c=line.indexOf(","); if(c<0) continue; const id=line.slice(0,c).toLowerCase();
    if(!M.has(id)) continue;
    const p=line.split(","); const blk=+p[1]; const d=BigInt(p[5]);
    const a=acc[id]=acc[id]||{a:0n,r:0n};
    if(d>0n) a.a+=d; else a.r+=-d;
    if(a.a>0n && RUG[id]===undefined && a.r*100n/a.a>80n) RUG[id]=blk;
  }
  console.error("  pool dengan rug (LP ditarik >80%):",Object.keys(RUG).length,"dari",M.size);
}
(async()=>{
  const rl=readline.createInterface({input:fs.createReadStream(SW),crlfDelay:Infinity});
  let ln=0;
  for await(const line of rl){
    if(++ln===1&&line.startsWith("pool_id")) continue;
    const c=line.indexOf(","); const id=line.slice(0,c).toLowerCase();
    const o=M.get(id); if(o===undefined) continue;
    const p=line.split(","); const blk=+p[1];
    if(blk>o.e+HZ) continue;
    const sp=Number(p[6])/Q96, L=Number(p[7]), fee=+p[9];
    if(!isFinite(sp)||sp<=0||!isFinite(L)||L<=0) continue;
    if(blk<=o.e){ o.ex={sp,L,fee}; continue; }
    if(o.base===null){ if(!o.ex){continue;} o.base=buyBase(o.q1,o.ex.sp,o.ex.L,o.ex.fee,o.size,o.eth)||-1;
      o.lp0=2*toUsd(o.q1?o.ex.L*o.ex.sp:o.ex.L/o.ex.sp,o.eth); }
    if(o.base<=0) continue;
    { const a0=+p[4], a1=+p[5]; const beli=(o.q1?a0:a1)>0; const u=(Math.abs(o.q1?a1:a0)/1e18)*o.eth;
      o.ns++; if(beli){o.nb++;o.bu+=u;} else {o.nsl++;o.su+=u;} }
    const v0=sellVal(o.q1,sp,L,fee,o.base,o.eth)/o.size;      // nilai kalau masuk di menit-1
    if(v0>o.vmax) o.vmax=v0;
    const rb=RUG[id];
    for(let k=0;k<TRIG.length;k++){
      const a=o.arms[k];
      if(rb!==undefined&&blk>=rb){ if(a.state===2&&a.exitV===null){a.exitV=0;a.exitBlk=rb;a.v=0;} if(a.state<2)a.state=3; continue; }
      if(a.state===0){ const pemicu = CTRL ? (blk>=o.e+Math.floor(h32(id+"|"+k)*HZ*0.35)) : (v0>=TRIG[k]); if(pemicu){a.state=1;a.trigBlk=blk;} continue; }
      if(a.state===1){ if(blk<a.trigBlk+LAT) continue;         // latensi: baru bisa terisi setelah 30 blok
        a.base=buyBase(o.q1,sp,L,fee,o.size,o.eth); a.entBlk=blk; a.lpEnt=2*toUsd(o.q1?L*sp:L/sp,o.eth);
        if(a.base<=0){a.state=3;continue;}
        a.state=2; a.v=sellVal(o.q1,sp,L,fee,a.base,o.eth)/o.size; a.peak=a.v; a.mfe=a.v;
        a.f={dly:blk-o.e,ns:o.ns,nb:o.nb,nsl:o.nsl,bu:o.bu,su:o.su,lp:a.lpEnt,lpr:o.lp0>0?a.lpEnt/o.lp0:0,v0:v0,vmax:o.vmax}; continue; }
      if(a.state===2){
        const v=sellVal(o.q1,sp,L,fee,a.base,o.eth)/o.size;
        if(v>a.peak) a.peak=v; if(v>a.mfe) a.mfe=v;
        if(a.exitV===null && a.peak>=1.2 && v<=a.peak*(1-TRAIL)){a.exitV=v;a.exitBlk=blk;}
        a.v=v; a.lastBlk=blk;
      }
    }
  }
  const ds=D.split(String.fromCharCode(92)).join("/").split("/").filter(Boolean).pop();
  const FK=["dly","ns","nb","nsl","bu","su","lp","lpr","v0"];
  const hdr=["ds","pool","size","ret0"].concat(FK.map(x=>"f_"+x));
  for(const t of TRIG) hdr.push(`t${t}_hit`,`t${t}_entblk`,`t${t}_lp`,`t${t}_mfe`,`t${t}_exit`,`t${t}_last`,`t${t}_exblk`);
  const rows=[hdr.join(",")];
  for(const [pool,o] of M){
    const a0=o.arms[0]; const r=[ds,pool,(o.size||0).toFixed(2),o.ret0].concat(FK.map(k=>a0.f?(+a0.f[k]).toFixed(6):""));
    for(let k=0;k<TRIG.length;k++){const a=o.arms[k];
      r.push(a.state>=2?1:0,a.entBlk,a.lpEnt.toFixed(1),a.mfe.toFixed(4),a.exitV===null?"":a.exitV.toFixed(4),a.v.toFixed(4),a.exitBlk||a.lastBlk||(o.e+HZ)); }
    rows.push(r.join(","));
  }
  fs.writeFileSync(OUT,rows.join("\n"));
  console.error(ds,"momentum:",M.size,"koin ->",OUT);
})();
