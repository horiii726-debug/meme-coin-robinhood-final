# UJI ACAK (dipakai semua agent): semua periode dicampur.
#  1) Leave-one-period-out: filter ML dilatih dari SEMUA periode lain, diuji di periode yang ditahan; akun $100 per periode.
#  2) Urutan acak: data dipotong per 6 jam, urutan potongan diacak N kali, akun $100 jalan di tiap urutan.
# Label (ret) dari replay varian VAR (model keluar tidak pernah melihat periode yang dinilai).
# Pakai: VAR=par [N=200] [ARENA=arena.js] [ARENA_ENV="X=1"] [SCORED_ALL=file_skor_sendiri.csv] [FEATS_EXTRA=of_a,of_b] python uji_acak.py
import os, json, subprocess, re, numpy as np, pandas as pd
from catboost import CatBoostClassifier
VAR=os.environ["VAR"]; N=int(os.environ.get("N","200")); ARENA=os.environ.get("ARENA","arena.js"); AENV=os.environ.get("ARENA_ENV","")
STD="MAXPOS=10 QTHR=0.90 SLIP=1 EXPMAX=0.5 REM=1 LPCAP=0.01"
FE=json.load(open("C:/Users/horii/rhc-quant/live/filter_cat.json"))["feats"]
EXTRA=[c for c in os.environ.get("FEATS_EXTRA","").split(",") if c]
PER={"ags1":"Ags","ags4":"Ags","u_ds5d":"5Sep","u_ds24":"10Sep","m1":"13-15Sep","m2":"16-17Sep","okt1":"1-2Okt"}
tmp=f"acak_{VAR}"; os.makedirs(tmp,exist_ok=True)
if os.environ.get("SCORED_ALL"):
    D=pd.read_csv(os.environ["SCORED_ALL"])
else:
    a=pd.read_csv(f"arena_feats_{VAR}.csv"); o=pd.read_csv(f"arena_scored_okt_{VAR}.csv")
    D=pd.concat([a,o[a.columns]],ignore_index=True)
    if EXTRA: D=D.merge(pd.read_csv("flow_feats.csv").drop_duplicates(["ds","pool"])[["ds","pool"]+EXTRA],on=["ds","pool"],how="left")
    D["per"]=D.ds.map(PER); D["score"]=np.nan; D["thr0"]=np.nan
    X=D[FE+EXTRA].fillna(-1).values; y=(D.ret>1).values
    for p in D.per.unique():
        te=(D.per==p).values; ps=[]; pin=[]
        for sd in (0,1,2):
            m=CatBoostClassifier(iterations=200,learning_rate=0.05,depth=4,l2_leaf_reg=5.0,random_seed=sd,verbose=0,allow_writing_files=False,thread_count=2).fit(X[~te],y[~te])
            ps.append(m.predict_proba(X[te])[:,1]); pin.append(m.predict_proba(X[~te])[:,1])
        D.loc[te,"score"]=np.mean(ps,0); D.loc[te,"thr0"]=np.quantile(np.mean(pin,0),0.90)
    D.drop(columns=FE+EXTRA if False else []).to_csv(f"{tmp}/lopo.csv",index=False)
if "per" not in D: D["per"]=D.ds.map(PER)
def arena(scored,extra=""):
    r=subprocess.run(f"env {STD} {AENV} {extra} TRF=trades_{VAR}.jsonl SCORED={scored} node {ARENA}",shell=True,capture_output=True,text=True).stdout
    m=re.search(r"akun \$([\d.]+) -> \$([\d.]+).*DD maks ([\d.]+)%",r); b=re.search(r"beli (\d+)",r); w=re.search(r"win ([\d.]+)%",r)
    return (float(m.group(2)),float(m.group(3)),int(b.group(1)),float(w.group(1)) if w else float("nan")) if m else (float("nan"),)*4
print(f"=== UJI ACAK varian {VAR}  ARENA_ENV=[{AENV}]")
print("1) tiap periode diuji dgn model dari periode LAIN, akun $100 mulai dari nol:")
for p in ["Ags","5Sep","10Sep","13-15Sep","16-17Sep","1-2Okt"]:
    g=D[D.per==p].copy(); f=f"{tmp}/p_{p}.csv"; g.to_csv(f,index=False)
    dev=f"{tmp}/dev_{p}.csv"; D[D.per!=p].to_csv(dev,index=False)
    eq,dd,nb,wr=arena(f,f"THR0={g.thr0.iloc[0] if 'thr0' in g and g.thr0.notna().any() else 0.5} DEVPRE={dev}")
    print(f"   {p:9s}: {len(g):4d} koin | beli {nb:3d} | win {wr:.0f}% | $100 -> ${eq:,.2f} | DD {dd:.1f}%")
CH=216000; rng=np.random.default_rng(int(os.environ.get("RSEED","7")))
D["ck"]=D.ds+"_"+((D.decide-D.groupby("ds").decide.transform("min"))//CH).astype(int).astype(str)
cks=D.ck.unique(); start={c:D[D.ck==c].decide.min() for c in cks}
res=[]
for k in range(N):
    perm=rng.permutation(cks); off={}; t=10**9
    for c in perm: off[c]=t-start[c]; t+=CH+400000   # jeda antar potongan > 9 jam: posisi tutup sebelum potongan berikut
    G=D.copy(); o=G.ck.map(off)
    for c in ["init","decide","entry","exit"]: G[c]=G[c]+o
    f=f"{tmp}/acak.csv"; G.drop(columns=["ck"]).to_csv(f,index=False)
    th=float(np.nanmedian(D.thr0)) if "thr0" in D else 0.5
    res.append(arena(f,f"THR0={th}"))
R=np.array(res); eq=R[:,0]; dd=R[:,1]
print(f"2) {N} urutan acak (potongan 6 jam, {len(cks)} potongan, semua periode), akun $100 [PROYEKSI - urutan diacak]:")
print(f"   akhir: median ${np.median(eq):,.0f} | terburuk 5% ${np.percentile(eq,5):,.0f} | terbaik 5% ${np.percentile(eq,95):,.0f} | jalur rugi (<$100) {np.mean(eq<100)*100:.1f}%")
print(f"   drawdown: median {np.median(dd):.1f}% | terburuk 5% {np.percentile(dd,95):.1f}% | maks {dd.max():.1f}% | trade median {np.median(R[:,2]):.0f}")
