import pandas as pd, numpy as np
from sklearn.metrics import roc_auc_score
c=pd.read_csv("kand.csv")
c["dt"]=c.rug_blk-c.decide
for nm,w in [("rug1",600),("rug2",1200),("rug3",1800),("rug5",3000),("rug7",4200),("rug15",9000),("rug30",18000)]:
    c[nm]=((c.dt>0)&(c.dt<=w)).astype(int)
c["per"]=np.where(c.ds.isin(["m1","m2"]),"BARU","LAMA")
print("== basis label per periode ==")
print(c.groupby("per")[["rug1","rug2","rug3","rug5","rug7","rug15","rug30"]].mean().round(4))
print("\n== ret rata2 kandidat per label ==")
for nm in ["rug1","rug2","rug3","rug5","rug7","rug30"]:
    g=c.groupby([nm]).ret.mean()
    print(nm,"ret(1)=%.3f ret(0)=%.3f n1=%d"%(g.get(1,np.nan),g.get(0,np.nan),(c[nm]==1).sum()))
FE=["ts","w_main","narrow","full_range","sym_off","lo_main","hi_main","first_add_dt","last_add_dt","add_lg","n_pos","n_add","n_prior_rug","lp_m1","score"]
print("\n== AUC fitur tunggal untuk rug3 (rug <=3 menit sesudah keputusan) ==")
for per,g in c.groupby("per"):
    print(per,"n=%d base=%.3f"%(len(g),g.rug3.mean()))
    for f in FE:
        try: print("   %-14s %.3f"%(f,roc_auc_score(g.rug3,g[f].fillna(-1))))
        except Exception as e: print("   %-14s -"%f)
