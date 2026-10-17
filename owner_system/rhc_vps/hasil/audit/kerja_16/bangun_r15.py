# Baris arena dari replay MESIN NYATA jalur kedua (riseTrig 1,5x) — exit lengkap v4engine.
import pandas as pd, numpy as np, json, glob, os, sys
R=sys.argv[1] if len(sys.argv)>1 else "r15"
NAT="0x0000000000000000000000000000000000000000"
rows=[]
jual_cache={}
for dd in sorted(glob.glob(R+"/*/trades.jsonl")):
    ds=dd.replace("\\","/").split("/")[-2]
    base = f"dat/{ds}" if ds.startswith("am_") else f"C:/Users/horii/rhc-quant/rhc_vps/data/{ds}"
    sw=json.load(open(base+"/swaps_m1.json"))
    pl={l.split(",")[0].lower():l.split(",") for l in open(base+"/pools.csv").read().strip().split("\n")[1:]}
    ju={}
    for pool,arr in sw.items():
        p=pl.get(pool)
        if not p: continue
        q1=p[2].lower()==NAT
        ju[pool]=sum(1 for x in arr if float(x[2] if q1 else x[3])<0)
    for l in open(dd):
        t=json.loads(l)
        if t["plan"]!="v4": continue
        rows.append({"ds":ds,"pool":t["pool"],"init":t["init"],"decide":t["entryBlk"]-30,"entry":t["entryBlk"],
          "exit":max(t["exitBlk"],t["entryBlk"]+1),"ret":t["ret"],"win":1 if t["ret"]>1 else 0,
          "jual_m1":ju.get(t["pool"],0),"dev":"","lp_m1":t["size"]*100,"score":1.0,
          "gasfix":t["gasTot"],"sizefix":t["size"],"jalur":"mom"})
d=pd.DataFrame(rows).sort_values("decide")
# lp saat masuk dari simulasi momentum (lebih tepat dari size*100 saat size mentok $200)
mom=pd.concat([pd.read_csv(f) for f in sorted(glob.glob("mom/*.csv"))],ignore_index=True).set_index("pool")
lp=d.pool.map(mom["t1.5_lp"])
d["lp_m1"]=np.where(lp.notna()&(lp>d.lp_m1),lp,d.lp_m1)
d.to_csv("base/scored_r15.csv",index=False)
print(f"{len(d)} trade mesin nyata jalur kedua | {d.ds.nunique()} periode | ret rata2 {d.ret.mean():.3f} | win {100*(d.ret>1).mean():.0f}%")
print(d.groupby("ds").agg(n=("ret","size"),ret=("ret","mean"),win=("win","mean")).round(3).to_string())
