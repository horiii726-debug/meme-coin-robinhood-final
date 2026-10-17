# Peringkat jalur kedua HANYA dari fitur saat pemicu (9 fitur, tanpa fitur menit-1).
# Kausal: hanya belajar dari trade jalur kedua yang sudah TUTUP sebelum keputusan ini.
import numpy as np, pandas as pd, glob, os, sys
from catboost import CatBoostClassifier
from sklearn.metrics import roc_auc_score
F=["f_dly","f_ns","f_nb","f_nsl","f_bu","f_su","f_lp","f_lpr","f_v0"]
d=pd.concat([pd.read_csv(f) for f in sorted(glob.glob("mom/*.csv"))],ignore_index=True)
d=d[d["t1.5_hit"]==1].copy()
d["ret"]=d["t1.5_exit"].fillna(d["t1.5_last"])-0.21/np.maximum(d["size"],1)
d["dec"]=d["t1.5_entblk"]; d["ex"]=np.maximum(d["t1.5_exblk"],d["dec"]+1)
d=d.sort_values("dec").reset_index(drop=True)
X=np.nan_to_num(d[F].values,nan=-1,posinf=-1,neginf=-1); y=(d.ret.values>1)
if os.environ.get("SHUF")=="1":
    r=np.random.RandomState(int(os.environ.get("SEED","0"))); y=y.copy(); r.shuffle(y)
dec=d.dec.values; ex=d.ex.values; n=len(d); sc=np.full(n,np.nan); model=None; at=0; nl=0
for i in range(n):
    siap=ex<dec[i]; ns=int(siap.sum())
    if ns>=100 and (model is None or ns-at>=200):
        idx=np.where(siap)[0]
        if y[idx].sum()>=20 and (~y[idx]).sum()>=20:
            model=CatBoostClassifier(iterations=300,learning_rate=0.05,depth=4,l2_leaf_reg=5.0,random_seed=0,verbose=0,allow_writing_files=False)
            model.fit(X[idx],y[idx]); at=ns; nl+=1
    if model is not None: sc[i]=model.predict_proba(X[i:i+1])[:,1][0]
d["rank"]=sc; ok=~np.isnan(sc)
print(f"model dilatih {nl}x | berskor {int(ok.sum())}/{n}")
print("kelompok        | n    | AUC   | ret semua | ret 50% atas | ret 25% atas | win 25% atas")
for nm,sel in [("AGUSTUS",d.ds.str.startswith("am_").values),("SEPT m1+m2",d.ds.isin(["m1","m2"]).values),("SEPT ds5d+ds24",d.ds.isin(["u_ds5d","u_ds24"]).values)]:
    t=ok&sel
    if t.sum()<50 or len(set(y[t]))<2: print(f"{nm}: terlalu sedikit"); continue
    r=d.ret.values[t]; s=sc[t]
    print(f"{nm:<15} | {int(t.sum()):>4} | {roc_auc_score(y[t],s):.3f} | {r.mean():>9.3f} | {r[s>=np.median(s)].mean():>12.3f} | {r[s>=np.quantile(s,0.75)].mean():>12.3f} | {100*(r[s>=np.quantile(s,0.75)]>1).mean():>10.0f}%")
d[["pool","rank"]].to_csv("rank2_all.csv",index=False)
