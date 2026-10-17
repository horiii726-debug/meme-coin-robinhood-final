// ARENA — simulasi akun seolah-olah live. Semua aturan di ARENA_RULES.md. Tidak ada intip masa depan.
const fs=require("fs");
const R=fs.readFileSync(process.env.SCORED||"arena_scored.csv","utf8").split(String.fromCharCode(13)).join("").trim().split(String.fromCharCode(10));
const hdr=R[0].split(",");
const GAS={};
// ===== opsi mk =====
const h32=str=>{let h=2166136261>>>0;for(let i=0;i<str.length;i++){h^=str.charCodeAt(i);h=Math.imul(h,16777619)>>>0;}return h/4294967296;};
const GASDS=process.env.GASDS?JSON.parse(fs.readFileSync(process.env.GASDS,"utf8")):null;
const DROP=+(process.env.DROP||0);
const BASE={}; const BK=[];
const DSL=["ags1","ags4","u_ds5d","u_ds24","m1","m2","okt1"];
const muat=(trf)=>{const M={};for(const D of DSL){try{for(const l of fs.readFileSync(D+"/"+trf,"utf8").trim().split(String.fromCharCode(10))){const t=JSON.parse(l);if(t.plan==="v4")M[t.pool]=t;}}catch(e){}}return M;};
if(process.env.BUCKETS){ Object.assign(BASE,muat(process.env.TRF||"trades.jsonl")); for(const x of process.env.BUCKETS.split(",")){const [f,trf]=x.split(":");BK.push({f:+f,M:muat(trf)});} BK.sort((a,b)=>a.f-b.f); }
if(GASDS&&!process.env.BUCKETS) Object.assign(BASE,muat(process.env.TRF||"trades.jsonl"));
const ASRD={}; if(process.env.NOASRD){ for(const D of DSL){ try{ const L=fs.readFileSync(D+"/pools.csv","utf8").split(String.fromCharCode(10)).slice(1); for(const l of L){const q=l.split(","); if(q.length<6) continue; const h=parseInt(q[5].slice(-4),16)&0x3fff; if(((h>>2)&1)&&!((h>>7)&1)) ASRD[q[0].toLowerCase()]=1;} }catch(e){} } }
const gasDolar=(ds,t)=>{ if(!GASDS||!t) return null; const g=GASDS[ds]; if(!(g>0)) return null; const tx=t.fails?1:(Number.isFinite(t.txs)?t.txs:3); return tx*g+(t.fails?0:0.3*g); };
let nDrop=0,nAsrd=0; const bkHit={};
for(const D of ["ags1","ags4","u_ds5d","u_ds24","m1","m2","okt1"]){ try{ for(const l of fs.readFileSync(D+"/"+(process.env.TRF||"trades.jsonl"),"utf8").trim().split(String.fromCharCode(10))){ const t=JSON.parse(l); if(t.plan==="v4") GAS[t.pool]={g:t.gasTot||0,s:t.size||0}; } }catch(e){} }
const rows=R.slice(1).map(l=>{const p=l.split(",");const o={};hdr.forEach((h,i)=>o[h]=p[i]);return o;})
  .map(o=>({ds:o.ds,pool:o.pool,decide:+o.decide,entry:+o.entry,exit:+o.exit,ret:+o.ret,gasTot:GAS[o.pool]?GAS[o.pool].g:0,size:GAS[o.pool]?GAS[o.pool].s:0,
            jual:+o.jual_m1,dev:o.dev||null,lp:parseFloat(o.lp_m1)||0,score:o.score===""?NaN:+o.score,moon:(o.moon===undefined||o.moon==="")?NaN:+o.moon,rug:(o.rug===undefined||o.rug==="")?NaN:+o.rug,nswap:+o.n_swap}))
  .filter(o=>!process.env.ONLY||process.env.ONLY.split(",").includes(o.ds))
  .filter(o=>!process.env.BLKFROM||(o.decide>=+process.env.BLKFROM&&o.decide<=+process.env.BLKTO))
  .sort((a,b)=>a.decide-b.decide);

const START=+(process.env.START||100), MAXPOS=+(process.env.MAXPOS||20), KILL=+(process.env.KILL||0.60), THR0=+(process.env.THR0||0.195);   // live: thr_start model   // stop darurat 60% seperti live
const KCAP=+(process.env.KCAP||0.10);   // disamakan dengan live setelah audit 19 Sep   // batas atas 1/4 Kelly
const MINPOS=+(process.env.MINPOS||0.25);   // posisi terkecil yang masih layak digas
const SLIP=process.env.SLIP==="1";
const EXPMAX=+(process.env.EXPMAX||1);   // batas eksposur TOTAL (bagian equity yang boleh terpakai serentak)
const REM=process.env.REM==="1";        // rem bertahap saat drawdown
const SOPT=process.env.SOPT==="1";      // ukuran optimal setelah slippage
const QTHR=+(process.env.QTHR||0.30);
const MOONQ=+(process.env.MOONQ||0);   // jalur roket: beli juga koin dgn skor roket di atas kuantil ini (0 = mati)
const recentMoon=[]; let nMoon=0; const RUGQ=+(process.env.RUGQ||0); const QUIET=process.env.QUIET?process.env.QUIET.split(",").map(Number):null; const FIXQ=+(process.env.FIXQ||0.02); const EXTRAGAS=+(process.env.EXTRAGAS||0); let nSepi=0; const recentRug=[];   // buang skor terburuk sekian persen
const LPCAP=+(process.env.LPCAP||0);   // batas posisi sbg pecahan likuiditas pool
const FIX=+(process.env.FIXFRAC||0);   // ukuran tetap % equity (0 = pakai 1/4 Kelly)
const NBAGI=+(process.env.NBAGI||1);   // f*/4 dibagi ke berapa posisi bersamaan (1 = cara lama)
const HONEY=process.env.HONEY!=="0", DEVR=process.env.DEV!=="0", MLR=process.env.ML!=="0";
let cash=START, peak=START, ddMax=0, killed=false;
const DECS=[]; function DEC(t,w){ if(process.env.DECF) DECS.push({ds:t.ds,pool:t.pool,score:t.score,why:w}); }
const mktAll=[], mktWin=[]; const REMREZIM=+(process.env.REMREZIM||0); let nRemRezim=0;
if(process.env.MKTPRE){ const L=fs.readFileSync(process.env.MKTPRE,"utf8").split(String.fromCharCode(13)).join("").trim().split(String.fromCharCode(10)); const h=L[0].split(","); const ir=h.indexOf("ret"); for(const l of L.slice(1)){ const r=+l.split(",")[ir]; if(Number.isFinite(r)){ mktAll.push(r<0.3?1:0); mktWin.push(r<0.3?1:0); if(mktWin.length>100) mktWin.shift(); } } }
const openPos=new Map(); const closed=[]; const recent=[]; const devHist={};
// KPRE: muat return trade akun dari periode SEBELUMNYA ke riwayat Kelly (akun yang sudah jalan, bukan mulai dari nol). Kausal.
if(process.env.KPRE){ for(const d of JSON.parse(fs.readFileSync(process.env.KPRE,"utf8"))) closed.push({ret:d.ret,pnl:0,pool:d.pool,ds:d.ds,blk:0,hold:0,pre:true}); console.error(`riwayat Kelly dimuat: ${closed.length} trade`); }
// DEVPRE: muat riwayat dev dari periode SEBELUMNYA (seperti dev_history.json bot live). Kausal: trade yang sudah tutup.
if(process.env.DEVPRE){ const L=fs.readFileSync(process.env.DEVPRE,"utf8").split(String.fromCharCode(13)).join("").trim().split(String.fromCharCode(10));
  const h=L[0].split(","), id=h.indexOf("dev"), ir=h.indexOf("ret"); let n=0;
  for(const l of L.slice(1)){ const p=l.split(","); if(p[id]){ (devHist[p[id]]=devHist[p[id]]||[]).push(+p[ir]); n++; } }
  console.error(`riwayat dev dimuat: ${n} koin, ${Object.keys(devHist).length} dev`); }
const eqCurve=[];
const q=(a,p)=>{const s=[...a].sort((x,y)=>x-y);return s[Math.min(s.length-1,Math.floor(p*s.length))];};
function kelly(){
  const r=(process.env.KPISAH?closed.filter(c=>!c.sepi):closed).map(c=>c.ret);   // KPISAH: Kelly utama tidak dicampur jalur sepi
  if(r.length<30) return 0.02;
  if(r.length<100) return 0.094;
  let best=0.02,bv=-1e9;
  for(let f=0.01;f<=0.6;f+=0.005){let s=0,ok=true;
    for(const x of r){const v=1+f*(x-1); if(v<=0){ok=false;break;} s+=Math.log(v);}
    if(ok&&s/r.length>bv){bv=s/r.length;best=f;}}
  return Math.max(0.01,Math.min(KCAP,best/4));
}
const ev=[];
for(const t of rows){ev.push({b:t.decide,k:"putus",t});ev.push({b:t.exit,k:"tutup",t});}
ev.sort((a,b)=>a.b-b.b||(a.k==="tutup"?-1:1));
const tolak={ml:0,dev:0,honey:0,slot:0,kill:0,kas:0,noskor:0,eksposur:0};
let beli=0, besarCount=0; const dump=[]; const kellyLog=[], concLog=[];
const dyn=[];   // tutup dinamis (mode BUCKETS): urut blok
function tutupPos(b,t,p){
    openPos.delete(t.pool);
    const slip = (SLIP && p.lp>0 && !BK.length) ? Math.min(0.9, 2*p.pos/p.lp) : 0;
    const tr=p.tr;   // trade mesin yang dipakai (ember ukuran) atau null
    const ret=tr?tr.ret:t.ret, gasTot=tr?(tr.gasTot||0):t.gasTot, size=tr?tr.size:t.size;
    const gT=(gasTot!==undefined&&size)?gasTot:0;
    const grossRet=gT&&size?(ret+gT/size):ret;
    const gReal=gasDolar(t.ds,tr||BASE[t.pool]||{txs:3}); const gPay=gReal!==null?gReal:gT;
    const back=Math.max(0,p.pos*grossRet*(1-slip)-gPay-EXTRAGAS); cash+=back;
    closed.push({ret:ret,pnl:back-p.pos,pool:t.pool,ds:t.ds,blk:b,hold:(t.exit-t.entry)*0.1013/60,sepi:!!t.sepi});
    if(t.dev)(devHist[t.dev]=devHist[t.dev]||[]).push(ret);
    const eq=cash+[...openPos.values()].reduce((a,x)=>a+x.pos,0);
    peak=Math.max(peak,eq); ddMax=Math.max(ddMax,1-eq/peak);
    if(!killed&&1-eq/peak>KILL) killed=true;
    eqCurve.push([b,+eq.toFixed(2)]);
}
const tutupDyn=(b)=>{ while(dyn.length&&dyn[0].b<=b){ const d=dyn.shift(); const p=openPos.get(d.t.pool); if(p) tutupPos(d.b,d.t,p); } };
for(const e of ev){
  const t=e.t;
  if(BK.length) tutupDyn(e.k==="tutup"?e.b:e.b);
  if(e.k==="tutup"){ mktAll.push(t.ret<0.3?1:0); mktWin.push(t.ret<0.3?1:0); if(mktWin.length>100) mktWin.shift(); }   // rem rezim: semua koin yg sudah tutup (kausal)
  if(e.k==="tutup"){
    if(BK.length) continue;   // posisi ditutup lewat antrean dinamis
    const p=openPos.get(t.pool); if(!p) continue;
    if(GASDS){ tutupPos(e.b,t,p); continue; }
    openPos.delete(t.pool);
    // SLIP=1: potong hasil sesuai dampak harga kita sendiri (beli mendorong naik, jual menekan turun)
    const slip = (SLIP && p.lp>0) ? Math.min(0.9, 2*p.pos/p.lp) : 0;
    // koreksi gas seperti live: lepas gas yang terskala ukuran simulasi, pasang kembali sebagai dolar tetap
    const gT=(t.gasTot!==undefined&&t.size)?t.gasTot:0;
    const grossRet=gT&&t.size?(t.ret+gT/t.size):t.ret;
    const back=Math.max(0,p.pos*grossRet*(1-slip)-gT-EXTRAGAS); cash+=back;
    closed.push({ret:t.ret,pnl:back-p.pos,pool:t.pool,ds:t.ds,blk:e.b,hold:(t.exit-t.entry)*0.1013/60,sepi:!!t.sepi});
    if(t.dev)(devHist[t.dev]=devHist[t.dev]||[]).push(t.ret);
    const eq=cash+[...openPos.values()].reduce((a,x)=>a+x.pos,0);
    peak=Math.max(peak,eq); ddMax=Math.max(ddMax,1-eq/peak);
    if(!killed&&1-eq/peak>KILL) killed=true;
    eqCurve.push([e.b,+eq.toFixed(2)]);
    continue;
  }
  // === keputusan beli, urutan sama dengan bot live ===
  if(DROP>0&&h32(t.pool+"|rpc")<DROP){nDrop++;continue;}   // cek RPC gagal: koin tidak pernah dinilai (live log: CEK GAGAL)
  if(process.env.NOASRD&&ASRD[t.pool]){nAsrd++;continue;}
  if(MLR){
    if(!Number.isFinite(t.score)){tolak.noskor++;DEC(t,"noskor");continue;}       // model belum punya cukup data
    recent.push(t.score); if(recent.length>100) recent.shift();
    const thr=recent.length<30?THR0:q(recent,QTHR);
    let lolosMoon=false;
    if(MOONQ>0&&Number.isFinite(t.moon)){
      recentMoon.push(t.moon); if(recentMoon.length>100) recentMoon.shift();
      if(recentMoon.length>=30&&t.moon>=q(recentMoon,MOONQ)) lolosMoon=true;
    }
    const lolosSepi = QUIET && t.nswap>=QUIET[0] && t.nswap<=QUIET[1];   // jalur sepi: koin sepi-tapi-hidup di menit-1
    t.sepi = lolosSepi && t.score<thr;
    if(t.score<thr&&!lolosMoon&&!lolosSepi){tolak.ml++;DEC(t,"ml");continue;}
    if(RUGQ>0&&Number.isFinite(t.rug)){            // bagian 12: veto P(rug) — tolak kalau termasuk paling rawan rug dari 100 terakhir
      recentRug.push(t.rug); if(recentRug.length>100) recentRug.shift();
      if(recentRug.length>=30&&t.rug>=q(recentRug,RUGQ)){tolak.rug=(tolak.rug||0)+1;DEC(t,"rug");continue;}
    }
    if(t.score<thr&&lolosMoon) nMoon++;
  }
  if(DEVR&&t.dev){const h=devHist[t.dev]; if(h&&h.some(r=>r<0.3)){tolak.dev++;DEC(t,"dev");continue;}}
  if(HONEY&&t.jual===0){tolak.honey++;DEC(t,"honey");continue;}                  // belum ada yg berhasil jual
  if(killed){tolak.kill++;DEC(t,"kill");continue;}
  if(openPos.size>=MAXPOS){tolak.slot++;DEC(t,"slot");continue;}
  const frac0=t.sepi?FIXQ:(FIX>0?FIX:kelly()/NBAGI);
  {                                                // batas eksposur total: dihitung SESUDAH posisi ditambah
    const eqNow=cash+[...openPos.values()].reduce((a,x)=>a+x.pos,0);
    const terpakai=eqNow-cash;
    if(terpakai+Math.min(frac0*eqNow,cash)>EXPMAX*eqNow){tolak.eksposur=(tolak.eksposur||0)+1;DEC(t,"eksposur");continue;}
  }
  const eq=cash+[...openPos.values()].reduce((a,x)=>a+x.pos,0);
  const g=0.06*3+0.03;
  const frac=t.sepi?FIXQ:(FIX>0?FIX:kelly()/NBAGI); if(t.sepi) nSepi++;
  let mult=1;
  if(REM){                                        // makin dalam drawdown, makin kecil taruhan
    const ddNow=1-eq/peak;
    mult = ddNow>0.30 ? 0.25 : ddNow>0.20 ? 0.5 : ddNow>0.10 ? 0.75 : 1;   // tangga rem SAMA dengan live
  }
  if(REMREZIM>0&&mktWin.length>=100&&mktAll.length>=200){   // rugi pasar memburuk: rasio rug 100 koin terakhir > REMREZIM x rata2 jangka panjang
    const rw=mktWin.reduce((x,y)=>x+y,0)/mktWin.length, ra=mktAll.reduce((x,y)=>x+y,0)/mktAll.length;
    if(rw>REMREZIM*ra){ mult*=0.5; nRemRezim++; }
  }
  let pos=Math.min(frac*eq*mult, cash-g);
  if(SOPT&&t.lp>0&&closed.length>=30){
    const edge=Math.max(0.02, closed.reduce((a,c)=>a+c.ret,0)/closed.length - 1);   // kausal: dari trade yang sudah tutup
    pos=Math.min(pos, edge*t.lp/4);
  }
  if(LPCAP>0&&t.lp>0) pos=Math.min(pos, LPCAP*t.lp);   // batas fisik likuiditas (di atas ini slippage memakan untung)   // 1/4 Kelly sebagai jatah TOTAL, dibagi antar posisi
  if(pos<MINPOS){tolak.kas++;DEC(t,"kas");continue;}
  let trB=null;
  if(BK.length&&BASE[t.pool]&&t.lp>0){
    const r=pos/t.lp; let bi=0,bd=1e9; BK.forEach((k,i)=>{const d=Math.abs(Math.log(Math.max(r,1e-9))-Math.log(k.f)); if(d<bd){bd=d;bi=i;}});
    const tb=BK[bi].M[t.pool];
    if(tb){ trB=tb; bkHit[BK[bi].f]=(bkHit[BK[bi].f]||0)+1;
      const xb=tb.exitBlk+(t.exit-BASE[t.pool].exitBlk);   // geser sama dgn baris (uji acak memindah blok)
      let k=0; while(k<dyn.length&&dyn[k].b<=xb) k++; dyn.splice(k,0,{b:xb,t}); }
  }
  if(BK.length&&!trB){ let k=0; while(k<dyn.length&&dyn[k].b<=t.exit) k++; dyn.splice(k,0,{b:t.exit,t}); }
  cash-=pos; openPos.set(t.pool,{pos,lp:t.lp,tr:trB}); beli++; DEC(t,"beli");
  if(process.env.DUMP) dump.push({pool:t.pool,score:t.score,ret:t.ret,pos:+pos.toFixed(2),ds:t.ds,entry:t.entry,exit:t.exit,lp:t.lp,gasTot:t.gasTot,size:t.size});
  kellyLog.push(FIX>0?FIX:kelly()); concLog.push(openPos.size);
  if(t.lp>0&&pos>0.01*t.lp) besarCount++;   // posisi > 1% likuiditas: slippage nyata bisa lebih buruk dari simulasi
}
if(BK.length) tutupDyn(Infinity);
const eqAkhir=cash+[...openPos.values()].reduce((a,x)=>a+x.pos,0);
{ const np_=closed.filter(c=>c.pre).length; closed.splice(0,np_); }   // riwayat KPRE tidak ikut dilaporkan
const wins=closed.filter(c=>c.ret>1);
const PF=r=>{const g=r.filter(c=>c.pnl>0).reduce((a,c)=>a+c.pnl,0), l=-r.filter(c=>c.pnl<=0).reduce((a,c)=>a+c.pnl,0);return l>0?g/l:Infinity;};
const nama=process.env.NAMA||"ARENA";
console.log(`\n=== ${nama} ===`);
console.log(`peluang ${rows.length} | beli ${beli} | tutup ${closed.length} | lewat jalur roket ${nMoon} | jalur sepi ${nSepi} | rem rezim ${nRemRezim}`);
console.log(`tolak: ml ${tolak.ml}, dev ${tolak.dev}, honeypot ${tolak.honey}, slot penuh ${tolak.slot}, eksposur penuh ${tolak.eksposur}, kill ${tolak.kill}, kas ${tolak.kas}, model belum siap ${tolak.noskor}`);
console.log(`win ${(100*wins.length/Math.max(closed.length,1)).toFixed(1)}% | PF ${PF(closed)===Infinity?"inf":PF(closed).toFixed(2)} | rug dimakan (ret<0,3) ${closed.filter(c=>c.ret<0.3).length}`);
console.log(`akun $${START} -> $${eqAkhir.toFixed(2)} (${((eqAkhir/START-1)*100).toFixed(0)}%) | DD maks ${(100*ddMax).toFixed(1)}% | kill ${killed?"AKTIF":"tidak"}`);
// per periode
const byDs={};
for(const c of closed){byDs[c.ds]=byDs[c.ds]||[];byDs[c.ds].push(c);}
for(const [ds,r] of Object.entries(byDs)){
  const w=r.filter(c=>c.ret>1).length;
  console.log(`  ${ds}: ${r.length} trade | win ${(100*w/r.length).toFixed(0)}% | PF ${PF(r)===Infinity?"inf":PF(r).toFixed(2)} | untung $${r.reduce((a,c)=>a+c.pnl,0).toFixed(2)}`);
}
const s=[...closed].sort((a,b)=>b.pnl-a.pnl);
console.log("terbaik:",s.slice(0,3).map(c=>`${c.pool.slice(0,8)} x${c.ret.toFixed(2)} +$${c.pnl.toFixed(2)}`).join(" | "));
console.log("terburuk:",s.slice(-3).map(c=>`${c.pool.slice(0,8)} x${c.ret.toFixed(2)} $${c.pnl.toFixed(2)}`).join(" | "));
// posisi yang lebih besar dari 1% likuiditas -> slippage bisa lebih buruk dari yang disimulasikan
{
  const avg=a=>a.reduce((x,y)=>x+y,0)/Math.max(a.length,1);
  const hist={}; concLog.forEach(c=>hist[c]=(hist[c]||0)+1);
  const holds=closed.map(c=>c.hold).sort((a,b)=>a-b);
  const jam=(rows[rows.length-1].exit-rows[0].decide)*0.1013/3600;
  console.log(`TRADE/HARI: ${(beli/(jam/24)).toFixed(1)} | lama pegang median ${holds[Math.floor(holds.length/2)].toFixed(0)} menit (rata2 ${avg(holds).toFixed(0)} mnt, terlama ${holds[holds.length-1].toFixed(0)} mnt)`);
  console.log(`POSISI BERSAMAAN saat membeli: ${Object.entries(hist).sort((a,b)=>a[0]-b[0]).map(([k,v])=>k+" posisi: "+(100*v/beli).toFixed(0)+"%").join(" | ")}`);
  const mx=a=>Math.max(...a);
  console.log(`KELLY: f*/4 rata2 ${(100*avg(kellyLog)).toFixed(1)}% (maks ${(100*mx(kellyLog)).toFixed(1)}%) | posisi bersamaan rata2 ${avg(concLog).toFixed(1)} (maks ${mx(concLog)}) | eksposur total rata2 ${(100*avg(kellyLog)*avg(concLog)).toFixed(0)}% modal`);
}
{
  const r=closed.map(c=>c.ret);
  const mean=r.reduce((a,b)=>a+b,0)/Math.max(r.length,1);
  const posAvg=closed.length?closed.reduce((a,c)=>a+0,0):0;
  console.log(`ret rata2 per trade ${mean.toFixed(3)} (untung bersih ${(100*(mean-1)).toFixed(1)}% per trade)`);
}
console.log(`mk: drop RPC ${nDrop} | tolak aSRD ${nAsrd} | ember ukuran ${JSON.stringify(bkHit)} | gas nyata ${GASDS?"ya":"tidak"}`);
console.log(`catatan kejujuran: ${besarCount}/${beli} posisi melebihi 1% likuiditas pool -> slippage nyata di trade itu bisa lebih buruk dari yang disimulasikan`);
if(process.env.DECF) fs.writeFileSync(process.env.DECF,JSON.stringify(DECS));
if(process.env.DUMP) fs.writeFileSync(process.env.DUMP,JSON.stringify(dump));
fs.writeFileSync((process.env.OUT||"arena_equity")+".json",JSON.stringify({eqCurve,closed:closed.length,eqAkhir,ddMax}));
