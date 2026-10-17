# Latih model KELUAR hanya dari periode yang SUDAH LEWAT (walk-forward). Pakai: python latih_keluar_wf.py <tag> <csv1> [csv2 ...]
import sys, json, numpy as np, pandas as pd
from sklearn.ensemble import HistGradientBoostingClassifier
tag=sys.argv[1]; files=sys.argv[2:]
d=pd.concat([pd.read_csv(f) for f in files],ignore_index=True)
FE=[c for c in d.columns if c not in ("pid","period","blk","fmax30","f5","rug10")]
X=d[FE].replace([np.inf,-np.inf],np.nan).astype(float).fillna(-1)
def mk(): return HistGradientBoostingClassifier(max_iter=400,learning_rate=0.05,max_depth=5,max_leaf_nodes=24,
    min_samples_leaf=80,l2_regularization=5.0,early_stopping=True,validation_fraction=0.15,n_iter_no_change=40,random_state=7)
for nama,y,out in [("p_bahaya",((d.f5<=0.7)|(d.rug10==1)).astype(int).values,f"wf_bahaya_{tag}"),
                   ("p_naik",(d.fmax30>=1.5).astype(int).values,f"wf_naik_{tag}")]:
    m=mk(); m.fit(X.values,y)
    trees=[{k: it[0].nodes[k].tolist() for k in ("value","feature_idx","num_threshold","missing_go_to_left","left","right","is_leaf")} for it in m._predictors]
    json.dump({"feats":FE,"baseline":float(np.ravel(m._baseline_prediction)[0]),"trees":trees,
               "note":f"{nama} walk-forward {tag}: dilatih HANYA dari {', '.join(files)}"},open(f"../scripts/{out}.json","w"))
print(f"model keluar {tag}: dilatih dari {len(d)} potret ({', '.join(files)})")
