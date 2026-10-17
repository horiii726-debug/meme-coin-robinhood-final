import pandas as pd, numpy as np, glob, os
from sklearn.metrics import roc_auc_score
fs=sorted(glob.glob("lp_*.csv"))
df=pd.concat([pd.read_csv(f) for f in fs],ignore_index=True)
print("total baris",len(df))
print(df.groupby("ds").agg(n=("pool","size"),rug30=("rug30","mean"),rug10=("rug10","mean"),rugany=("rug_any","mean")).round(3))
OLD=["ags1","ags4","am_ags07","am_ags13","am_ags24","u_ds5d","u_ds24"]
NEW=["m1","m2"]
FE=["fee","ts","hook","n_add","n_rem","n_pos","rem_frac_d","add_lg","max_add_share","stage_span",
    "first_add_dt","last_add_dt","w_main","full_range","sym_off","lo_main","hi_main","n_widths","narrow",
    "add_per_pos_lg","pre_rem","big_first"]
o=df[df.ds.isin(OLD)]; n=df[df.ds.isin(NEW)]
print("\nAUC per fitur tunggal (label rug30). LAMA n=%d (%.1f%% rug) | BARU n=%d (%.1f%% rug)"%(len(o),100*o.rug30.mean(),len(n),100*n.rug30.mean()))
rows=[]
for f in FE:
    try:
        a=roc_auc_score(o.rug30,o[f].fillna(-1)); b=roc_auc_score(n.rug30,n[f].fillna(-1))
    except Exception as e:
        a=b=np.nan
    rows.append((f,a,b,o[f].nunique()))
rows.sort(key=lambda r:-abs((r[1] or .5)-.5))
for f,a,b,u in rows: print(f"{f:16s} AUC lama {a:.3f}  baru {b:.3f}  nilai unik {u}")
