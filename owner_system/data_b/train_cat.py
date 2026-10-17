import numpy as np, pandas as pd
from catboost import CatBoostClassifier
from sklearn.ensemble import HistGradientBoostingClassifier
from sklearn.metrics import roc_auc_score
FE=["fee","hook","n_swap","n_buy","n_sell","buy_usd","sell_usd","lp_m1","ret_m1","flow_lp","n_holders","top1","top5","hhi","entropy","gini","l2_l1","pool_share","n_buyers","n_sellers","g_nodes","g_edges","g_density","g_lambda1","g_deg_central","g_p2p_frac","kyle_lambda","impact_r2","impact_cos","impact_norm","lam_buy","lam_sell","lw_mom","lw_mom_log"]
df=pd.read_csv("features_b.csv").sort_values("init").reset_index(drop=True)
X=df[FE].fillna(-1).values; y=df.win.values.astype(bool); ret=df.ret.values
def pf(r):
    g=r[r>1]-1; l=1-r[r<=1]
    return g.sum()/max(l.sum(),1e-9)
def wf(make,name,q=0.30):
    n=len(df); folds=[]; oof=np.full(n,np.nan)
    # 5 lipatan maju: latih pada semua sebelum, uji pada potongan berikut
    cuts=np.linspace(0.4,1.0,6)
    for i in range(5):
        a=int(cuts[i]*n); b=int(cuts[i+1]*n)
        if a<50 or b-a<20: continue
        m=make(); m.fit(X[:a],y[:a])
        p=m.predict_proba(X[a:b])[:,1]; oof[a:b]=p
        thr=np.quantile(p,q)                      # ambang kuantil pada kelompok uji (seperti live: ambang bergerak)
        sel=p>=thr
        folds.append((roc_auc_score(y[a:b],p) if len(set(y[a:b]))>1 else np.nan, pf(ret[a:b][sel]), sel.sum(), pf(ret[a:b])))
    auc=np.nanmean([f[0] for f in folds])
    mask=~np.isnan(oof)
    print(f"{name}: AUC rata2 {auc:.3f} | per lipatan PF saring->{[round(f[1],2) for f in folds]} vs polos {[round(f[3],2) for f in folds]} | n={[f[2] for f in folds]}")
    return oof,mask
cat=lambda: CatBoostClassifier(iterations=200,learning_rate=0.05,depth=4,l2_leaf_reg=5.0,random_seed=0,verbose=0,allow_writing_files=False)
hgb=lambda: HistGradientBoostingClassifier(max_iter=150,max_depth=4,learning_rate=0.05,l2_regularization=1.0,random_state=0)
oc,mc=wf(cat,"CatBoost"); oh,mh=wf(hgb,"HistGB")
for nm,o,m in [("CatBoost",oc,mc),("HistGB",oh,mh)]:
    r=ret[m]; p=o[m]; thr=np.quantile(p,0.30); sel=p>=thr
    print(f"  {nm} gabungan: n {m.sum()} -> ambil {sel.sum()} | PF {pf(r[sel]):.2f} (polos {pf(r):.2f}) | win {100*(r[sel]>1).mean():.1f}% (polos {100*(r>1).mean():.1f}%) | AUC {roc_auc_score(y[m],p):.3f}")
