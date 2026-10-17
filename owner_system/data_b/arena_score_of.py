# Skor ML kausal = arena_score.py, tapi fitur = 34 fitur lama + fitur orderflow (flow_feats.csv, Rust).
# FE_MODE: base (34 lama saja) | all (34 + semua orderflow) | core (34 + 15 inti, ditetapkan SEBELUM uji)
import numpy as np, pandas as pd, json, os
from catboost import CatBoostClassifier
FE=json.load(open("C:/Users/horii/rhc-quant/live/filter_cat.json"))["feats"]
CORE=["of_buyer_growth","of_buyer_accel","of_new_buyers_w2","of_ofi_w2","of_ofi_trend","of_cvd_accel","of_cvd_end_lp",
      "of_bsz_gini","of_big_sell_share","of_tps","of_tx_accel","of_liq_change","of_swaps_per_buyer","of_top_buyer_share","of_organic_ratio"]
MODE=os.environ.get("FE_MODE","all")
RETRAIN=int(os.environ.get("RETRAIN","100")); MINSTART=int(os.environ.get("MINSTART","60"))
INF=os.environ.get("INF","arena_feats.csv"); OUTF=os.environ.get("OUTF","arena_scored_of.csv")
fl=pd.read_csv("flow_feats.csv").drop_duplicates(["ds","pool"])
OF=[c for c in fl.columns if c.startswith("of_")]
df=pd.read_csv(INF).merge(fl,on=["ds","pool"],how="left")
assert df[OF[0]].notna().all(), "ada koin tanpa fitur orderflow"
FX=FE+({"base":[],"all":OF,"core":CORE}[MODE])
df=df.sort_values("decide").reset_index(drop=True)
X=df[FX].fillna(-1).values; y=df.win.values.astype(bool)
decide=df.decide.values; exitb=df["exit"].values
n=len(df); score=np.full(n,np.nan); model=None; dilatih_pada=0; n_latih=0
for i in range(n):
    siap=exitb<decide[i]; ns=int(siap.sum())
    if ns>=MINSTART and (model is None or ns-dilatih_pada>=RETRAIN):
        idx=np.where(siap)[0]
        if len(set(y[idx]))>1:
            model=CatBoostClassifier(iterations=200,learning_rate=0.05,depth=4,l2_leaf_reg=5.0,random_seed=int(os.environ.get("SEED","0")),verbose=0,allow_writing_files=False)
            model.fit(X[idx],y[idx]); dilatih_pada=ns; n_latih+=1
    if model is not None: score[i]=model.predict_proba(X[i:i+1])[:,1][0]
df["score"]=score
df[[c for c in df.columns if not c.startswith("of_")]].to_csv(OUTF,index=False)
print(f"{MODE}: {len(FX)} fitur | dilatih ulang {n_latih}x | berskor {int((~np.isnan(score)).sum())}/{n}")
