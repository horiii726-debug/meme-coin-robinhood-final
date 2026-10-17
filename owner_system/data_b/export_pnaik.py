import json, numpy as np, pandas as pd, joblib
o=joblib.load("pnaik.pkl"); m=o["model"]; FEATS=o["feats"]
df=pd.read_csv("state_rows.csv")
X=df[FEATS].replace([np.inf,-np.inf],np.nan).astype(float).fillna(-1)
trees=[]
for it in m._predictors:
    nd=it[0].nodes
    trees.append({k: nd[k].tolist() for k in ("value","feature_idx","num_threshold","missing_go_to_left","left","right","is_leaf")})
json.dump({"feats":FEATS,"baseline":float(np.ravel(m._baseline_prediction)[0]),"trees":trees,
  "note":"p_naik 2026-09-19: harga masih naik >=1,5x dalam 30 menit. AUC luar-waktu 0,758"},
  open("pnaik_model.json","w"))
uji=(df.period=="BARU").values
idx=np.random.RandomState(1).choice(np.where(uji)[0],2000,replace=False)
json.dump({"X":X.values[idx].tolist(),"p":m.predict_proba(X.values[idx])[:,1].tolist()},open("pnaik_check.json","w"))
print("p_naik diekspor:",len(trees),"pohon")
