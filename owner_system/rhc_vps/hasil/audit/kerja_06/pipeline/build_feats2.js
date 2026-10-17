// Bangun tabel arena: fitur menit-1 + blok keputusan/masuk/keluar + penanda honeypot kausal.
const fs=require("fs"); const {features}=require("../bot/filter_feats.js");
const FE=JSON.parse(fs.readFileSync("../bot/filter_cat.json","utf8")).feats;
const Q96=Math.pow(2,96);
const DIRS=process.argv.slice(2); const DATA=process.env.DATA||"."; // AUDIT06: file non-trade dibaca dari folder data asli
const rows=[];
for(const D of DIRS){
  if(!fs.existsSync(`${D}/trades.jsonl`)){console.error(D,"dilewati (belum ada trades)");continue;}
  const tr=fs.readFileSync(`${D}/trades.jsonl`,"utf8").trim().split("\n").map(JSON.parse).filter(t=>t.plan==="v4");
  const sw=JSON.parse(fs.readFileSync(`${DATA}/${D}/swaps_m1.json`,"utf8"));
  const tf=JSON.parse(fs.readFileSync(`${DATA}/${D}/transfers.json`,"utf8"));
  const cr=fs.existsSync(`${DATA}/${D}/dev_creator.json`)?JSON.parse(fs.readFileSync(`${DATA}/${D}/dev_creator.json`,"utf8")):{};
  const pools=new Map(fs.readFileSync(`${DATA}/${D}/pools.csv`,"utf8").trim().split("\n").slice(1).map(l=>l.trim().split(",")).map(p=>[p[0].toLowerCase(),p]));
  let skip=0;
  for(const t of tr){
    const s0=sw[t.pool], tt=tf[t.pool];
    if(!s0||!tt){skip++;continue;}
    const p=pools.get(t.pool);
    const q1=p[2].toLowerCase()==="0x0000000000000000000000000000000000000000";
    const meta={c0:p[1].toLowerCase(),c1:p[2].toLowerCase(),fee:+p[3],hooks:p[5].toLowerCase(),init:t.init};
    const swaps=s0.map(x=>({blk:x[0],li:x[1],a0:+x[2],a1:+x[3],sqrtP:Number(x[4])/Q96,L:Number(x[5]),fee:x[6]}));
    const f=features(meta,swaps,tt.tr.map(r=>[r[0],r[1],r[2].toLowerCase(),r[3].toLowerCase(),r[4]]),t.ethUsd);
    // honeypot kausal: ada penjualan berhasil di menit-1?
    const jual=swaps.filter(x=>(q1?x.a0:x.a1)<0).length;
    rows.push({ds:D.split("/").join("_").split("\\").join("_"),pool:t.pool,init:t.init,decide:t.init+600,entry:t.entryBlk,exit:t.exitBlk,
      ret:t.ret,win:t.ret>1?1:0,jual_m1:jual,dev:(cr[t.pool]||{}).dev||"",f});
  }
  console.error(D,"baris:",tr.length-skip,"| lewat:",skip);
}
const hdr=["ds","pool","init","decide","entry","exit","ret","win","jual_m1","dev",...FE];
const out=[hdr.join(",")];
for(const r of rows) out.push([r.ds,r.pool,r.init,r.decide,r.entry,r.exit,r.ret,r.win,r.jual_m1,r.dev,
  ...FE.map(k=>{const v=r.f[k];return Number.isFinite(v)?(+v.toFixed(8)):"";})].join(","));
fs.writeFileSync("arena_feats.csv",out.join("\n"));
console.error("TOTAL",rows.length,"baris -> arena_feats.csv");
