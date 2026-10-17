# Model FINAL untuk VPS: dilatih dari SELURUH data (2 Ags - 17 Sep). AUC diukur dgn pembagian waktu 70/30.
import json, numpy as np, pandas as pd, sys
from sklearn.ensemble import HistGradientBoostingClassifier
from sklearn.metrics import roc_auc_score
OUT=sys.argv[1]
F=["state_ags1.csv","state_ags4.csv","state_ds5d.csv","state_ds24.csv","state_m1.csv","state_m2.csv"]
d=pd.concat([pd.read_csv(f) for f in F],ignore_index=True).sort_values("blk").reset_index(drop=True)
FE=[c for c in d.columns if c not in ("pid","period","blk","fmax30","f5","rug10")]
X=d[FE].replace([np.inf,-np.inf],np.nan).astype(float).fillna(-1).values
cut=int(0.7*len(d))
def mk(): return HistGradientBoostingClassifier(max_iter=400,learning_rate=0.05,max_depth=5,max_leaf_nodes=24,
    min_samples_leaf=80,l2_regularization=5.0,early_stopping=True,validation_fraction=0.15,n_iter_no_change=40,random_state=7)
info={}
for nama,y,fn in [("p_bahaya",((d.f5<=0.7)|(d.rug10==1)).astype(int).values,"danger"),("p_naik",(d.fmax30>=1.5).astype(int).values,"pnaik")]:
    mv=mk(); mv.fit(X[:cut],y[:cut]); auc=roc_auc_score(y[cut:],mv.predict_proba(X[cut:])[:,1])
    m=mk(); m.fit(X,y)
    trees=[{k: it[0].nodes[k].tolist() for k in ("value","feature_idx","num_threshold","missing_go_to_left","left","right","is_leaf")} for it in m._predictors]
    mf=f"{OUT}/{'danger_model' if fn=='danger' else 'pnaik_model'}.json"; cf=f"{OUT}/{fn}_check.json"
    json.dump({"feats":FE,"baseline":float(np.ravel(m._baseline_prediction)[0]),"trees":trees,
      "note":f"{nama} FINAL: {len(d)} potret dari 6 periode (2 Ags-17 Sep), AUC luar-waktu {auc:.3f}"},open(mf,"w"))
    idx=np.random.RandomState(5).choice(len(X),2000,replace=False)
    json.dump({"X":X[idx].tolist(),"p":m.predict_proba(X[idx])[:,1].tolist()},open(cf,"w"))
    info[nama]={"auc_luar_waktu":round(auc,3),"potret":len(d)}
    print(f"{nama}: AUC luar-waktu {auc:.3f} | {len(d)} potret")
json.dump(info,open(f"{OUT}/model_info.json","w"),indent=1)
