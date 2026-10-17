import pandas as pd,numpy as np
from sklearn.metrics import roc_auc_score
rng=np.random.default_rng(5)
m=pd.read_csv("prug_multi.csv")
m["per"]=np.where(m.ds.isin(["m1","m2"]),"BARU","LAMA")
kand=set(pd.read_csv("scored_base.csv").pool)
lol=pd.read_csv("lolos.csv"); lolset=set(lol[lol.lolos].pool)
HOR=["rug1","rug3","rug5","rug10","rug30"]
def tabel(sub,nama):
    print("\n########", nama, "########")
    for h in HOR:
        p="p_"+h; y="y_"+h
        L=sub[(sub.per=="LAMA")].dropna(subset=[p]); B=sub[(sub.per=="BARU")].dropna(subset=[p])
        if len(L)<20 or len(B)<20 or L[y].sum()==0: print(h,"data kurang");continue
        # ambang DIPILIH di LAMA: ambang terkecil yang memberi presisi >= 0.5 di LAMA
        best=None
        for tau in np.arange(0.02,0.96,0.01):
            f=L[p]>=tau
            if f.sum()>=5 and L[y][f].mean()>=0.5: best=tau;break
        if best is None: best=np.quantile(L[p],0.99)
        out=[]
        for nm,g in [("PILIH(lama)",L),("BUKTI(m1+m2)",B)]:
            f=g[p]>=best
            tp=int((f&(g[y]==1)).sum()); pr=tp/max(f.sum(),1); rc=tp/max(int(g[y].sum()),1)
            try: auc=roc_auc_score(g[y],g[p])
            except Exception: auc=np.nan
            # CI bootstrap utk presisi
            idx=np.where(f)[0]
            if len(idx)>2:
                bs=[g[y].values[idx[rng.integers(0,len(idx),len(idx))]].mean() for _ in range(1000)]
                ci="[%.2f,%.2f]"%tuple(np.percentile(bs,[2.5,97.5]))
            else: ci="-"
            out.append("%s n=%d base=%.3f AUC=%.3f | tau=%.2f -> kena %d, presisi %.3f %s, recall %.3f"%(
                nm,len(g),g[y].mean(),auc,best,int(f.sum()),pr,ci,rc))
        print("  --",h);  [print("     ",o) for o in out]
tabel(m,"SEMUA POOL AMAN YANG TERLIHAT (9 periode)")
tabel(m[m.pool.isin(kand)],"KANDIDAT BOT (2.797 koin yang sampai blok keputusan)")
tabel(m[m.pool.isin(lolset)],"YANG LOLOS FILTER ML + HONEYPOT (178 koin = daftar beli)")
