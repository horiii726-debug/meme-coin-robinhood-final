// Predictor CatBoost (oblivious trees) untuk filter beli. Cocok bit-per-bit dengan catboost Python.
const fs=require("fs");
function loadCat(file){
  const m=JSON.parse(fs.readFileSync(file,"utf8"));
  const trees=m.trees.map(t=>({f:t.splits.map(s=>s.feat),b:t.splits.map(s=>s.border),leaf:Float64Array.from(t.leaf)}));
  const predict=x=>{
    let s=0;
    for(const t of trees){
      let idx=0;
      for(let k=0;k<t.f.length;k++) if(Math.fround(x[t.f[k]])>t.b[k]) idx|=(1<<k);   // CatBoost membandingkan nilai fitur dalam float32
      s+=t.leaf[idx];
    }
    const z=m.scale*s+m.bias;
    return 1/(1+Math.exp(-z));
  };
  return {predict,feats:m.feats,n:trees.length};
}
module.exports={loadCat};
