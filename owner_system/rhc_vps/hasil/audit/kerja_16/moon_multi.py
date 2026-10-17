# MODEL MOONSHOT BERTINGKAT (cetak biru): label = MFE (maximum favorable excursion) dari titik keputusan,
# ambang +100%/+300%/+500%/+1000%/+3000%. Satu model per tingkat, KAUSAL (label baru diketahui di entry+9 jam).
# Kontrol: koin yang pada waktu observasi sama BELUM moonshot = seluruh koin lain di aliran waktu yang sama.
import numpy as np, pandas as pd, json, os, sys
from catboost import CatBoostClassifier
from sklearn.metrics import roc_auc_score
FE=json.load(open("C:/Users/horii/rhc-quant/rhc_vps/bot/filter_cat.json"))["feats"]
FEATS=sys.argv[1]; OUT=sys.argv[2] if len(sys.argv)>2 else "moon_multi.csv"
F=pd.read_csv(FEATS)
M=pd.read_csv("mfe2_all.csv")[["pool","v324000","nswap"]]
d=F.merge(M,on="pool",how="inner").sort_values("decide").reset_index(drop=True)
d["ready"]=d.entry+324000
X=d[FE].fillna(-1).values; decide=d.decide.values; ready=d.ready.values; n=len(d)
print(f"koin: {n} | periode: {d.ds.nunique()}")
LV=[("P100",2.0),("P300",4.0),("P500",6.0),("P1000",11.0),("P3000",31.0)]
rng=np.random.RandomState(11)
def causal(y,minpos=8,retrain=300,minstart=200):
    sc=np.full(n,np.nan); model=None; at=0; nl=0
    for i in range(n):
        siap=ready<decide[i]; ns=int(siap.sum())
        if ns>=minstart and (model is None or ns-at>=retrain):
            idx=np.where(siap)[0]
            if y[idx].sum()>=minpos and (~y[idx]).sum()>=minpos:
                model=CatBoostClassifier(iterations=250,learning_rate=0.05,depth=4,l2_leaf_reg=5.0,random_seed=0,
                                         verbose=0,allow_writing_files=False,auto_class_weights="Balanced")
                model.fit(X[idx],y[idx]); at=ns; nl+=1
        if model is not None: sc[i]=model.predict_proba(X[i:i+1])[:,1][0]
    return sc,nl
GRP=[("AGUSTUS",d.ds.str.startswith("am_").values),("SEPT ds5d+ds24",d.ds.isin(["u_ds5d","u_ds24"]).values),("SEPT m1+m2",d.ds.isin(["m1","m2"]).values)]
print("tingkat | pos | latih |"+"".join(f" {g[0]}: AUC (acak)  |" for g in GRP))
for nm,th in LV:
    y=(d.v324000>=th).values
    if y.sum()<30: print(f"{nm}: hanya {int(y.sum())} contoh positif - TIDAK CUKUP DATA"); continue
    sc,nl=causal(y); d[nm]=sc; ok=~np.isnan(sc)
    ys=y.copy(); rng.shuffle(ys); scs,_=causal(ys)
    line=f"{nm:<7} | {int(y.sum()):>3} | {nl:>5} |"
    for gn,gs in GRP:
        t=ok&gs
        if t.sum()>50 and len(set(y[t]))>1:
            a=roc_auc_score(y[t],sc[t]); o=~np.isnan(scs)&gs
            ar=roc_auc_score(ys[o],scs[o]) if o.sum()>50 and len(set(ys[o]))>1 else float("nan")
            line+=f" {a:.3f} ({ar:.3f}) |"
        else: line+= "   -   |"
    print(line)
d.to_csv(OUT,index=False)
