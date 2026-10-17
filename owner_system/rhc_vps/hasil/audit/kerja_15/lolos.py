import pandas as pd,numpy as np,json
from sklearn.metrics import roc_auc_score
d=pd.read_csv("scored_base.csv").sort_values("decide").reset_index(drop=True)
pr=pd.read_csv("prug_rug3.csv")[["pool","p_rug","lab"]]
d=d.merge(pr,on="pool",how="left")
lp=pd.read_csv("kand2.csv")[["pool","ts","w_main","narrow","full_range","sym_off","lo_main","hi_main","first_add_dt","add_lg","pos_rng","d_hi","tick_v","rug_blk"]]
d=d.merge(lp,on="pool",how="left")
rec=[];lol=[]
for r in d.itertuples():
    if not np.isfinite(r.score): lol.append(False);continue
    rec.append(r.score)
    if len(rec)>100: rec.pop(0)
    thr=0.195 if len(rec)<30 else sorted(rec)[min(len(rec)-1,int(0.90*len(rec)))]
    lol.append(r.score>=thr and r.jual_m1>0)
d["lolos"]=lol
d["per"]=np.where(d.ds.isin(["m1","m2"]),"BARU","LAMA")
L=d[d.lolos]
print("lolos filter ML+honeypot:",len(L),"| per periode:");print(L.groupby(["per","ds"]).agg(n=("pool","size"),rug3=("lab","mean"),ret=("ret","mean")).round(3).to_string())
print("\n== AUC utk rug3 DI DALAM himpunan yang lolos filter ==")
for per,g in L.groupby("per"):
    g=g.dropna(subset=["lab"])
    line=[]
    for f in ["p_rug","ts","w_main","narrow","sym_off","first_add_dt","add_lg","pos_rng","d_hi","tick_v","lp_m1","score","n_swap","n_holders"]:
        gg=g.dropna(subset=[f])
        try: line.append("%s %.2f"%(f,roc_auc_score(gg.lab,gg[f])))
        except Exception: line.append(f+" -")
    print(per,"n=%d base_rug3=%.3f"%(len(g),g.lab.mean()))
    print("   "," | ".join(line))
print("\n== uang: ret rata2 di himpunan lolos, dibagi rug3 ==")
print(L.groupby(["per","lab"]).agg(n=("pool","size"),ret=("ret","mean"),med=("ret","median")).round(3).to_string())
L.to_csv("lolos.csv",index=False)
