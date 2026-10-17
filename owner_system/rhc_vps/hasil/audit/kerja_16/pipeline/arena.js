// ARENA — simulasi akun seolah-olah live. Semua aturan di ARENA_RULES.md. Tidak ada intip masa depan.
const fs=require("fs");
const R=fs.readFileSync(process.env.SCORED||"arena_scored.csv","utf8").split(String.fromCharCode(13)).join("").trim().split(String.fromCharCode(10));
const hdr=R[0].split(",");
const GAS={};
// AUDIT06: GASALL=1 -> gas dolar tetap untuk SEMUA periode (asli hanya m1,m2; periode lain gas ikut terskala ukuran replay)
for(const D of (process.env.GASALL==="1"?["ags1","ags4","u_ds5d","u_ds24","m1","m2"]:["m1","m2"])){ try{ for(const l of fs.readFileSync(D+"/trades.jsonl","utf8").trim().split(String.fromCharCode(10))){ const t=JSON.parse(l); if(t.plan==="v4") GAS[t.pool]={g:t.gasTot||0,s:t.size||0}; } }catch(e){} }
// AUDIT06: GASDYN=file.json {pool: gas dolar dinamis} -> ganti gasTot per trade
if(process.env.GASDYN){const G=JSON.parse(fs.readFileSync(process.env.GASDYN,"utf8")); for(const k in G){ if(GAS[k]) GAS[k].gd=G[k]; }}
const rows=R.slice(1).map(l=>{const p=l.split(",");const o={};hdr.forEach((h,i)=>o[h]=p[i]);return o;})
  .map(o=>({ds:o.ds,pool:o.pool,decide:+o.decide,entry:+o.entry,exit:+o.exit,ret:+o.ret,gasTot:GAS[o.pool]?GAS[o.pool].g:0,size:GAS[o.pool]?GAS[o.pool].s:0,
            jual:+o.jual_m1,dev:o.dev||null,lp:parseFloat(o.lp_m1)||0,score:o.score===""?NaN:+o.score,moon:(o.moon===undefined||o.moon==="")?NaN:+o.moon}))
  .filter(o=>!process.env.ONLY||process.env.ONLY.split(",").includes(o.ds))
  .filter(o=>!process.env.BLKFROM||(o.decide>=+process.env.BLKFROM&&o.decide<=+process.env.BLKTO))
  .sort((a,b)=>a.decide-b.decide);

const START=+(process.env.START||100), MAXPOS=+(process.env.MAXPOS||20), KILL=+(process.env.KILL||0.60), THR0=0.195;   // stop darurat 60% seperti live
const KCAP=+(process.env.KCAP||0.10);   // disamakan dengan live setelah audit 19 Sep   // batas atas 1/4 Kelly
const MINPOS=+(process.env.MINPOS||0.25);   // posisi terkecil yang masih layak digas
const SLIP=process.env.SLIP==="1";
const EXPMAX=+(process.env.EXPMAX||1);   // batas eksposur TOTAL (bagian equity yang boleh terpakai serentak)
const REM=process.env.REM==="1";        // rem bertahap saat drawdown
const SOPT=process.env.SOPT==="1";      // ukuran optimal setelah slippage
const QTHR=+(process.env.QTHR||0.30);
const MOONQ=+(process.env.MOONQ||0);   // jalur roket: beli juga koin dgn skor roket di atas kuantil ini (0 = mati)
const recentMoon=[]; let nMoon=0;   // buang skor terburuk sekian persen
const NOWARM=process.env.NOWARM==="1";   // AUDIT07-D: larang beli selama pemanasan (<30 skor, ambang 0,195 in-sample)
const DAYSTOP=+(process.env.DAYSTOP||0);  // AUDIT07-I: rem harian, berhenti beli kalau equity < awal hari WIB x (1-DAYSTOP)
// blok -> waktu unix (jangkar nyata data/block_time.json; di luar jangkar diekstrapolasi 0,1013 dtk/blok)
const ANK=Object.entries(JSON.parse(fs.readFileSync(process.env.BLKTIME||"C:/Users/horii/rhc-quant/rhc_vps/data/block_time.json","utf8"))).map(([b,t])=>[+b,+t]).sort((a,b)=>a[0]-b[0]);
function blkTime(b){
  if(b<=ANK[0][0]) return ANK[0][1]-(ANK[0][0]-b)*0.1013;
  if(b>=ANK[ANK.length-1][0]) return ANK[ANK.length-1][1]+(b-ANK[ANK.length-1][0])*0.1013;
  for(let i=1;i<ANK.length;i++) if(b<=ANK[i][0]){const[b0,t0]=ANK[i-1],[b1,t1]=ANK[i];return t0+(t1-t0)*(b-b0)/(b1-b0);}
  return ANK[0][1];
}
const hariWIB=b=>Math.floor((blkTime(b)+7*3600)/86400);
let hariNow=null, eqAwalHari=null, tolakHari=0;
const LPCAP=+(process.env.LPCAP||0);   // batas posisi sbg pecahan likuiditas pool
const FIX=+(process.env.FIXFRAC||0);   // ukuran tetap % equity (0 = pakai 1/4 Kelly)
const NBAGI=+(process.env.NBAGI||1);   // f*/4 dibagi ke berapa posisi bersamaan (1 = cara lama)
const HONEY=process.env.HONEY!=="0", DEVR=process.env.DEV!=="0", MLR=process.env.ML!=="0";
let cash=START, peak=START, ddMax=0, killed=false;
const openPos=new Map(); const closed=[]; const recent=[]; const devHist={};
const eqCurve=[];
const q=(a,p)=>{const s=[...a].sort((x,y)=>x-y);return s[Math.min(s.length-1,Math.floor(p*s.length))];};
function kelly(){
  const r=closed.map(c=>c.ret);
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
const DIAG=process.env.DIAGOUT?{}:null;
const tolak={ml:0,dev:0,honey:0,slot:0,kill:0,kas:0,noskor:0,eksposur:0,pemanasan:0};
let beli=0, besarCount=0; const dump=[]; const kellyLog=[], concLog=[];
for(const e of ev){
  const t=e.t;
  if(e.k==="tutup"){
    const p=openPos.get(t.pool); if(!p) continue;
    openPos.delete(t.pool);
    // SLIP=1: potong hasil sesuai dampak harga kita sendiri (beli mendorong naik, jual menekan turun)
    const slip = (SLIP && p.lp>0) ? Math.min(0.9, 2*p.pos/p.lp) : 0;
    // koreksi gas seperti live: lepas gas yang terskala ukuran simulasi, pasang kembali sebagai dolar tetap
    const gT=(t.gasTot!==undefined&&t.size)?t.gasTot:0; const gPay=(GAS[t.pool]&&GAS[t.pool].gd!==undefined)?GAS[t.pool].gd:gT;
    const grossRet=gT&&t.size?(t.ret+gT/t.size):t.ret;
    const back=Math.max(0,p.pos*grossRet*(1-slip)-gPay); cash+=back;
    closed.push({ret:t.ret,pnl:back-p.pos,pool:t.pool,ds:t.ds,blk:e.b,hold:(t.exit-t.entry)*0.1013/60});
    if(t.dev)(devHist[t.dev]=devHist[t.dev]||[]).push(t.ret);
    const eq=cash+[...openPos.values()].reduce((a,x)=>a+x.pos,0);
    peak=Math.max(peak,eq); ddMax=Math.max(ddMax,1-eq/peak);
    if(!killed&&1-eq/peak>KILL) killed=true;
    eqCurve.push([e.b,+eq.toFixed(2)]);
    continue;
  }
  // === keputusan beli, urutan sama dengan bot live ===
  if(DAYSTOP>0){                                   // AUDIT07-I: rem harian
    const h=hariWIB(e.b);
    const eqH=cash+[...openPos.values()].reduce((a,x)=>a+x.pos,0);
    if(hariNow===null||h!==hariNow){hariNow=h;eqAwalHari=eqH;}
    if(eqH<eqAwalHari*(1-DAYSTOP)){tolakHari++;if(DIAG)DIAG[t.pool]="remHari";continue;}
  }
  if(MLR){
    if(!Number.isFinite(t.score)){tolak.noskor++;if(DIAG)DIAG[t.pool]="noskor";continue;}       // model belum punya cukup data
    recent.push(t.score); if(recent.length>100) recent.shift();
    if(NOWARM&&recent.length<30){tolak.pemanasan=(tolak.pemanasan||0)+1;if(DIAG)DIAG[t.pool]="pemanasan";continue;}   // AUDIT07-D
    const thr=recent.length<30?THR0:q(recent,QTHR);
    let lolosMoon=false;
    if(MOONQ>0&&Number.isFinite(t.moon)){
      recentMoon.push(t.moon); if(recentMoon.length>100) recentMoon.shift();
      if(recentMoon.length>=30&&t.moon>=q(recentMoon,MOONQ)) lolosMoon=true;
    }
    if(t.score<thr&&!lolosMoon){tolak.ml++;if(DIAG)DIAG[t.pool]="ml";continue;}
    if(t.score<thr&&lolosMoon) nMoon++;
  }
  if(DEVR&&t.dev){const h=devHist[t.dev]; if(h&&h.some(r=>r<0.3)){tolak.dev++;if(DIAG)DIAG[t.pool]="dev";continue;}}
  if(HONEY&&t.jual===0){tolak.honey++;if(DIAG)DIAG[t.pool]="honey";continue;}                  // belum ada yg berhasil jual
  if(killed){tolak.kill++;if(DIAG)DIAG[t.pool]="kill";continue;}
  if(openPos.size>=MAXPOS){tolak.slot++;if(DIAG)DIAG[t.pool]="slot";continue;}
  const frac0=(FIX>0?FIX:kelly()/NBAGI);
  {                                                // batas eksposur total: dihitung SESUDAH posisi ditambah
    const eqNow=cash+[...openPos.values()].reduce((a,x)=>a+x.pos,0);
    const terpakai=eqNow-cash;
    if(terpakai+Math.min(frac0*eqNow,cash)>EXPMAX*eqNow){tolak.eksposur=(tolak.eksposur||0)+1;if(DIAG)DIAG[t.pool]='eksposur';continue;}
  }
  const eq=cash+[...openPos.values()].reduce((a,x)=>a+x.pos,0);
  const g=0.06*3+0.03;
  const frac=FIX>0?FIX:kelly()/NBAGI;
  let mult=1;
  if(REM){                                        // makin dalam drawdown, makin kecil taruhan
    const ddNow=1-eq/peak;
    mult = ddNow>0.30 ? 0.25 : ddNow>0.20 ? 0.5 : ddNow>0.10 ? 0.75 : 1;   // tangga rem SAMA dengan live
  }
  let pos=Math.min(frac*eq*mult, cash-g);
  if(SOPT&&t.lp>0&&closed.length>=30){
    const edge=Math.max(0.02, closed.reduce((a,c)=>a+c.ret,0)/closed.length - 1);   // kausal: dari trade yang sudah tutup
    pos=Math.min(pos, edge*t.lp/4);
  }
  if(LPCAP>0&&t.lp>0) pos=Math.min(pos, LPCAP*t.lp);   // batas fisik likuiditas (di atas ini slippage memakan untung)   // 1/4 Kelly sebagai jatah TOTAL, dibagi antar posisi
  if(pos<MINPOS){tolak.kas++;if(DIAG)DIAG[t.pool]="kas";continue;}
  cash-=pos; openPos.set(t.pool,{pos,lp:t.lp}); beli++; if(DIAG)DIAG[t.pool]="BELI";
  if(process.env.DUMP) dump.push({pool:t.pool,score:t.score,ret:t.ret,pos:+pos.toFixed(2),ds:t.ds,entry:t.entry,exit:t.exit,lp:t.lp,gasTot:t.gasTot,size:t.size});
  kellyLog.push(FIX>0?FIX:kelly()); concLog.push(openPos.size);
  if(t.lp>0&&pos>0.01*t.lp) besarCount++;   // posisi > 1% likuiditas: slippage nyata bisa lebih buruk dari simulasi
}
const eqAkhir=cash+[...openPos.values()].reduce((a,x)=>a+x.pos,0);
const wins=closed.filter(c=>c.ret>1);
const PF=r=>{const g=r.filter(c=>c.pnl>0).reduce((a,c)=>a+c.pnl,0), l=-r.filter(c=>c.pnl<=0).reduce((a,c)=>a+c.pnl,0);return l>0?g/l:Infinity;};
const nama=process.env.NAMA||"ARENA";
console.log(`\n=== ${nama} ===`);
console.log(`peluang ${rows.length} | beli ${beli} | tutup ${closed.length} | lewat jalur roket ${nMoon}`);
console.log(`tolak: ml ${tolak.ml}, dev ${tolak.dev}, honeypot ${tolak.honey}, slot penuh ${tolak.slot}, eksposur penuh ${tolak.eksposur}, kill ${tolak.kill}, kas ${tolak.kas}, model belum siap ${tolak.noskor}`);
console.log(`tolak tambahan: pemanasan ${tolak.pemanasan||0}, rem harian ${tolakHari}`);
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
console.log(`catatan kejujuran: ${besarCount}/${beli} posisi melebihi 1% likuiditas pool -> slippage nyata di trade itu bisa lebih buruk dari yang disimulasikan`);
if(DIAG) fs.writeFileSync(process.env.DIAGOUT,JSON.stringify(DIAG));
if(process.env.DUMP) fs.writeFileSync(process.env.DUMP,JSON.stringify(dump));
fs.writeFileSync((process.env.OUT||"arena_equity")+".json",JSON.stringify({eqCurve,closed:closed.length,eqAkhir,ddMax}));
