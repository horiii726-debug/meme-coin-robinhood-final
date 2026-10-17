import pandas as pd, numpy as np, json
from sklearn.metrics import roc_auc_score
lp=pd.concat([pd.read_csv(f"lp_{d}.csv") for d in ["ags1","ags4","u_ds5d","u_ds24","m1","m2"]],ignore_index=True)
cr=json.load(open("../../../data/m1/dev_creator.json"))
lp["dev"]=lp.pool.map(lambda p: (cr.get(p) or {}).get("dev") or "")
lp["decide"]=lp.init+600
lp=lp.sort_values("init").reset_index(drop=True)
lp["rug_blk_f"]=lp.rug_blk.fillna(np.inf)
print("pool dgn dev:",(lp.dev!="").sum(),"/",len(lp))
# fitur kausal dev: pool sebelumnya dari dev yang sama, yang status rug-nya SUDAH ketahuan sebelum decide
hist={}
n_prior=[];n_prior_rug=[];dev_baru=[];prior_rug_rate=[]
for r in lp.itertuples():
    h=hist.get(r.dev,[]) if r.dev else []
    prev=[x for x in h if x[0]<r.init]
    resolved=[x for x in prev if x[1]<=r.decide]     # rug sudah terjadi sblm keputusan
    seen=[x for x in prev if x[0]+600+18000<=r.decide]  # sudah lewat jendela 30 mnt -> status pasti
    nr=len(resolved)
    n_prior.append(len(prev)); n_prior_rug.append(nr)
    dev_baru.append(1 if (r.dev=="" or len(prev)==0) else 0)
    prior_rug_rate.append(nr/len(seen) if len(seen)>0 else -1)
    if r.dev: hist.setdefault(r.dev,[]).append((r.init,r.rug_blk_f))
lp["n_prior"]=n_prior; lp["n_prior_rug"]=n_prior_rug; lp["dev_baru"]=dev_baru; lp["prior_rug_rate"]=prior_rug_rate
lp.to_csv("lp_dev.csv",index=False)
ar=set(pd.read_csv("../../../data/arena_scored.csv").pool.str.lower())
c=lp[lp.pool.isin(ar)].copy()
c["per"]=np.where(c.ds.isin(["m1","m2"]),"BARU","LAMA")
print("\nkandidat bot:",len(c))
print(c.groupby("per").agg(n=("pool","size"),pakai_dev=("dev",lambda s:(s!="").mean()),
   ada_prior=("n_prior",lambda s:(s>0).mean()),ada_prior_rug=("n_prior_rug",lambda s:(s>0).mean())).round(3))
print("\n== aturan: tolak kalau dev punya pool sebelumnya yg SUDAH rug (semua koin terlihat) ==")
for per,g in c.groupby("per"):
    f=g.n_prior_rug>0
    print(f"{per}: kena {f.sum()}/{len(g)} | presisi rug30 {g[f].rug30.mean() if f.sum() else float('nan'):.3f} "
          f"(dasar {g.rug30.mean():.3f}) | recall {g[f].rug30.sum()/max(g.rug30.sum(),1):.3f} | ret rata2 kena {g[f].ret.mean() if f.sum() else float('nan'):.3f} vs sisa {g[~f].ret.mean():.3f}")
print("\n== AUC n_prior_rug & prior_rug_rate ==")
for per,g in c.groupby("per"):
    print(per,"n_prior_rug",round(roc_auc_score(g.rug30,g.n_prior_rug),3),
          "| prior_rug_rate",round(roc_auc_score(g.rug30,g.prior_rug_rate),3),
          "| dev_baru",round(roc_auc_score(g.rug30,g.dev_baru),3))
