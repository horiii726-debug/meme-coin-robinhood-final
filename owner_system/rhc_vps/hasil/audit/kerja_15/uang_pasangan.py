# Berapa dolar yang diselamatkan / hilang, pada DAFTAR BELI YANG SAMA (posisi & ukuran base).
import json,os,pandas as pd,numpy as np
rng=np.random.default_rng(3)
PER=["ags1","ags4","ds5d","ds24","m1","m2"]
def load(v):
    r=[]
    for p in PER:
        f="out/%s_%s.jsonl"%(p,v)
        if not os.path.exists(f): continue
        for l in open(f,encoding="utf8"):
            l=l.strip()
            if not l: continue
            t=json.loads(l)
            if t["plan"]!="v4": continue
            r.append(t)
    return pd.DataFrame(r).set_index("pool")
pr=pd.read_csv("prug_rug3.csv").set_index("pool")
for TAG,FILE in [("maks 10 posisi","arena_base.json"),("maks 5 posisi (aturan pemilik)","arena_base_p5.json")]:
    A=json.load(open(FILE)); dump=pd.DataFrame(A["dump"]).set_index("pool")
    base=load("base")
    print("\n===== %s | base $%.2f, %d beli ====="%(TAG,A["hasil"]["eqAkhir"],A["hasil"]["beli"]))
    rows=[]
    for v in ["d900","d1200","d1800","d3000"]:
        d=load(v)
        j=dump.join(base[["ret"]],rsuffix="_b").join(d[["ret"]],rsuffix="_v").join(pr[["p_rug","lab"]])
        for tau in [0.0,0.10,0.15,0.20,0.25]:
            flag=(j.p_rug>=tau).fillna(False) if tau>0 else pd.Series(True,index=j.index)
            retv=np.where(flag,j.ret_v,j.ret)
            masuk=~(flag&j.ret_v.isna())
            pnl_b=(j.pos*(j.ret-1)).values
            pnl_v=np.where(masuk,j.pos.values*(np.nan_to_num(retv,nan=1.0)-1),0.0)
            d_=pnl_v-pnl_b
            bs=[np.sum(d_[rng.integers(0,len(d_),len(d_))]) for _ in range(2000)]
            rows.append(dict(tunda=v,tau=tau,ditandai=int(flag.sum()),tak_jadi=int((~masuk).sum()),
                pnl_base=round(pnl_b.sum(),0),pnl_var=round(pnl_v.sum(),0),selisih=round(d_.sum(),0),
                ci=("[%.0f,%.0f]"%tuple(np.percentile(bs,[2.5,97.5]))),
                dihemat_rug=round(d_[(j.ret<0.3).values].sum(),0),
                hilang_lain=round(d_[(j.ret>=0.3).values].sum(),0)))
    print(pd.DataFrame(rows).to_string(index=False))
