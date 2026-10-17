# Latih ULANG kedua model keluar dari SELURUH data (m1+m2), dengan pembagian waktu untuk mengukur kejujuran.
# Latih: 70% pertama berdasarkan waktu. Uji: 30% terakhir (belum pernah dilihat).
import numpy as np, pandas as pd, json, joblib
from sklearn.ensemble import HistGradientBoostingClassifier
from sklearn.metrics import roc_auc_score
a=pd.read_csv("state_m1.csv"); b=pd.read_csv("state_m2.csv")
d=pd.concat([a,b],ignore_index=True).sort_values("blk").reset_index(drop=True)
FE=[c for c in d.columns if c not in ("pid","period","blk","fmax30","f5","rug10")]
X=d[FE].replace([np.inf,-np.inf],np.nan).astype(float).fillna(-1).values
y_bahaya=((d.f5<=0.7)|(d.rug10==1)).astype(int).values
y_naik=(d.fmax30>=1.5).astype(int).values
cut=int(0.70*len(d))
print(f"potret total {len(d)} dari {d.pid.nunique()} koin | latih {cut} | uji {len(d)-cut}")
def mk(): return HistGradientBoostingClassifier(max_iter=400,learning_rate=0.05,max_depth=5,max_leaf_nodes=24,
    min_samples_leaf=80,l2_regularization=5.0,early_stopping=True,validation_fraction=0.15,n_iter_no_change=40,random_state=7)
hasil={}
for nama,y in [("p_bahaya",y_bahaya),("p_naik",y_naik)]:
    m=mk(); m.fit(X[:cut],y[:cut])
    auc=roc_auc_score(y[cut:],m.predict_proba(X[cut:])[:,1])
    print(f"  {nama}: AUC luar-waktu {auc:.3f}")
    hasil[nama]=auc
    # model FINAL dilatih dari SEMUA data (untuk dipakai live)
    mf=mk(); mf.fit(X,y)
    joblib.dump({"model":mf,"feats":FE,"auc_luar_waktu":auc},f"{nama}_final.pkl")
json.dump(hasil,open("auc_exit.json","w"))
print("\nmodel final (dilatih dari SEMUA data) disimpan.")
print("pembanding lama: p_bahaya 0,707 | p_naik 0,758")
