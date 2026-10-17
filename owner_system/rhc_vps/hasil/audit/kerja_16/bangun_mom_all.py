# Baris arena untuk JALUR KEDUA saja, SEMUA 9 periode (tidak butuh transfers).
# honeypot: dari swaps_m1.json (ada penjualan berhasil di menit-1?) — sama dengan arena.
import pandas as pd, numpy as np, glob, json, os, sys
TRIG=os.environ.get("TRIG","1.5")
d=pd.concat([pd.read_csv(f) for f in sorted(glob.glob("mom/*.csv"))],ignore_index=True)
d=d[d[f"t{TRIG}_hit"]==1].copy()
# honeypot kausal
NAT="0x0000000000000000000000000000000000000000"
jual={}
for ds in d.ds.unique():
    base = f"dat/{ds}" if ds.startswith("am_") else f"C:/Users/horii/rhc-quant/rhc_vps/data/{ds}"
    sw=json.load(open(base+"/swaps_m1.json"))
    pl={l.split(",")[0].lower():l.split(",") for l in open(base+"/pools.csv").read().strip().split("\n")[1:]}
    for pool,arr in sw.items():
        p=pl.get(pool)
        if not p: continue
        q1 = p[2].lower()==NAT
        jual[pool]=sum(1 for x in arr if float(x[2] if q1 else x[3])<0)
d["jual_m1"]=d.pool.map(jual).fillna(0).astype(int)
r=pd.read_csv("rank2_all.csv").set_index("pool")["rank"]
out=pd.DataFrame({"ds":d.ds.values,"pool":d.pool.values,"init":d[f"t{TRIG}_entblk"].values,
 "decide":d[f"t{TRIG}_entblk"].values,"entry":d[f"t{TRIG}_entblk"].values,
 "exit":np.maximum(d[f"t{TRIG}_exblk"].values,d[f"t{TRIG}_entblk"].values+1),
 "ret":(d[f"t{TRIG}_exit"].fillna(d[f"t{TRIG}_last"])-0.21/np.maximum(d["size"],1)).values,
 "win":(d[f"t{TRIG}_exit"].fillna(d[f"t{TRIG}_last"])>1).astype(int).values,
 "jual_m1":d.jual_m1.values,"dev":"","lp_m1":d[f"t{TRIG}_lp"].values,
 "score":1.0,"gasfix":0.21,"sizefix":np.maximum(d["size"].values,1),"jalur":"mom"})
out=out.sort_values("decide")
out.to_csv("base/scored_all.csv",index=False)
pd.DataFrame({"pool":d.pool.values,"x":d.pool.map(r).values}).to_csv("base/xrank2.csv",index=False)
print(f"{len(out)} baris jalur kedua, {out.ds.nunique()} periode | ret rata2 {out.ret.mean():.3f} | honeypot(jual=0) {int((out.jual_m1==0).sum())}")
