// MONTE CARLO strategi final — 10.000 jalur x 30 hari, 3 skenario biaya.
// Sumber: 178 trade NYATA dari uji maju final (bukan dikarang). Yang diacak hanya URUTAN jam pasar
// (blok bootstrap 12 jam di dalam tiap periode data), bukan hasil trade-nya.
// Aturan akun = bot live: 1/4 Kelly (maks 10%), compounding, posisi maks 1% likuiditas pool,
// maks 10 posisi, maks 50% equity terpakai, rem bertahap, stop darurat 60%, gas dolar tetap.
const fs=require("fs");
const T=JSON.parse(fs.readFileSync("trade_final178.json","utf8"));
const W0=[["u_ds5d",55566162,56218961],["u_ds24",59886162,60750162],["m1",61866030,63600000],["m2",64401245,65698903]];
// PERIODE yang dipakai sebagai "pasar": ramai = 13-17 Sep, sepi = ~5 & ~10 Sep, campur = semua
const PILIH=(process.env.WINS||"u_ds5d,u_ds24,m1,m2").split(",");
const W=W0.filter(w=>PILIH.includes(w[0]));
const WEQ=process.env.WEQ==="1";      // 1 = tiap periode berpeluang SAMA dipilih (pasar ramai tidak mendominasi)
const HB=36000, HZ=324000;
const jam=[];                        // jam sumber: {w, trades:[{off,dur,ret,g,sz,lp}]}
for(const [ds,a,b] of W){
  const n=Math.floor((b-HZ-a)/HB);
  const base=jam.length;
  for(let h=0;h<n;h++) jam.push({w:ds,idx:h,tr:[]});
  for(const t of T.filter(x=>x.ds===ds)){
    const h=Math.floor((t.entry-a)/HB); if(h<0||h>=n) continue;
    jam[base+h].tr.push({off:t.entry-(a+h*HB),dur:Math.max(1,t.exit-t.entry),ret:t.ret,g:t.gasTot||0,sz:t.size||0,lp:t.lp||0});
  }
}
const winStart={}; jam.forEach((j,i)=>{ if(!(j.w in winStart)) winStart[j.w]=i; });
const winLen={}; jam.forEach(j=>winLen[j.w]=(winLen[j.w]||0)+1);
const nTrSrc=jam.reduce((s,j)=>s+j.tr.length,0);
// f*/4 dari return akun nyata, dibatasi 10%
const rets=T.map(t=>t.ret);
let best=0.01,bg=-1e18; for(let i=1;i<200;i++){const f=i/200;let g=0,ok=true;for(const x of rets){const v=1+f*(x-1);if(v<=0){ok=false;break;}g+=Math.log(v);} if(ok&&g>bg){bg=g;best=f;}}
const KELLY=Math.min(0.10,best/4);
const SIMS=+(process.env.SIMS||10000), DAYS=+(process.env.DAYS||30), H=DAYS*24, BLOK=12;
const HAIR=+(process.env.HAIR||0), GASX=+(process.env.GASX||1), NAMA=process.env.NAMA||"backtest";
let seed=(+(process.env.SEED||777))>>>0;
const rnd=()=>{seed=(seed+0x6D2B79F5)>>>0;let t=seed;t=Math.imul(t^(t>>>15),1|t);t^=t+Math.imul(t^(t>>>7),61|t);return ((t^(t>>>14))>>>0)/4294967296;};
const eqH=new Float64Array(SIMS*(H+1));        // equity tiap jam, semua jalur
const ddMax=new Float64Array(SIMS), nTr=new Int32Array(SIMS), kena=new Uint8Array(SIMS);
const ev_t=[],ev_k=[],ev_i=[];
for(let s=0;s<SIMS;s++){
  // bangun linimasa: blok 12 jam berurutan di dalam satu periode
  const lin=[]; let h=0;
  while(h<H){ let j; if(WEQ){ const wn=W[Math.floor(rnd()*W.length)][0]; j=winStart[wn]+Math.floor(rnd()*winLen[wn]); } else j=Math.floor(rnd()*jam.length); const w=jam[j].w, st=winStart[w], L=winLen[w];
    const mulai=j-st; for(let k=0;k<BLOK&&h<H;k++,h++) lin.push(st+((mulai+k)%L)); }
  const ev=[]; let id=0;
  for(let hh=0;hh<H;hh++){ for(const t of jam[lin[hh]].tr){ const e=hh*HB+t.off; ev.push([e,1,t,id]); ev.push([e+t.dur,0,t,id]); id++; } }
  ev.sort((x,y)=>x[0]-y[0]||x[1]-y[1]);          // tutup dulu baru buka di blok yang sama
  let cash=100,locked=0,peak=100,dd=0,killed=false,hi=0,closed=0;
  const open=new Map();
  eqH[s*(H+1)]=100;
  for(const [blk,typ,t,iid] of ev){
    while(hi<H && blk>=(hi+1)*HB){ hi++; eqH[s*(H+1)+hi]=cash+locked; }
    if(typ===1){
      if(killed||open.size>=10) continue;
      const eq=cash+locked, ddNow=1-eq/peak;
      const rem=ddNow>0.30?0.25:ddNow>0.20?0.5:ddNow>0.10?0.75:1;
      const f=closed<30?0.02:closed<100?0.094:KELLY;
      const g=0.06*GASX*3+0.03;
      let p=Math.min(f*eq*rem, cash-g*(open.size+1));
      if(t.lp>0) p=Math.min(p,0.01*t.lp);
      if(locked+p>0.5*eq) p=0.5*eq-locked;
      if(p<0.25) continue;
      cash-=p; locked+=p; open.set(iid,{p,t});
    }else{
      const o=open.get(iid); if(!o) continue; open.delete(iid);
      const gT=o.t.g*GASX, gr=(o.t.g&&o.t.sz)?(o.t.ret+o.t.g/o.t.sz):o.t.ret;
      const slip=o.t.lp>0?Math.min(0.9,2*o.p/o.t.lp):0;
      const back=Math.max(0,o.p*gr*(1-slip)*(1-HAIR)-gT);
      locked-=o.p; cash+=back; closed++;
      const eq=cash+locked; if(eq>peak)peak=eq; dd=Math.max(dd,1-eq/peak);
      if(!killed&&1-eq/peak>=0.60){killed=true;kena[s]=1;}
    }
  }
  while(hi<H){hi++; eqH[s*(H+1)+hi]=cash+locked;}
  ddMax[s]=dd; nTr[s]=closed;
}
const col=hh=>{const a=new Float64Array(SIMS);for(let s=0;s<SIMS;s++)a[s]=eqH[s*(H+1)+hh];return a.sort();};
const q=(a,p)=>a[Math.min(a.length-1,Math.floor(p*a.length))];
const P=[0.01,0.05,0.25,0.5,0.75,0.95,0.99], band=P.map(()=>[]);
for(let hh=0;hh<=H;hh++){const c=col(hh);P.forEach((p,i)=>band[i].push(+q(c,p).toFixed(2)));}
const samp=[];for(let s=0;s<60;s++){const r=[];for(let hh=0;hh<=H;hh+=2)r.push(+eqH[s*(H+1)+hh].toFixed(2));samp.push(r);}
const akhir=d=>Array.from(col(d*24)).map(x=>+x.toFixed(2));
const ringkas=d=>{const c=col(d*24);return{min:+c[0].toFixed(2),p5:+q(c,.05).toFixed(2),p25:+q(c,.25).toFixed(2),med:+q(c,.5).toFixed(2),p75:+q(c,.75).toFixed(2),p95:+q(c,.95).toFixed(2),max:+c[c.length-1].toFixed(2),rugi:+(100*c.filter(x=>x<100).length/SIMS).toFixed(2)};};
const dd=Array.from(ddMax).sort((a,b)=>a-b);
const out={nama:NAMA,hair:HAIR,gasx:GASX,sims:SIMS,days:DAYS,kelly:KELLY,jamSumber:jam.length,tradeSumber:nTrSrc,
  P,band,samp,h1:ringkas(1),h7:ringkas(7),h30:ringkas(30),akhir1:akhir(1),akhir7:akhir(7),akhir30:akhir(30),
  dd:{med:+q(dd,.5).toFixed(4),p95:+q(dd,.95).toFixed(4),max:+dd[dd.length-1].toFixed(4)},ddAll:Array.from(ddMax).map(x=>+x.toFixed(4)),
  stop:+(100*kena.reduce((a,b)=>a+b,0)/SIMS).toFixed(2),tradeMed:q(Array.from(nTr).sort((a,b)=>a-b),.5)};
fs.writeFileSync(`mc_pro_${NAMA}.json`,JSON.stringify(out));
console.log(`${NAMA}: kelly ${KELLY.toFixed(3)} | jam sumber ${jam.length}, trade sumber ${nTrSrc}`);
for(const [k,v] of [["1 hari",out.h1],["1 minggu",out.h7],["1 bulan",out.h30]])
  console.log(`  ${k.padEnd(8)} terburuk $${v.min} | 5% $${v.p5} | tengah $${v.med} | 95% $${v.p95} | terbaik $${v.max} | rugi ${v.rugi}%`);
console.log(`  drawdown: tengah ${(100*out.dd.med).toFixed(1)}% | 95% ${(100*out.dd.p95).toFixed(1)}% | terparah ${(100*out.dd.max).toFixed(1)}% | stop darurat kena ${out.stop}% | trade/bulan ${out.tradeMed}`);
