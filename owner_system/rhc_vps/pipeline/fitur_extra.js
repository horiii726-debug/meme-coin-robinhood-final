// Hitung ulang fitur matematika yang dulu dibuang (data dulu cuma 843 trade, sekarang 2.125).
const fs=require("fs");
const Q96=Math.pow(2,96), NATIVE="0x0000000000000000000000000000000000000000";
const out={};
for(const D of ["m1","m2"]){
  const sw=JSON.parse(fs.readFileSync(`${D}/swaps_m1.json`,"utf8"));
  const pools=new Map(fs.readFileSync(`${D}/pools.csv`,"utf8").trim().split("\n").slice(1).map(l=>l.trim().split(",")).map(p=>[p[0].toLowerCase(),p]));
  for(const [pool,s0] of Object.entries(sw)){
    const p=pools.get(pool); if(!p) continue;
    const q1=p[2].toLowerCase()===NATIVE;
    const s=s0.map(x=>({blk:x[0],a0:+x[2],a1:+x[3],sp:Number(x[4])/Q96,L:Number(x[5])})).sort((a,b)=>a.blk-b.blk);
    if(s.length<5) continue;
    const price=s.map(x=>q1?x.sp*x.sp:1/(x.sp*x.sp));
    const base=s.map(x=>q1?x.a0:x.a1), quote=s.map(x=>q1?x.a1:x.a0);
    const r=[]; for(let i=1;i<price.length;i++){const d=Math.log(price[i]/price[i-1]); if(Number.isFinite(d)) r.push(d);}
    if(r.length<4) continue;
    const m=r.reduce((a,b)=>a+b,0)/r.length;
    const v=r.reduce((a,b)=>a+(b-m)**2,0)/r.length;
    const sd=Math.sqrt(v)||1e-12;
    const skew=r.reduce((a,b)=>a+((b-m)/sd)**3,0)/r.length;
    const kurt=r.reduce((a,b)=>a+((b-m)/sd)**4,0)/r.length-3;
    // ACF-1
    let c1=0; for(let i=1;i<r.length;i++) c1+=(r[i]-m)*(r[i-1]-m);
    const acf1=c1/((r.length-1)*v||1e-12);
    // Hurst (rescaled range sederhana)
    let cum=0,mn=0,mx=0; for(const x of r){cum+=x-m; mn=Math.min(mn,cum); mx=Math.max(mx,cum);}
    const hurst=(mx-mn)>0&&sd>0?Math.log((mx-mn)/sd)/Math.log(r.length):0.5;
    // Amihud: |return| per dolar volume
    const usd=quote.map(x=>Math.abs(x)/1e18);
    let am=0,n=0; for(let i=1;i<price.length;i++){const u=usd[i]; if(u>1e-9){am+=Math.abs(Math.log(price[i]/price[i-1]))/u;n++;}}
    const amihud=n?am/n:0;
    // order flow imbalance
    const buy=base.map(x=>x>0);
    const bu=usd.filter((_,i)=>buy[i]).reduce((a,b)=>a+b,0), su=usd.filter((_,i)=>!buy[i]).reduce((a,b)=>a+b,0);
    const ofi=(bu-su)/Math.max(bu+su,1e-12);
    // entropi ukuran trade
    const tot=usd.reduce((a,b)=>a+b,0)||1e-12;
    const sh=usd.map(x=>x/tot).filter(x=>x>0);
    const ent_sz=-sh.reduce((a,b)=>a+b*Math.log(b),0);
    // tren & keragaman likuiditas
    const lp=s.map(x=>x.L);
    const lpm=lp.reduce((a,b)=>a+b,0)/lp.length;
    const lp_cv=Math.sqrt(lp.reduce((a,b)=>a+(b-lpm)**2,0)/lp.length)/(lpm||1);
    const lp_trend=lp.length>1?(lp[lp.length-1]-lp[0])/(lp[0]||1):0;
    out[pool]={vol_real:sd,skew,kurt,acf1,hurst,amihud:Math.log1p(amihud),ofi,ent_sz,lp_cv,lp_trend};
  }
}
fs.writeFileSync("fitur_extra.json",JSON.stringify(out));
console.log("fitur tambahan dihitung untuk",Object.keys(out).length,"koin");
