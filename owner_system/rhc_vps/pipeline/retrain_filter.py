# Latih ulang model filter beli (CatBoost) dari SELURUH trade yang sudah TUTUP.
# Jalur file relatif terhadap struktur paket (jalan di Windows maupun Linux/VPS):
#   BOT_DIR  (default ../bot)                 -> tempat filter_cat.json + check ditulis
#   FEATS    (default ../data/arena_feats.csv) -> riwayat fitur + hasil
# Data live (feats_live.jsonl + trades.jsonl di BOT_DIR) ikut digabung bila ada.
import json, os, sys, numpy as np, pandas as pd
from catboost import CatBoostClassifier
HERE=os.path.dirname(os.path.abspath(__file__))
LIVE=os.path.abspath(os.environ.get("BOT_DIR", os.path.join(HERE,"..","bot")))
FEATS=os.path.abspath(os.environ.get("FEATS", os.path.join(HERE,"..","data","arena_feats.csv")))
FE=json.load(open(os.path.join(LIVE,"filter_cat.json")))["feats"] if os.path.exists(os.path.join(LIVE,"filter_cat.json")) else json.load(open(os.path.join(HERE,"fitur_filter.json")))
base=pd.read_csv(FEATS)
rows=[base[["ret","win"]+FE]]
fl,tl=os.path.join(LIVE,"feats_live.jsonl"),os.path.join(LIVE,"trades.jsonl")
if os.path.exists(fl) and os.path.exists(tl):
    F={}
    for l in open(fl,encoding="utf8"):
        try: d=json.loads(l); F[d["pool"]]=d["f"]
        except: pass
    T={}
    for l in open(tl,encoding="utf8"):
        try:
            t=json.loads(l)
            if t.get("plan")=="v4" and t.get("akun_posisi") is not None: T[t["pool"]]=t["ret"]
        except: pass
    live=[{**{k:F[p].get(k) for k in FE},"ret":r,"win":1 if r>1 else 0} for p,r in T.items() if p in F]
    if live: rows.append(pd.DataFrame(live)[["ret","win"]+FE]); print(f"data live ditambahkan: {len(live)} trade")
df=pd.concat(rows,ignore_index=True)
X=df[FE].fillna(-1).values; y=df.win.values.astype(bool)
if len(set(y))<2 or len(df)<100: print("data belum cukup, model lama dipertahankan"); sys.exit(2)
m=CatBoostClassifier(iterations=200,learning_rate=0.05,depth=4,l2_leaf_reg=5.0,random_seed=0,verbose=0,allow_writing_files=False)
m.fit(X,y)
tmp=os.path.join(LIVE,"cat_raw_new.json"); m.save_model(tmp,format="json"); j=json.load(open(tmp)); os.remove(tmp)
trees=[{"splits":[{"feat":int(s["float_feature_index"]),"border":float(s["border"])} for s in t["splits"]],"leaf":[float(v) for v in t["leaf_values"]]} for t in j["oblivious_trees"]]
sc=j["scale_and_bias"]; bias=sc[1][0] if isinstance(sc[1],list) else sc[1]
p_all=m.predict_proba(X)[:,1]
out={"type":"catboost","feats":FE,"trees":trees,"scale":float(sc[0]),"bias":float(bias),
     "thr_start":float(np.quantile(p_all,0.90)),"n_latih":int(len(df)),"waktu":pd.Timestamp.now("UTC").isoformat()}
idx=np.random.RandomState(0).choice(len(X),min(500,len(X)),replace=False)
chk={"X":X[idx].tolist(),"p":m.predict_proba(X[idx])[:,1].tolist()}
json.dump(out,open(os.path.join(LIVE,"filter_cat.new.json"),"w")); json.dump(chk,open(os.path.join(LIVE,"filter_cat_check.new.json"),"w"))
os.replace(os.path.join(LIVE,"filter_cat.new.json"),os.path.join(LIVE,"filter_cat.json"))
os.replace(os.path.join(LIVE,"filter_cat_check.new.json"),os.path.join(LIVE,"filter_cat_check.json"))
print(f"model filter: {len(df)} trade latih | ambang awal {out['thr_start']:.3f}")
