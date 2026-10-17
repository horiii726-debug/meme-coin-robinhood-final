// Apakah fitur DOMPET memprediksi rug / moonshot?
const fs=require("fs");
const DIR=process.argv[2]||"dsp";
const W=fs.readFileSync(DIR+"/wallet_features.csv","utf8").trim().split("\n");
const WH=W[0].split(","); const WI={}; WH.forEach((h,i)=>WI[h]=i);
const wmap=new Map();
for(const l of W.slice(1)){const p=l.split(",");const o={};WH.forEach((h,i)=>{if(i)o[h]=+p[i]});wmap.set(p[0].toLowerCase(),o);}
const F=fs.readFileSync(DIR+"/features.csv","utf8").trim().split("\n");
const FH=F[0].split(","); const FI={}; FH.forEach((h,i)=>FI[h]=i);
const S=new Map();
try{const L=fs.readFileSync(DIR+"/sim.csv","utf8").trim().split("\n");const H=L[0].split(",");const bi=H.indexOf("best_mult");
for(const l of L.slice(1)){const p=l.split(",");S.set(p[0].toLowerCase(),+p[bi]);}}catch(e){}
const rows=[];
for(const l of F.slice(1)){
  const p=l.split(","); const pid=p[0].toLowerCase(); const w=wmap.get(pid); if(!w) continue;
  rows.push({pid, ...w, y_rug:+p[FI.y_rug], best:S.get(pid)});
}
console.log("pool dgn fitur dompet + label:", rows.length);
const WF=WH.slice(1);
function ncdf(x){const t=1/(1+0.2316419*Math.abs(x));const d=0.3989423*Math.exp(-x*x/2);
let p=d*t*(0.3193815+t*(-0.3565638+t*(1.781478+t*(-1.821256+t*1.330274))));return x>0?1-p:p;}
function auc(data,f,yfn){const pos=[],neg=[];for(const r of data){(yfn(r)?pos:neg).push(r[f]);}
const n1=pos.length,n2=neg.length; if(!n1||!n2) return null;
const all=data.map(r=>({v:r[f],y:yfn(r)?1:0})).sort((a,b)=>a.v-b.v);
let i=0,rs=0; while(i<all.length){let j=i;while(j+1<all.length&&all[j+1].v===all[i].v)j++;
const avg=(i+j+2)/2; for(let k=i;k<=j;k++) if(all[k].y===1) rs+=avg; i=j+1;}
const a=(rs-n1*(n1+1)/2)/(n1*n2); const z=(a-0.5)/Math.sqrt((n1+n2+1)/(12*n1*n2));
return {auc:a,p:2*(1-ncdf(Math.abs(z)))};}
for(const [lbl,yfn,sub] of [["RUG", r=>r.y_rug===1, rows],["MOONSHOT >=11x", r=>r.best>=11, rows.filter(r=>r.best!==undefined)]]){
  const res=WF.map(f=>({f,...(auc(sub,f,yfn)||{auc:NaN,p:1})})).filter(r=>isFinite(r.auc)).sort((a,b)=>a.p-b.p);
  const pos=sub.filter(yfn).length;
  console.log("\n=== "+lbl+"  (n="+sub.length+", positif="+pos+") ===");
  console.log("  AUC     p        fitur dompet");
  for(const r of res.slice(0,8)) console.log("  "+r.auc.toFixed(3)+"  "+r.p.toExponential(1).padStart(8)+"  "+r.f+(r.p<0.05?"   <-- signifikan":""));
}
