# Diagnostik: apakah MFE (moonshot) bisa diramal dari 34 fitur menit-1? KAUSAL.
# Label sebuah koin baru diketahui di entry+324000 (9 jam) -> hanya koin itu yang boleh melatih.
import numpy as np, pandas as pd, json, sys, os
from catboost import CatBoostClassifier
from sklearn.metrics import roc_auc_score
FE=json.load(open("C:/Users/horii/rhc-quant/rhc_vps/bot/filter_cat.json"))["feats"]
F=pd.read_csv(sys.argv[1] if len(sys.argv)>1 else "C:/Users/horii/rhc-quant/rhc_vps/hasil/audit/kerja_07/g11/arena_feats.csv")
M=pd.read_csv("mfe2_all.csv")[["pool","v324000","v36000","v9000","nswap"]]
d=F.merge(M,on="pool",how="inner").sort_values("decide").reset_index(drop=True)
d["ready"]=d.entry+324000
print("koin berfitur + berlabel MFE:",len(d))
print("sebaran:", {f">={t}x":int((d.v324000>=t).sum()) for t in [2,3,5,10]})
X=d[FE].fillna(-1).values; decide=d.decide.values; ready=d.ready.values
def causal(y,seed=0,retrain=100,minstart=60,minpos=5):
    n=len(y); sc=np.full(n,np.nan); model=None; at=0; nl=0
    for i in range(n):
        siap=ready<decide[i]; ns=int(siap.sum())
        if ns>=minstart and (model is None or ns-at>=retrain):
            idx=np.where(siap)[0]
            if y[idx].sum()>=minpos and (~y[idx]).sum()>=minpos:
                model=CatBoostClassifier(iterations=200,learning_rate=0.05,depth=4,l2_leaf_reg=5.0,
                    random_seed=seed,verbose=0,allow_writing_files=False,auto_class_weights="Balanced")
                model.fit(X[idx],y[idx]); at=ns; nl+=1
        if model is not None: sc[i]=model.predict_proba(X[i:i+1])[:,1][0]
    return sc,nl
rng=np.random.RandomState(7)
out={}
for T in [2,3,5,10]:
    y=(d.v324000>=T).values
    sc,nl=causal(y)
    d[f"m{T}"]=sc
    ok=~np.isnan(sc)
    line=f"MFE>={T}x | latih {nl}x | berskor {ok.sum()}"
    for nm,sel in [("PILIH ds5d+ds24",d.ds.isin(["u_ds5d","u_ds24"]).values),("BUKTI m1+m2",d.ds.isin(["m1","m2"]).values)]:
        s=ok&sel
        if s.sum()>30 and len(set(y[s]))>1:
            a=roc_auc_score(y[s],sc[s])
            # kontrol label diacak
            yr=y.copy(); rng.shuffle(yr)
            line+=f" | {nm}: n {int(s.sum())} pos {int(y[s].sum())} AUC {a:.3f}"
    print(line)
d.to_csv("moon_scored_lama.csv",index=False)
