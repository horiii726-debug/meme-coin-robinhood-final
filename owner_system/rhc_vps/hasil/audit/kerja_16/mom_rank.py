# Model peringkat JALUR KEDUA: dari fitur menit-1 (34) + fitur saat pemicu (9), ramalkan
# apakah trade jalur kedua akan untung. KAUSAL: hanya belajar dari trade jalur kedua yang sudah TUTUP.
import numpy as np, pandas as pd, json, sys, os
from catboost import CatBoostClassifier
from sklearn.metrics import roc_auc_score
FE=json.load(open("C:/Users/horii/rhc-quant/rhc_vps/bot/filter_cat.json"))["feats"]
SC=sys.argv[1]; FEATS=sys.argv[2]; OUT=sys.argv[3]
MOMF=[c for c in ["f_dly","f_ns","f_nb","f_nsl","f_bu","f_su","f_lp","f_lpr","f_v0"]]
s=pd.read_csv(SC)
m=s[s.jalur=="mom"].copy()
base=pd.read_csv(FEATS).set_index("pool")
mm=pd.concat([pd.read_csv(f) for f in sorted(__import__("glob").glob(os.environ.get("MOMDIR","mom")+"/*.csv"))],ignore_index=True).set_index("pool")
m["bp"]=m.pool.str.slice(0,66)
X1=base.reindex(m.bp)[FE].values
X2=mm.reindex(m.bp)[MOMF].values
X=np.nan_to_num(np.hstack([X1,X2]),nan=-1,posinf=-1,neginf=-1)
y=(m.ret.values>1)
m=m.reset_index(drop=True)
o=np.argsort(m.decide.values); m=m.iloc[o].reset_index(drop=True); X=X[o]; y=y[o]
dec=m.decide.values; ex=m["exit"].values
n=len(m); sc=np.full(n,np.nan); model=None; at=0; nl=0
SHUF=os.environ.get("SHUF")=="1"
if SHUF:
    r=np.random.RandomState(int(os.environ.get("SEED","0"))); y=y.copy(); r.shuffle(y)
for i in range(n):
    siap=ex<dec[i]; ns=int(siap.sum())
    if ns>=60 and (model is None or ns-at>=100):
        idx=np.where(siap)[0]
        if y[idx].sum()>=10 and (~y[idx]).sum()>=10:
            model=CatBoostClassifier(iterations=200,learning_rate=0.05,depth=4,l2_leaf_reg=5.0,random_seed=0,
                                     verbose=0,allow_writing_files=False)
            model.fit(X[idx],y[idx]); at=ns; nl+=1
    if model is not None: sc[i]=model.predict_proba(X[i:i+1])[:,1][0]
m["rank"]=sc
ok=~np.isnan(sc)
for nm,sel in [("PILIH ds5d+ds24",m.ds.isin(["u_ds5d","u_ds24"]).values),("BUKTI m1+m2",m.ds.isin(["m1","m2"]).values),("AGUSTUS",m.ds.str.startswith("am_").values)]:
    t=ok&sel
    if t.sum()>50 and len(set(y[t]))>1:
        print(f"  {nm}: n {int(t.sum())} | AUC {roc_auc_score(y[t],sc[t]):.3f} | ret semua {m.ret.values[t].mean():.3f} | ret 50% teratas {m.ret.values[t][sc[t]>=np.median(sc[t])].mean():.3f} | ret 25% teratas {m.ret.values[t][sc[t]>=np.quantile(sc[t],0.75)].mean():.3f}")
print(f"  model dilatih {nl}x | berskor {int(ok.sum())}/{n}")
m[["pool","rank"]].rename(columns={"rank":"x"}).to_csv(OUT,index=False)
