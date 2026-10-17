import pandas as pd, numpy as np, glob
from sklearn.metrics import roc_auc_score
df=pd.concat([pd.read_csv(f) for f in sorted(glob.glob("lp_*.csv"))],ignore_index=True)
ar=pd.read_csv("../../../data/arena_scored.csv")
ar["pool"]=ar.pool.str.lower()
m=ar.merge(df.drop(columns=["ds","init"]),on="pool",how="left")
print("arena rows",len(ar),"| ketemu fitur LP",m.n_add.notna().sum())
print(m.groupby("ds").agg(n=("pool","size"),ada=("n_add","count"),rug30=("rug30","mean"),ret=("ret","mean")).round(3))
m.to_csv("arena_lp.csv",index=False)
FE=["fee","ts","hook","n_add","n_rem","n_pos","rem_frac_d","add_lg","max_add_share","stage_span",
    "first_add_dt","last_add_dt","w_main","full_range","sym_off","lo_main","hi_main","n_widths","narrow",
    "add_per_pos_lg","pre_rem","big_first"]
OLD=["ags1","ags4","u_ds5d","u_ds24"]; NEW=["m1","m2"]
mm=m[m.n_add.notna()]
o=mm[mm.ds.isin(OLD)]; n=mm[mm.ds.isin(NEW)]
print("\n=== universe KANDIDAT BOT (arena) ===")
print("LAMA n=%d rug30=%.1f%% | BARU n=%d rug30=%.1f%%"%(len(o),100*o.rug30.mean(),len(n),100*n.rug30.mean()))
rows=[]
for f in FE:
    try: a=roc_auc_score(o.rug30,o[f].fillna(-1)); b=roc_auc_score(n.rug30,n[f].fillna(-1))
    except Exception: a=b=np.nan
    rows.append((f,a,b))
rows.sort(key=lambda r:-abs((r[1] if r[1]==r[1] else .5)-.5))
for f,a,b in rows: print(f"{f:16s} AUC lama {a:.3f}  baru {b:.3f}")
# juga: korelasi rug30 dengan ret
print("\nret rata-rata: rug30=1 %.3f (n=%d) | rug30=0 %.3f (n=%d)"%(
  mm[mm.rug30==1].ret.mean(),(mm.rug30==1).sum(),mm[mm.rug30==0].ret.mean(),(mm.rug30==0).sum()))
