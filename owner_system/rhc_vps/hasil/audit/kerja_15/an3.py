import pandas as pd, numpy as np
from sklearn.metrics import roc_auc_score
m=pd.read_csv("arena_lp.csv")
OLD=["ags1","ags4","u_ds5d","u_ds24"]; NEW=["m1","m2"]
m["per"]=np.where(m.ds.isin(NEW),"BARU","LAMA")
print("== sebaran tick_spacing x fee (kandidat bot) ==")
print(pd.crosstab(m.ts,m.per,values=m.rug30,aggfunc="mean").round(3).join(pd.crosstab(m.ts,m.per).add_prefix("n_")))
print("\n== w_main (lebar rentang tick posisi utama) ==")
b=pd.cut(m.w_main,[-1,1000,5000,20000,100000,200000,400000,900000,1700000,2e6])
print(m.groupby(b,observed=True).agg(n=("pool","size"),rug30=("rug30","mean"),ret=("ret","mean"),
    med_ret=("ret","median"),p_win=("win","mean"),roket=("ret",lambda s:(s>3).mean())).round(3))
print("\n== add_lg (log10 likuiditas ditambah, unit L) ==")
b2=pd.cut(m.add_lg,[-1,10,12,14,16,18,20,25,40])
print(m.groupby(b2,observed=True).agg(n=("pool","size"),rug30=("rug30","mean"),ret=("ret","mean"),
    p_win=("win","mean"),roket=("ret",lambda s:(s>3).mean())).round(3))
print("\n== first_add_dt (blok LP pertama - init) ==")
b3=pd.cut(m.first_add_dt,[-2,-1,0,1,10,60,600,1e6])
print(m.groupby(b3,observed=True).agg(n=("pool","size"),rug30=("rug30","mean"),ret=("ret","mean"),p_win=("win","mean")).round(3))
print("\n== baseline: lp_m1 (USD) sebagai peramal rug30 ==")
for per,g in m.groupby("per"):
    print(per,"AUC lp_m1",round(roc_auc_score(g.rug30,g.lp_m1.fillna(-1)),3),
          "| AUC skor filter lama",round(roc_auc_score(g.dropna(subset=["score"]).rug30,g.dropna(subset=["score"]).score),3) if g.score.notna().sum()>10 else "-")
