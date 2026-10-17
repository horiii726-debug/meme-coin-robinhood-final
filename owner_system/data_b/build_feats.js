// Bangun CSV fitur (34) + label dari trades/swaps_m1/transfers. Pakai filter_feats.js yang sama dengan bot live.
const fs=require("fs"); const {features}=require("../live/filter_feats.js");
const FE=["fee","hook","n_swap","n_buy","n_sell","buy_usd","sell_usd","lp_m1","ret_m1","flow_lp","n_holders","top1","top5","hhi","entropy","gini","l2_l1","pool_share","n_buyers","n_sellers","g_nodes","g_edges","g_density","g_lambda1","g_deg_central","g_p2p_frac","kyle_lambda","impact_r2","impact_cos","impact_norm","lam_buy","lam_sell","lw_mom","lw_mom_log"];
const Q96=Math.pow(2,96);
const rows=[];
for(const D of ["d1","d2","d3"]){
  const tr=fs.readFileSync(`${D}/trades.jsonl`,"utf8").trim().split("\n").map(JSON.parse).filter(t=>t.plan==="v4");
  const sw=JSON.parse(fs.readFileSync(`${D}/swaps_m1.json`,"utf8"));
  const tf=JSON.parse(fs.readFileSync(`${D}/transfers.json`,"utf8"));
  const pools=new Map(fs.readFileSync(`${D}/pools.csv`,"utf8").trim().split("\n").slice(1).map(l=>l.trim().split(",")).map(p=>[p[0].toLowerCase(),p]));
  let skip=0;
  for(const t of tr){
    const s0=sw[t.pool]; const tt=tf[t.pool];
    if(!s0||!tt){skip++;continue;}
    const p=pools.get(t.pool);
    const meta={c0:p[1].toLowerCase(),c1:p[2].toLowerCase(),fee:+p[3],hooks:p[5].toLowerCase(),init:t.init};
    const swaps=s0.map(x=>({blk:x[0],li:x[1],a0:+x[2],a1:+x[3],sqrtP:Number(x[4])/Q96,L:Number(x[5]),fee:x[6]}));
    const f=features(meta,swaps,tt.tr.map(r=>[r[0],r[1],r[2].toLowerCase(),r[3].toLowerCase(),r[4]]),t.ethUsd);
    rows.push({ds:D,pool:t.pool,init:t.init,ret:t.ret,pnl:t.pnl,win:t.ret>1?1:0,f});
  }
  console.error(D,"baris:",tr.length-skip,"| lewat (data kurang):",skip);
}
const hdr=["ds","pool","init","ret","pnl","win",...FE];
const out=[hdr.join(",")];
for(const r of rows) out.push([r.ds,r.pool,r.init,r.ret,r.pnl,r.win,...FE.map(k=>{const v=r.f[k];return Number.isFinite(v)?(+v.toFixed(8)):"";})].join(","));
fs.writeFileSync("features_b.csv",out.join("\n"));
console.error("TOTAL",rows.length,"baris ->", "data_b/features_b.csv | win rate",(100*rows.filter(r=>r.win).length/rows.length).toFixed(1)+"%");
