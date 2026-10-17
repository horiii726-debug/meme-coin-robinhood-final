import pandas as pd, numpy as np, json
from sklearn.ensemble import HistGradientBoostingClassifier
from sklearn.metrics import roc_auc_score
rng=np.random.default_rng(0)
c=pd.read_csv("kand2.csv")
OLDA=["ags1","ags4","u_ds5d","u_ds24"]
c["per"]=np.where(c.ds.isin(["m1","m2"]),"BARU","LAMA")
LAMA34=["fee","hook","n_swap","n_buy","n_sell","buy_usd","sell_usd","lp_m1","ret_m1","flow_lp","n_holders","top1","top5","hhi","entropy","gini","l2_l1","pool_share","n_buyers","n_sellers","g_nodes","g_edges","g_density","g_lambda1","g_deg_central","g_p2p_frac","kyle_lambda","impact_r2","impact_cos","impact_norm","lam_buy","lam_sell","lw_mom","lw_mom_log"]
LAMA34=[f for f in LAMA34 if f in c.columns]
BARU_LP=["ts","fee_y","hook_y","w_main","narrow","full_range","sym_off","lo_main","hi_main","first_add_dt","last_add_dt","add_lg","n_pos","n_add","n_rem","max_add_share","stage_span","n_widths","n_prior","n_prior_rug","dev_baru","prior_rug_rate"]
BARU_LP=[f for f in BARU_LP if f in c.columns]
TICK=["pos_rng","d_hi","d_lo","tick_move","tick_v"]
def boot_auc(y,p,B=1000):
    y=np.asarray(y);p=np.asarray(p);n=len(y);out=[]
    for _ in range(B):
        i=rng.integers(0,n,n)
        if len(set(y[i]))<2: continue
        out.append(roc_auc_score(y[i],p[i]))
    return np.percentile(out,[2.5,97.5])
def prec_at(y,p,k):
    idx=np.argsort(-p)[:k]; return float(np.mean(np.asarray(y)[idx]))
tr=c[c.ds.isin(OLDA)]; te=c[c.per=="BARU"]
res=[]
for nm,FE in [("34 fitur lama",LAMA34),("struktur LP baru",BARU_LP),("LP + tick",BARU_LP+TICK),("lama + LP + tick",LAMA34+BARU_LP+TICK)]:
    for lab in ["rug3","rug30"]:
        X=tr[FE].apply(pd.to_numeric,errors="coerce").values; y=tr[lab].values
        m=HistGradientBoostingClassifier(max_depth=3,max_iter=200,learning_rate=0.06,l2_regularization=1.0,random_state=0).fit(X,y)
        p=m.predict_proba(te[FE].apply(pd.to_numeric,errors="coerce").values)[:,1]
        a=roc_auc_score(te[lab],p); lo,hi=boot_auc(te[lab],p)
        # kontrol label diacak
        ys=rng.permutation(y)
        ms=HistGradientBoostingClassifier(max_depth=3,max_iter=200,learning_rate=0.06,l2_regularization=1.0,random_state=0).fit(X,ys)
        ps=ms.predict_proba(te[FE].apply(pd.to_numeric,errors="coerce").values)[:,1]
        asf=roc_auc_score(te[lab],ps)
        res.append(dict(fitur=nm,label=lab,auc=round(a,3),ci=f"[{lo:.3f},{hi:.3f}]",auc_acak=round(asf,3),
            base=round(te[lab].mean(),3),p_top5=round(prec_at(te[lab],p,int(.05*len(te))),3),
            p_top10=round(prec_at(te[lab],p,int(.10*len(te))),3),p_top20=round(prec_at(te[lab],p,int(.20*len(te))),3)))
        if nm=="LP + tick": te2=te.copy(); te2["p_"+lab]=p; te2.to_csv(f"pred_{lab}.csv",index=False)
print(pd.DataFrame(res).to_string(index=False))
