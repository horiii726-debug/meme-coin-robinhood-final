# Bagian 12: target ganda, kausal (dilatih ulang tiap 100 trade tutup, hanya trade yg sudah tutup).
#   score = P(win: ret>1)  [model lama]   rug = P(ret<0,3)   moon = P(ret>=2)
import numpy as np, pandas as pd, json, os
from catboost import CatBoostClassifier
FE=json.load(open("C:/Users/horii/rhc-quant/live/filter_cat.json"))["feats"]
EXTRA=[c for c in os.environ.get("EXTRA","").split(",") if c]
SEED=int(os.environ.get("SEED","0")); INF=os.environ.get("INF","arena_feats.csv"); OUTF=os.environ.get("OUTF","sc_multi.csv")
df=pd.read_csv(INF)
if EXTRA: df=df.merge(pd.read_csv("flow_feats.csv").drop_duplicates(["ds","pool"]),on=["ds","pool"],how="left")
df=df.sort_values("decide").reset_index(drop=True)
FX=FE+EXTRA; X=df[FX].fillna(-1).values; ret=df.ret.values
Y={"score":ret>1,"rug":ret<0.3,"moon":ret>=2}
decide=df.decide.values; exitb=df["exit"].values; n=len(df)
out={k:np.full(n,np.nan) for k in Y}; M={}; at=0
for i in range(n):
    siap=exitb<decide[i]; ns=int(siap.sum())
    if ns>=60 and (not M or ns-at>=100):
        idx=np.where(siap)[0]; at=ns
        for k,y in Y.items():
            if len(set(y[idx]))>1:
                M[k]=CatBoostClassifier(iterations=200,learning_rate=0.05,depth=4,l2_leaf_reg=5.0,random_seed=SEED,verbose=0,allow_writing_files=False,thread_count=2).fit(X[idx],y[idx])
    for k,m in M.items(): out[k][i]=m.predict_proba(X[i:i+1])[:,1][0]
for k in Y: df[k]=out[k]
df[[c for c in df.columns if not c.startswith("of_")]].to_csv(OUTF,index=False)
print(f"{OUTF}: {len(FX)} fitur | berskor {int((~np.isnan(out['score'])).sum())}/{n}")
