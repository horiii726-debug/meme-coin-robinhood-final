# AUDIT07-H: skor ML kausal + 2 fitur sidik jari (buyer_uniq_frac, sync_frac) dari kerja_12/feat12.csv
import numpy as np, pandas as pd, json, os
from catboost import CatBoostClassifier
FE=json.load(open("C:/Users/horii/rhc-quant/rhc_vps/hasil/audit/kerja_07/bot/filter_cat.json"))["feats"]
EXTRA=["buyer_uniq_frac","sync_frac"]
RETRAIN=int(os.environ.get("RETRAIN","100")); MINSTART=int(os.environ.get("MINSTART","60")); OUTF=os.environ.get("OUTF","arena_scored.csv")
df=pd.read_csv(os.environ.get("IN","arena_feats.csv"))
f12=pd.read_csv("C:/Users/horii/rhc-quant/rhc_vps/hasil/audit/kerja_12/feat12.csv")[["ds","pool"]+EXTRA]
df=df.merge(f12,on=["ds","pool"],how="left")
df=df.sort_values("decide").reset_index(drop=True)
FEA=FE+EXTRA
X=df[FEA].fillna(-1).values; y=df.win.values.astype(bool)
decide=df.decide.values; exitb=df["exit"].values
n=len(df); score=np.full(n,np.nan); model=None; dilatih_pada=0; n_latih=0
for i in range(n):
    siap=exitb<decide[i]; ns=int(siap.sum())
    if ns>=MINSTART and (model is None or ns-dilatih_pada>=RETRAIN):
        idx=np.where(siap)[0]
        if len(set(y[idx]))>1:
            model=CatBoostClassifier(iterations=200,learning_rate=0.05,depth=4,l2_leaf_reg=5.0,
                                     random_seed=0,verbose=0,allow_writing_files=False)
            model.fit(X[idx],y[idx]); dilatih_pada=ns; n_latih+=1
    if model is not None: score[i]=model.predict_proba(X[i:i+1])[:,1][0]
df["score"]=score; df.to_csv(OUTF,index=False)
print(f"[H 36 fitur] model dilatih ulang {n_latih}x | koin berskor {int((~np.isnan(score)).sum())}/{n}")
