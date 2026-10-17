import json, numpy as np, pandas as pd, joblib
d=pd.concat([pd.read_csv("state_m1.csv"),pd.read_csv("state_m2.csv")],ignore_index=True)
for nama,out in [("p_bahaya","danger_model_v3"),("p_naik","pnaik_v3")]:
    o=joblib.load(f"{nama}_final.pkl"); m=o["model"]; FE=o["feats"]
    X=d[FE].replace([np.inf,-np.inf],np.nan).astype(float).fillna(-1)
    trees=[]
    for it in m._predictors:
        nd=it[0].nodes
        trees.append({k: nd[k].tolist() for k in ("value","feature_idx","num_threshold","missing_go_to_left","left","right","is_leaf")})
    json.dump({"feats":FE,"baseline":float(np.ravel(m._baseline_prediction)[0]),"trees":trees,
      "note":f"{nama} v3 2026-09-19: dilatih 118.840 potret (m1+m2), AUC luar-waktu {o['auc_luar_waktu']:.3f}"},
      open(f"{out}.json","w"))
    idx=np.random.RandomState(3).choice(len(X),2000,replace=False)
    json.dump({"X":X.values[idx].tolist(),"p":m.predict_proba(X.values[idx])[:,1].tolist()},open(f"{out}_check.json","w"))
    print(f"{nama} -> {out}.json ({len(trees)} pohon)")
