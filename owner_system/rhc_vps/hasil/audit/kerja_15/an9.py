import pandas as pd, numpy as np
from sklearn.metrics import roc_auc_score
c=pd.read_csv("kand.csv"); tp=pd.read_csv("tickpos.csv")
c=c.merge(tp,on="pool",how="left")
c["dt"]=c.rug_blk-c.decide
c["rug3"]=((c.dt>0)&(c.dt<=1800)).astype(int)
c["rug30"]=((c.dt>0)&(c.dt<=18000)).astype(int)
c["per"]=np.where(c.ds.isin(["m1","m2"]),"BARU","LAMA")
c.to_csv("kand2.csv",index=False)
print("== pos_rng (posisi harga dlm rentang LP) x rug3, keluarga narrow ts=1 ==")
n=c[(c.ts==1)&(c.w_main==46055)]
b=pd.cut(n.pos_rng,[-9,0,.2,.4,.6,.7,.8,.85,.9,.95,1,9])
print(n.groupby([b,"per"],observed=True).agg(N=("pool","size"),rug3=("rug3","mean"),rug30=("rug30","mean"),ret=("ret","mean")).round(3).to_string())
print("\n== AUC pos_rng/d_hi/tick_v untuk rug3 ==")
for per,g in c.groupby("per"):
    for f in ["pos_rng","d_hi","d_lo","tick_move","tick_v","n_sw_m1"]:
        gg=g.dropna(subset=[f])
        print(per,f,round(roc_auc_score(gg.rug3,gg[f]),3),"n=%d"%len(gg))
print("\n== dalam keluarga ts1_narrow saja (AUC rug3) ==")
for per,g in n.groupby("per"):
    for f in ["pos_rng","d_hi","tick_v","n_sw_m1","lp_m1","score","add_lg"]:
        gg=g.dropna(subset=[f])
        try: print(per,f,round(roc_auc_score(gg.rug3,gg[f]),3),"n=%d base=%.3f"%(len(gg),gg.rug3.mean()))
        except Exception: pass
