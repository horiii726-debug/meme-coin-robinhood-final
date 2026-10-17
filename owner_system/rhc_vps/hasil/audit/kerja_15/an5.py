import pandas as pd, numpy as np
from sklearn.metrics import roc_auc_score
m=pd.read_csv("arena_lp.csv")
NEW=["m1","m2"]; m["per"]=np.where(m.ds.isin(NEW),"BARU","LAMA")
s=m[m.ts==1]
print("ts==1 kandidat: LAMA %d (rug30 %.1f%%) | BARU %d (rug30 %.1f%%)"%(
 (s.per=="LAMA").sum(),100*s[s.per=="LAMA"].rug30.mean(),(s.per=="BARU").sum(),100*s[s.per=="BARU"].rug30.mean()))
FE=["n_add","n_rem","n_pos","rem_frac_d","add_lg","max_add_share","stage_span","first_add_dt","last_add_dt",
    "w_main","full_range","sym_off","lo_main","hi_main","n_widths","narrow","add_per_pos_lg","pre_rem","big_first"]
print("\n-- AUC dalam stratum ts==1 (label rug30) --")
for f in FE:
    try:
        a=roc_auc_score(s[s.per=="LAMA"].rug30,s[s.per=="LAMA"][f].fillna(-1))
        b=roc_auc_score(s[s.per=="BARU"].rug30,s[s.per=="BARU"][f].fillna(-1))
        if s[f].nunique()>1: print(f"{f:16s} lama {a:.3f}  baru {b:.3f}")
    except Exception as e: pass
print("\nsebaran w_main dalam ts==1:"); print(s.w_main.value_counts().head(10))
print("\nsebaran lo_main/hi_main dalam ts==1 (10 teratas):")
print((s.lo_main.astype(str)+".."+s.hi_main.astype(str)).value_counts().head(10))
print("\nsebaran first_add_dt dalam ts==1:"); print(s.first_add_dt.value_counts().head(10))
print("\nfee dalam ts==1:"); print(s.fee_y.value_counts())
print("\nhook dalam ts==1:"); print(s.hook_y.value_counts())
