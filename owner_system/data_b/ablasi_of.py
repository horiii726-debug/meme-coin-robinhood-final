# Ablation per kelompok fitur referensi (bagian 17.7). Skor kausal sama dgn arena_score.py.
# Metrik dari seleksi bergulir top-10% (ambang = kuantil 0,90 dari 100 skor terakhir, seperti arena).
import numpy as np, pandas as pd, json, os, sys
from catboost import CatBoostClassifier
from sklearn.metrics import roc_auc_score
FE=json.load(open("C:/Users/horii/rhc-quant/live/filter_cat.json"))["feats"]
G={"g1_trader":["of_buyers_w0","of_buyers_w1","of_buyers_w2","of_new_buyers_w2","of_buyer_growth","of_buyer_accel","of_sellers_w2","of_seller_growth"],
   "g2_flow":["of_bs_ratio","of_ofi","of_ofi_w2","of_ofi_trend"],
   "g3_cvd":["of_cvd_slope","of_cvd_accel","of_cvd_end_lp","of_cvd_indep"],
   "g4_size":["of_bsz_mean","of_bsz_med","of_bsz_p90","of_bsz_skew","of_bsz_kurt","of_bsz_gini","of_bsz_entropy","of_ssz_med","of_ssz_p90","of_big_sell_share",
              "of_bsz_p25","of_bsz_p75","of_bsz_p99","of_bsz_cv","of_ssz_mean","of_ssz_skew","of_ssz_gini","of_sell_buy_med"],
   "g5_intens":["of_tps","of_btps","of_stps","of_iat_cv","of_burst","of_tx_accel"],
   "g6_liq":["of_liq_change","of_liq_min_ratio"],
   "g8_organik":["of_swaps_per_buyer","of_top_buyer_share","of_repeat_buyer_share","of_organic_ratio","of_clu_buy_share","of_rt_share","of_indep_ratio","of_indep_buyers"],
   "g9_vol":["of_rv","of_ewma_vol","of_updown_vol","of_mdd_m1","of_ret_w2"],
   "g10_cusum":["of_cusum_neg_last","of_cusum_neg_max"]}
fl=pd.read_csv("flow_feats.csv").drop_duplicates(["ds","pool"])
df=pd.read_csv("arena_feats.csv").merge(fl,on=["ds","pool"],how="left").sort_values("decide").reset_index(drop=True)
y=df.win.values.astype(bool); ret=df.ret.values; decide=df.decide.values; exitb=df["exit"].values; n=len(df)
def skor(cols,seed):
    X=df[cols].fillna(-1).values; s=np.full(n,np.nan); m=None; at=0
    for i in range(n):
        siap=exitb<decide[i]; ns=int(siap.sum())
        if ns>=60 and (m is None or ns-at>=100):
            idx=np.where(siap)[0]
            m=CatBoostClassifier(iterations=200,learning_rate=0.05,depth=4,l2_leaf_reg=5.0,random_seed=seed,verbose=0,allow_writing_files=False,thread_count=4)
            m.fit(X[idx],y[idx]); at=ns
        if m is not None: s[i]=m.predict_proba(X[i:i+1])[:,1][0]
    return s
def metrik(s):
    ok=~np.isnan(s); rec=[]; sel=[]
    for i in np.where(ok)[0]:
        rec.append(s[i]); rec=rec[-100:]
        thr=np.quantile(rec,0.9) if len(rec)>=30 else 0.195
        if s[i]>=thr: sel.append(i)
    sel=np.array(sel); r=ret[sel]
    return dict(auc=roc_auc_score(y[ok],s[ok]), n=len(sel), win=(r>1).mean(), avg=r.mean(), rug=(r<0.3).mean(), lg=np.log(np.maximum(r,0.01)).mean())
konfig={"base":FE, **{k:FE+v for k,v in G.items()}, "all":FE+sum(G.values(),[])}
pilih=sys.argv[1:] or list(konfig)
for k in pilih:
    M=[metrik(skor(konfig[k],sd)) for sd in (0,1,2)]
    a={m:np.mean([x[m] for x in M]) for m in M[0]}
    print(f"{k:11s} AUC {a['auc']:.3f} | n {a['n']:.0f} | win {a['win']*100:.1f}% | avg ret {a['avg']:.3f} | rug {a['rug']*100:.1f}% | log-growth {a['lg']:+.4f}",flush=True)
