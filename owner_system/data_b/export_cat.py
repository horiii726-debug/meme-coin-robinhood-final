import json, numpy as np, pandas as pd
from catboost import CatBoostClassifier
FE=["fee","hook","n_swap","n_buy","n_sell","buy_usd","sell_usd","lp_m1","ret_m1","flow_lp","n_holders","top1","top5","hhi","entropy","gini","l2_l1","pool_share","n_buyers","n_sellers","g_nodes","g_edges","g_density","g_lambda1","g_deg_central","g_p2p_frac","kyle_lambda","impact_r2","impact_cos","impact_norm","lam_buy","lam_sell","lw_mom","lw_mom_log"]
df=pd.read_csv("features_b.csv").sort_values("init").reset_index(drop=True)
X=df[FE].fillna(-1).values; y=df.win.values.astype(bool)
m=CatBoostClassifier(iterations=200,learning_rate=0.05,depth=4,l2_leaf_reg=5.0,random_seed=0,verbose=0,allow_writing_files=False)
m.fit(X,y)
m.save_model("cat_raw.json",format="json")
j=json.load(open("cat_raw.json"))
oh=j["oblivious_trees"]; fi=j["features_info"]["float_features"]
# peta: flat_feature_index -> posisi kolom; border per split
fmap={f["flat_feature_index"]:f for f in fi}
def split_of(s):
    f=fmap[s["float_feature_index"]] if "float_feature_index" in s else None
    return {"feat":int(s["float_feature_index"]),"border":float(s["border"])}
trees=[]
for t in oh:
    sp=[split_of(s) for s in t["splits"]]
    trees.append({"splits":sp,"leaf":[float(v) for v in t["leaf_values"]]})
scale=j["scale_and_bias"]
bias=scale[1][0] if isinstance(scale[1],list) else scale[1]
out={"type":"catboost","feats":FE,"trees":trees,"scale":float(scale[0]),"bias":float(bias),
     "note":"skor = sigmoid(scale*sum(leaf)+bias); daun dipilih dgn bit: bit_k = (x[feat_k] > border_k)"}
json.dump(out,open("C:/Users/horii/rhc-quant/live/filter_cat.json","w"))
# file verifikasi: 500 sampel
idx=np.random.RandomState(0).choice(len(X),min(500,len(X)),replace=False)
p=m.predict_proba(X[idx])[:,1]
json.dump({"X":X[idx].tolist(),"p":p.tolist()},open("C:/Users/horii/rhc-quant/live/filter_cat_check.json","w"))
print("pohon:",len(trees),"| kedalaman:",len(trees[0]["splits"]),"| scale",scale[0],"bias",bias)
print("ambang kuantil 30% pada data latih:",float(np.quantile(m.predict_proba(X)[:,1],0.30)))
