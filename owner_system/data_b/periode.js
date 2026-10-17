// Cek periode pasar terbaik & terburuk dari data on-chain yang sudah kita punya (hanya membaca).
const fs=require("fs");
const bt=JSON.parse(fs.readFileSync("block_time.json","utf8"));
const anchor=Object.entries(bt).map(([b,t])=>[+b,+t]).sort((a,b)=>a[0]-b[0]);
const waktu=blk=>{ // interpolasi linear antar titik acuan
  let i=0; while(i<anchor.length-2 && anchor[i+1][0]<blk) i++;
  const [b0,t0]=anchor[i],[b1,t1]=anchor[i+1];
  return t0+(blk-b0)*(t1-t0)/(b1-b0);
};
const jamKey=ts=>new Date(ts*1000).toISOString().slice(0,13);
const H={};
const tambah=(k,f)=>{H[k]=H[k]||{lahir:0,trade:0,rug:0,win:0,rets:[]}; f(H[k]);};
for(const D of ["d1","d2","d3"]){
  for(const l of fs.readFileSync(`${D}/pools.csv`,"utf8").trim().split("\n").slice(1)){
    const p=l.trim().split(","); const init=+p[6]; if(!init) continue;
    tambah(jamKey(waktu(init)),h=>h.lahir++);
  }
  for(const t of fs.readFileSync(`${D}/trades.jsonl`,"utf8").trim().split("\n").map(JSON.parse).filter(x=>x.plan==="v4")){
    tambah(jamKey(waktu(t.init)),h=>{h.trade++; h.rets.push(t.ret); if(t.ret<0.3)h.rug++; if(t.ret>1)h.win++;});
  }
}
const pf=r=>{const g=r.filter(x=>x>1).reduce((a,b)=>a+b-1,0),l=r.filter(x=>x<=1).reduce((a,b)=>a+1-b,0);return l>0?g/l:Infinity;};
const rows=Object.entries(H).filter(([,h])=>h.trade>=5).sort((a,b)=>a[0]<b[0]?-1:1);
console.log("jam (UTC)        koin  trade  rug%   win%   PF    ret rata2");
for(const [k,h] of rows){
  const r=h.rets, avg=r.reduce((a,b)=>a+b,0)/r.length;
  console.log(`${k.replace("T"," ")}:00  ${String(h.lahir).padStart(4)}  ${String(h.trade).padStart(4)}  ${(100*h.rug/h.trade).toFixed(0).padStart(4)}  ${(100*h.win/h.trade).toFixed(0).padStart(5)}  ${pf(r)===Infinity?" inf":pf(r).toFixed(2).padStart(5)}  ${avg.toFixed(2)}`);
}
// blok 6 jam terbaik & terburuk
const grp={};
for(const [k,h] of Object.entries(H)){ const d=new Date(k+":00:00Z"); const b=Math.floor(d.getUTCHours()/6)*6;
  const key=k.slice(0,10)+" "+String(b).padStart(2,"0")+":00-"+String(b+6).padStart(2,"0")+":00";
  grp[key]=grp[key]||{lahir:0,trade:0,rug:0,win:0,rets:[]};
  grp[key].lahir+=h.lahir; grp[key].trade+=h.trade; grp[key].rug+=h.rug; grp[key].win+=h.win; grp[key].rets.push(...h.rets); }
const g=Object.entries(grp).filter(([,x])=>x.trade>=20).map(([k,x])=>({k,...x,pf:pf(x.rets),avg:x.rets.reduce((a,b)=>a+b,0)/x.rets.length}));
g.sort((a,b)=>b.pf-a.pf);
console.log("\n=== BLOK 6 JAM TERBAIK ===");
for(const x of g.slice(0,3)) console.log(`${x.k} UTC | koin ${x.lahir} | trade ${x.trade} | rug ${(100*x.rug/x.trade).toFixed(0)}% | win ${(100*x.win/x.trade).toFixed(0)}% | PF ${x.pf.toFixed(2)} | ret rata2 ${x.avg.toFixed(2)}`);
console.log("=== BLOK 6 JAM TERBURUK ===");
for(const x of g.slice(-3)) console.log(`${x.k} UTC | koin ${x.lahir} | trade ${x.trade} | rug ${(100*x.rug/x.trade).toFixed(0)}% | win ${(100*x.win/x.trade).toFixed(0)}% | PF ${x.pf.toFixed(2)} | ret rata2 ${x.avg.toFixed(2)}`);
