// AUDIT07: perbandingan BERPASANGAN aturan keluar (daftar koin DIKUNCI, koin yang sama di kedua varian)
// + selang kepercayaan bootstrap 95% atas selisih rata-rata ret. Semua trade dihitung.
const fs=require("fs");
const [A,B,...GRP]=process.argv.slice(2);
const load=(R,ds)=>{const m={};for(const d of ds){let f=`${R}/${d}/trades.jsonl`;if(!fs.existsSync(f))continue;
  for(const l of fs.readFileSync(f,"utf8").trim().split("\n")){const t=JSON.parse(l);if(t.plan==="v4")m[d+"|"+t.pool]=t;}}return m;};
const boot=(d,n=4000)=>{const out=[];let s=987654321;const rnd=()=>{s^=s<<13;s^=s>>>17;s^=s<<5;return (s>>>0)/4294967296;};
  for(let k=0;k<n;k++){let t=0;for(let i=0;i<d.length;i++)t+=d[Math.floor(rnd()*d.length)];out.push(t/d.length);}
  out.sort((x,y)=>x-y);return [out[Math.floor(0.025*n)],out[Math.floor(0.975*n)]];};
for(const g of GRP){
  const [nm,list]=g.split("=");const ds=list.split("+");
  const a=load(A,ds),b=load(B,ds);
  const keys=Object.keys(a).filter(k=>k in b);
  const dr=keys.map(k=>b[k].ret-a[k].ret);
  const beda=keys.filter(k=>Math.abs(b[k].ret-a[k].ret)>1e-9).length;
  const mean=dr.reduce((x,y)=>x+y,0)/dr.length;
  const [lo,hi]=boot(dr);
  const mA=keys.reduce((s,k)=>s+a[k].ret,0)/keys.length, mB=keys.reduce((s,k)=>s+b[k].ret,0)/keys.length;
  const pf=m=>{const g2=keys.filter(k=>m[k].pnl>0).reduce((s,k)=>s+m[k].pnl,0),l=-keys.filter(k=>m[k].pnl<=0).reduce((s,k)=>s+m[k].pnl,0);return g2/l;};
  console.log(`${nm}: n ${keys.length} (berubah ${beda}) | ret ${mA.toFixed(4)} -> ${mB.toFixed(4)} | selisih ${mean>=0?"+":""}${mean.toFixed(4)} [${lo.toFixed(3)} .. ${hi.toFixed(3)}] ${(lo>0||hi<0)?"SIGNIFIKAN":"tidak meyakinkan"} | PF ${pf(a).toFixed(2)} -> ${pf(b).toFixed(2)}`);
}
