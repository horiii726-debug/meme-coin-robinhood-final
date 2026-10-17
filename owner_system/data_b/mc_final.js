// MONTE CARLO strategi final, 10.000 simulasi.
// Linimasa buatan: tiap jam diisi salinan satu jam trading ASLI (dipilih acak), jarak masuk & lama pegang
// tiap trade dipertahankan. Aturan akun sama persis dengan bot live:
//   1/4 Kelly kausal, compounding, slot 10, pagar eksposur 50%, kill switch -35%, kas terbatas.
const fs=require("fs");
const T=JSON.parse(fs.readFileSync("trade_final.json","utf8"));
const BLOK=+(process.env.BLOK||12);   // panjang blok bootstrap (jam)
const HOUR=36000, DAYS=+(process.env.DAYS||7), SIMS=+(process.env.SIMS||10000), START=100;
const MAXPOS=10, EXPMAX=0.5, KILL=0.35;
// MODE KILL SWITCH:
//  "permanen" = berhenti beli selamanya (sekarang)
//  "pulih"    = jeda saat DD>35%, boleh beli lagi setelah equity pulih (DD<PULIH)
//  "rem"      = tanpa stop total; ukuran posisi dikecilkan saat drawdown makin dalam
const MODE=process.env.MODE||"permanen";
const PULIH=+(process.env.PULIH||0.20);
const JEDA=+(process.env.JEDA||2)*36000;   // "reset": jeda sekian jam lalu puncak di-reset, bot boleh jalan lagi
// kelompokkan trade per jam berdasarkan blok masuk
const t0=Math.min(...T.map(x=>x.entry)), t1=Math.max(...T.map(x=>x.entry));
const jam=[];
for(let h=0;h<Math.floor((t1-t0)/HOUR);h++){
  const isi=T.filter(x=>x.entry>=t0+h*HOUR && x.entry<t0+(h+1)*HOUR)
    .map(x=>({off:x.entry-(t0+h*HOUR), dur:Math.max(1,x.exit-x.entry), ret:x.ret, lp:x.lp}));
  jam.push(isi);
}
// UJI SIKSAAN: hanya ambil jam-jam TERBURUK (pasar jelek terus-menerus)
if(process.env.WORST){
  const skor=jam.map(h=>h.length?h.reduce((a,t)=>a+t.ret,0)/h.length:1);
  const urut=jam.map((h,i)=>[skor[i],i]).sort((a,b)=>a[0]-b[0]);
  const ambil=Math.max(5,Math.floor(jam.length*(+process.env.WORST)));
  const pilih=urut.slice(0,ambil).map(x=>x[1]);
  const baru=pilih.map(i=>jam[i]);
  jam.length=0; baru.forEach(h=>jam.push(h));
  console.error(`UJI SIKSAAN: hanya ${jam.length} jam TERBURUK dipakai (ret rata2 ${(skor.slice().sort((a,b)=>a-b).slice(0,ambil).reduce((a,b)=>a+b,0)/ambil).toFixed(3)})`);
}
const perJam=jam.reduce((a,h)=>a+h.length,0)/jam.length;
console.error(`blok jam sumber: ${jam.length} | rata ${perJam.toFixed(1)} trade/jam | ${SIMS} simulasi x ${DAYS} hari`);
// RNG lama berperiode 16.404 -> "10.000 simulasi" sebenarnya hanya ~98 jalur unik yang berulang.
// mulberry32: aritmetika 32-bit dengan Math.imul, periode 2^32.
let seed=(+(process.env.SEED||12345))>>>0;
const rnd=()=>{seed=(seed+0x6D2B79F5)>>>0;let t=seed;t=Math.imul(t^(t>>>15),1|t);t^=t+Math.imul(t^(t>>>7),61|t);return ((t^(t>>>14))>>>0)/4294967296;};
function kelly(rets){
  if(rets.length<30) return 0.02;
  if(rets.length<100) return 0.094;
  let best=0.02,bv=-1e9;
  for(let f=0.01;f<=0.6;f+=0.005){let s=0,ok=true;
    for(const x of rets){const v=1+f*(x-1); if(v<=0){ok=false;break;} s+=Math.log(v);}
    if(ok&&s/rets.length>bv){bv=s/rets.length;best=f;}}
  return Math.max(0.01,Math.min(0.25,best/4));
}
const H=DAYS*24;
const eqHari=Array.from({length:DAYS+1},()=>new Float64Array(SIMS));
const ddMax=new Float64Array(SIMS), nTrade=new Int32Array(SIMS), nKill=new Int32Array(SIMS);
for(let s=0;s<SIMS;s++){
  const ev=[]; let awal=0;
  for(let h=0;h<H;h++){
    if(h%BLOK===0) awal=Math.floor(rnd()*jam.length);           // blok bootstrap: jam berurutan, bukan acak per jam
    const src=jam[(awal+(h%BLOK))%jam.length];
    for(const t of src){const inst={...t,uid:h+"_"+(ev.length)};  // kloning: tiap instance punya posisi sendiri
      ev.push([h*HOUR+t.off,0,inst]); ev.push([h*HOUR+t.off+t.dur,1,inst]);}
  }
  ev.sort((a,b)=>a[0]-b[0]||b[1]-a[1]);
  let cash=START, locked=0, peak=START, dd=0, killed=false, hIdx=0, killBlk=0;
  const pos=new Map(); const closed=[];
  eqHari[0][s]=START;
  for(const [blk,type,t] of ev){
    while(hIdx<H && blk>=(hIdx+1)*HOUR){ hIdx++; if(hIdx%24===0) eqHari[hIdx/24][s]=cash+locked; }
    if(type===0){
      let nOpen=0; for(const a of pos.values()) nOpen+=a.length;
      if(nOpen>=MAXPOS) continue;
      const eqK=cash+locked; const ddNow=1-eqK/peak;
      if(MODE==="permanen"&&killed) continue;
      if(MODE==="pulih"){ if(killed&&ddNow<PULIH){killed=false;} if(killed) continue; }
      // "reset": jeda beberapa jam, lalu anggap equity sekarang sebagai puncak baru dan lanjut dengan ukuran dikecilkan
      if(MODE==="reset"){ if(killed&&blk-killBlk>=JEDA){ killed=false; peak=eqK; } if(killed) continue; }
      let rem=1;
      if(MODE==="rem"||MODE==="reset") rem = ddNow>0.30?0.25 : ddNow>0.20?0.5 : ddNow>0.10?0.75 : 1;
      const eq=cash+locked;
      if(locked>=EXPMAX*eq) continue;
      const g=0.06*3+0.03;
      const p=Math.min(kelly(closed)*eq*(typeof rem==="number"?rem:1), cash-g);
      if(p<0.25) continue;
      cash-=p; locked+=p;
      if(!pos.has(t)) pos.set(t,[]);
      pos.get(t).push(p);
    }else{
      const arr=pos.get(t); if(!arr||!arr.length) continue;
      const p=arr.shift();
      if(!arr.length) pos.delete(t);        // slot dibebaskan setelah posisi tutup
      const slip=t.lp>0?Math.min(0.9,2*p/t.lp):0;
      const gT=t.gasTot||0, grossRet=(gT&&t.size)?(t.ret+gT/t.size):t.ret;
      locked-=p; cash+=Math.max(0,p*grossRet*(1-slip)-gT);
      closed.push(t.ret); nTrade[s]++;
      const eq=cash+locked; peak=Math.max(peak,eq); dd=Math.max(dd,1-eq/peak);
      if(MODE!=="rem"&&!killed&&1-eq/peak>KILL){killed=true;nKill[s]++;killBlk=blk;}
    }
  }
  while(hIdx<H){hIdx++; if(hIdx%24===0) eqHari[hIdx/24][s]=cash+locked;}
  ddMax[s]=dd;
}
const q=(arr,p)=>{const a=[...arr].sort((x,y)=>x-y);return a[Math.min(a.length-1,Math.floor(p*a.length))];};
console.log(`\n=== MONTE CARLO ${SIMS} simulasi, ${DAYS} hari, modal $${START} ===`);
console.log("hari |     5%     |    25%    |   TENGAH   |    75%     |    95%");
for(let d=1;d<=DAYS;d++){
  const c=eqHari[d];
  console.log(`${String(d).padStart(4)} | ${q(c,0.05).toFixed(0).padStart(10)} | ${q(c,0.25).toFixed(0).padStart(9)} | ${q(c,0.5).toFixed(0).padStart(10)} | ${q(c,0.75).toFixed(0).padStart(10)} | ${q(c,0.95).toFixed(0).padStart(10)}`);
}
const akhir=eqHari[DAYS];
const rugi=[...akhir].filter(x=>x<START).length/SIMS;
const habis=[...akhir].filter(x=>x<START*0.5).length/SIMS;
console.log(`\npeluang RUGI setelah ${DAYS} hari : ${(100*rugi).toFixed(1)}%`);
console.log(`peluang akun tinggal <50%      : ${(100*habis).toFixed(1)}%`);
console.log(`kill switch menyala rata2      : ${([...nKill].reduce((a,b)=>a+b,0)/SIMS).toFixed(2)} kali per jalur | pernah kena ${(100*[...nKill].filter(x=>x>0).length/SIMS).toFixed(1)}% jalur`);
console.log(`drawdown: tengah ${(100*q(ddMax,0.5)).toFixed(1)}% | 95% terburuk ${(100*q(ddMax,0.95)).toFixed(1)}%`);
console.log(`trade per jalur: tengah ${q(nTrade,0.5)}`);
