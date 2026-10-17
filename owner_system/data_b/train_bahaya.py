# Latih ulang model BAHAYA dari potret kondisi terbaru. Dilatih di m1 (13-15 Sep), diuji di m2 (16-17 Sep).
import numpy as np, pandas as pd, json
from sklearn.ensemble import HistGradientBoostingClassifier
from sklearn.metrics import roc_auc_score
df=pd.read_csv("state_rows.csv")
FEATS=[c for c in df.columns if c not in ("pid","period","blk","fmax30","f5","rug10")]
X=df[FEATS].replace([np.inf,-np.inf],np.nan).astype(float).fillna(-1).values
y_dg=((df.f5<=0.7)|(df.rug10==1)).astype(int).values
latih=(df.period=="LAMA").values; uji=~latih
m=HistGradientBoostingClassifier(max_iter=400,learning_rate=0.05,max_depth=5,max_leaf_nodes=24,
    min_samples_leaf=80,l2_regularization=5.0,early_stopping=True,validation_fraction=0.15,
    n_iter_no_change=40,random_state=7)
m.fit(X[latih],y_dg[latih])
auc_in=roc_auc_score(y_dg[latih],m.predict_proba(X[latih])[:,1])
auc_out=roc_auc_score(y_dg[uji],m.predict_proba(X[uji])[:,1])
print(f"model BARU  : AUC latih {auc_in:.3f} | AUC luar-waktu {auc_out:.3f}  <- yang penting yg kanan")
# bandingkan dengan model LAMA (danger_model.json) pada data uji yang sama
old=json.load(open("C:/Users/horii/rhc-quant/live/danger_model.json"))
print(f"model LAMA  : fitur {len(old['feats'])} | fitur baru {len(FEATS)} | sama? {old['feats']==FEATS}")
import joblib; joblib.dump({"model":m,"feats":FEATS},"bahaya_baru.pkl")
np.save("bahaya_auc.npy",np.array([auc_in,auc_out]))
