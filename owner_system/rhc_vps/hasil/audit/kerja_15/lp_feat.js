// Ekstrak fitur STRUKTUR POSISI LIKUIDITAS per pool (hanya data <= blok keputusan) + label rug.
// Pakai: node lp_feat.js <dirData> <namaPeriode> <outCsv>
// Tidak menulis apa pun ke folder proyek selain out yang diberikan.
const fs=require("fs"), path=require("path"), readline=require("readline");
const NATIVE="0x0000000000000000000000000000000000000000";
const MIN=600;                 // blok keputusan = init+600
const W30=18000;               // 30 menit = 18000 blok (0,1 dtk/blok)
const [DIR,NAMA,OUT]=process.argv.slice(2);

const pools=new Map();
for(const l of fs.readFileSync(path.join(DIR,"pools.csv"),"utf8").trim().split("\n").slice(1)){
  const p=l.trim().split(",");
  const hooks=p[5].toLowerCase(), bits=BigInt(hooks)&0x3fffn;
  const m={id:p[0].toLowerCase(),c0:p[1].toLowerCase(),c1:p[2].toLowerCase(),fee:+p[3],ts:+p[4],hooks,
           beforeSwap:Number((bits>>7n)&1n),init:+p[6]};
  m.safe=(m.c0===NATIVE||m.c1===NATIVE)&&m.fee<=5000&&m.beforeSwap===0;
  pools.set(m.id,m);
}
const ev=new Map();   // pid -> [{blk,li,lo,hi,d}]
(async()=>{
const rl=readline.createInterface({input:fs.createReadStream(path.join(DIR,"liq.csv")),crlfDelay:Infinity});
let n=0;
for await(const line of rl){
  if(!line||line[0]==="p") continue;
  const p=line.split(",");
  const pid=p[0].toLowerCase(); const m=pools.get(pid); if(!m||!m.safe) continue;
  if(!ev.has(pid)) ev.set(pid,[]);
  ev.get(pid).push({blk:+p[1],li:+p[2],lo:+p[3],hi:+p[4],d:BigInt(p[5])});
  n++;
}
console.error(NAMA,"liq rows dipakai:",n,"| pool safe:",[...pools.values()].filter(m=>m.safe).length);

const COLS=["ds","pool","init","dev_ph","fee","ts","hook",
 "n_add","n_rem","n_pos","rem_frac_d","add_lg","max_add_share","stage_span","first_add_dt","last_add_dt",
 "w_main","full_range","sym_off","lo_main","hi_main","n_widths","narrow","add_per_pos_lg",
 "pre_rem","big_first","rug_blk","rug30","rug10","rug60","rug_any","has_ev_after"];
const out=fs.createWriteStream(OUT); out.write(COLS.join(",")+"\n");
let cnt=0,rug=0;
for(const [pid,m] of pools){
  if(!m.safe) continue;
  const e=(ev.get(pid)||[]).sort((a,b)=>a.blk-b.blk||a.li-b.li);
  if(!e.length) continue;
  const D=m.init+MIN;
  const pre=e.filter(x=>x.blk<=D);
  if(!pre.length) continue;
  // --- struktur posisi sampai blok keputusan ---
  const adds=pre.filter(x=>x.d>0n), rems=pre.filter(x=>x.d<0n);
  if(!adds.length) continue;
  let A=0n,R=0n; for(const x of pre){ if(x.d>0n) A+=x.d; else R+=-x.d; }
  const posMap=new Map();   // "lo|hi" -> liq bersih
  for(const x of pre){ const k=x.lo+"|"+x.hi; posMap.set(k,(posMap.get(k)||0n)+x.d); }
  let mainK=null,mainV=-1n;
  for(const [k,v] of posMap) if(v>mainV){mainV=v;mainK=k;}
  const [lo_main,hi_main]=mainK.split("|").map(Number);
  const w_main=hi_main-lo_main;
  const widths=new Set([...posMap.keys()].map(k=>{const [a,b]=k.split("|").map(Number);return b-a;}));
  let maxAdd=0n; for(const x of adds) if(x.d>maxAdd) maxAdd=x.d;
  const Anum=Number(A), maxAddN=Number(maxAdd);
  const firstAdd=adds[0].blk, lastAdd=adds[adds.length-1].blk;
  // --- label rug: rem kumulatif > 80% add kumulatif ---
  let a=0n,r=0n,rugBlk=null;
  for(const x of e){ if(x.d>0n) a+=x.d; else r+=-x.d; if(rugBlk===null&&a>0n&&r*100n/a>80n) rugBlk=x.blk; }
  const after=e.some(x=>x.blk>D);
  const rug30=(rugBlk!==null&&rugBlk>D&&rugBlk<=D+W30)?1:0;
  const rug10=(rugBlk!==null&&rugBlk>D&&rugBlk<=D+6000)?1:0;
  const rug60=(rugBlk!==null&&rugBlk>D&&rugBlk<=D+36000)?1:0;
  const rugAny=(rugBlk!==null)?1:0;
  const row=[NAMA,pid,m.init,"",m.fee,m.ts,m.hooks!==NATIVE?1:0,
    adds.length,rems.length,posMap.size,
    (A>0n?Number(R*10000n/A)/10000:0).toFixed(4),
    (Math.log10(Anum+1)).toFixed(4),
    (Anum>0?maxAddN/Anum:0).toFixed(4),
    lastAdd-firstAdd, firstAdd-m.init, lastAdd-m.init,
    w_main, (w_main>=1700000?1:0), Math.abs(hi_main+lo_main), lo_main, hi_main, widths.size,
    (w_main<200000?1:0), (Math.log10(Anum/posMap.size+1)).toFixed(4),
    (rems.length?1:0), (adds.length===1?1:0),
    rugBlk===null?"":rugBlk, rug30, rug10, rug60, rugAny, after?1:0];
  out.write(row.join(",")+"\n"); cnt++; rug+=rug30;
}
out.end();
console.error(NAMA,"pool tercatat:",cnt,"| rug30:",rug,`(${(100*rug/cnt).toFixed(1)}%)`);
})();
