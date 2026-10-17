import pandas as pd, numpy as np
from sklearn.metrics import roc_auc_score
lp=pd.read_csv("lp_dev.csv")
ar=pd.read_csv("../../../data/arena_scored.csv"); ar["pool"]=ar.pool.str.lower()
c=ar[["ds","pool","init","decide","entry","exit","ret","win","score","lp_m1","jual_m1","fee","hook"]].merge(
   lp.drop(columns=["ds","init","decide"]),on="pool",how="inner")
c["per"]=np.where(c.ds.isin(["m1","m2"]),"BARU","LAMA")
c.to_csv("kand.csv",index=False)
print("== aturan dev (SEMUA koin terlihat) ==")
for per,g in c.groupby("per"):
    f=g.n_prior_rug>0
    print(f"{per}: kena {f.sum()}/{len(g)} | presisi rug30 {(g[f].rug30.mean() if f.sum() else np.nan):.3f} (dasar {g.rug30.mean():.3f}) | ret kena {(g[f].ret.mean() if f.sum() else np.nan):.3f} vs sisa {g[~f].ret.mean():.3f}")
print("\n== pool yang punya dev sama sebelumnya sama sekali ==")
for per,g in c.groupby("per"):
    f=g.n_prior>0
    print(f"{per}: {f.sum()}/{len(g)} punya pool sebelumnya dari dev sama; rug30 {(g[f].rug30.mean()):.3f} vs {g[~f].rug30.mean():.3f}")
# universe yang benar2 dibeli bot / skor tinggi
print("\n== AUC rug30 pada subset skor tinggi (kuantil skor >=0.70, mirip yang dibeli) ==")
FE=["ts","w_main","narrow","full_range","sym_off","lo_main","hi_main","first_add_dt","add_lg","n_pos","n_add"]
for per,g in c.groupby("per"):
    gs=g.dropna(subset=["score"]); thr=gs.score.quantile(0.70); hi=gs[gs.score>=thr]
    out=[]
    for f in FE:
        try: out.append(f"{f}:{roc_auc_score(hi.rug30,hi[f].fillna(-1)):.2f}")
        except Exception: out.append(f+":-")
    print(per,"n=%d rug30=%.2f"%(len(hi),hi.rug30.mean())," ".join(out))
print("\n== label uang: ret<0.3 (bencana) ==")
c["bencana"]=(c.ret<0.3).astype(int)
for per,g in c.groupby("per"):
    print(per,"bencana %.3f"%g.bencana.mean(), " ".join(f"{f}:{roc_auc_score(g.bencana,g[f].fillna(-1)):.2f}" for f in FE))
print("\n== hubungan rug30 -> bencana ==")
print(pd.crosstab(c.rug30,c.bencana,normalize="index").round(3))
print(c.groupby(["per","rug30"]).agg(n=("pool","size"),ret=("ret","mean"),bencana=("bencana","mean")).round(3))
