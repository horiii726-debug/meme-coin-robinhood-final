# Ekspor model bahaya BARU ke JSON (format yang dibaca mesin Node) + file verifikasi parity.
import json, numpy as np, pandas as pd, joblib
o=joblib.load("bahaya_baru.pkl"); m=o["model"]; FEATS=o["feats"]
df=pd.read_csv("state_rows.csv")
X=df[FEATS].replace([np.inf,-np.inf],np.nan).astype(float).fillna(-1)
trees=[]
for it in m._predictors:
    nd=it[0].nodes
    trees.append({k: nd[k].tolist() for k in ("value","feature_idx","num_threshold","missing_go_to_left","left","right","is_leaf")})
model={"feats":FEATS,"baseline":float(np.ravel(m._baseline_prediction)[0]),"trees":trees,
       "note":"p_bahaya BARU 2026-09-19: dilatih 92.486 potret (13-15 Sep), AUC luar-waktu 0,707 (lama 0,595)"}
json.dump(model,open("danger_model_baru.json","w"))
# file verifikasi: 2000 sampel dari data uji
uji=(df.period=="BARU").values
idx=np.random.RandomState(0).choice(np.where(uji)[0],2000,replace=False)
chk={"X":X.values[idx].tolist(),"p":m.predict_proba(X.values[idx])[:,1].tolist()}
json.dump(chk,open("danger_check_baru.json","w"))
print("pohon:",len(trees),"| fitur:",len(FEATS),"| file ditulis")
