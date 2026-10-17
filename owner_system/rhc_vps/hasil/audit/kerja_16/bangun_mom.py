# Bangun baris arena untuk JALUR KEDUA momentum (masuk sesudah koin naik TRIG kali).
import pandas as pd, numpy as np, glob, sys, os
TRIG=sys.argv[1] if len(sys.argv)>1 else "1.5"
SC=sys.argv[2] if len(sys.argv)>2 else "C:/Users/horii/rhc-quant/rhc_vps/hasil/audit/kerja_07/g11/arena_scored.csv"
OUT=sys.argv[3] if len(sys.argv)>3 else "base/scored_mom.csv"
MOMDIR=sys.argv[4] if len(sys.argv)>4 else "mom"
s=pd.read_csv(SC)
m=pd.concat([pd.read_csv(f) for f in sorted(glob.glob(MOMDIR+"/*.csv"))],ignore_index=True)
m=m[m[f"t{TRIG}_hit"]==1].copy()
base=s.set_index("pool")
m=m[m.pool.isin(base.index)].copy()
b=base.loc[m.pool]
GAS=0.21
v=m[f"t{TRIG}_exit"].fillna(m[f"t{TRIG}_last"]).values
sz=np.maximum(m["size"].values,1.0)
r=pd.DataFrame({
 "ds":m.ds.values,"pool":(m.pool+"M").values,"init":b.init.values,
 "decide":m[f"t{TRIG}_entblk"].values,        # keputusan = saat pemicu terisi (kausal)
 "entry":m[f"t{TRIG}_entblk"].values,
 "exit":np.maximum(m[f"t{TRIG}_exblk"].values,m[f"t{TRIG}_entblk"].values+1),
 "ret":v-GAS/sz,"win":(v>1).astype(int),
 "jual_m1":b.jual_m1.values,"dev":b.dev.values,
 "lp_m1":m[f"t{TRIG}_lp"].values,            # likuiditas SAAT masuk jalur kedua
 "score":b.score.values,"gasfix":GAS,"sizefix":sz,"jalur":"mom"})
allc=pd.concat([s.assign(gasfix="",sizefix="",jalur=""),r],ignore_index=True,sort=False)
allc.to_csv(OUT,index=False)
r[["pool"]].assign(x=1).to_csv(os.path.join(os.path.dirname(OUT) or ".","xmom.csv"),index=False)
print(f"pemicu {TRIG}x: {len(r)} baris jalur kedua | total {len(allc)} | ret rata2 {r.ret.mean():.3f} | win {100*(r.ret>1).mean():.0f}%")
