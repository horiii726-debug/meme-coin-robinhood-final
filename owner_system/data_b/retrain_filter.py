# Latih ulang model filter beli (CatBoost) dari SELURUH trade yang sudah TUTUP.
# Sumber: arena_feats.csv (riwayat) + feats_live.jsonl (koin yang dilihat bot live, digabung dgn hasil trade-nya).
# Menulis filter_cat.json + filter_cat_check.json secara atomik. Bot memverifikasi parity sebelum memakai.
import json, os, sys, numpy as np, pandas as pd
from catboost import CatBoostClassifier
LIVE = "C:/Users/horii/rhc-quant/live"
FE = json.load(open(f"{LIVE}/filter_cat.json"))["feats"]
base = pd.read_csv("C:/Users/horii/rhc-quant/data_b/arena_feats.csv")
rows = [base[["ret","win"]+FE]]
# tambahkan data live (fitur dicatat bot + hasil trade yang sudah tutup)
fl, tl = f"{LIVE}/feats_live.jsonl", f"{LIVE}/trades.jsonl"
if os.path.exists(fl) and os.path.exists(tl):
    F = {}
    for l in open(fl, encoding="utf8"):
        try: d = json.loads(l); F[d["pool"]] = d["f"]
        except: pass
    T = {}
    for l in open(tl, encoding="utf8"):
        try:
            t = json.loads(l)
            if t.get("plan") == "v4": T[t["pool"]] = t["ret"]
        except: pass
    live = [{**{k: F[p].get(k) for k in FE}, "ret": r, "win": 1 if r > 1 else 0} for p, r in T.items() if p in F]
    if live:
        rows.append(pd.DataFrame(live)[["ret","win"]+FE])
        print(f"data live ditambahkan: {len(live)} trade")
df = pd.concat(rows, ignore_index=True)
X = df[FE].fillna(-1).values; y = df.win.values.astype(bool)
if len(set(y)) < 2 or len(df) < 100:
    print("data belum cukup, model lama dipertahankan"); sys.exit(2)
m = CatBoostClassifier(iterations=200, learning_rate=0.05, depth=4, l2_leaf_reg=5.0,
                       random_seed=0, verbose=0, allow_writing_files=False)
m.fit(X, y)
m.save_model("cat_raw_new.json", format="json")
j = json.load(open("cat_raw_new.json"))
trees = [{"splits":[{"feat":int(s["float_feature_index"]),"border":float(s["border"])} for s in t["splits"]],
          "leaf":[float(v) for v in t["leaf_values"]]} for t in j["oblivious_trees"]]
sc = j["scale_and_bias"]; bias = sc[1][0] if isinstance(sc[1], list) else sc[1]
p_all = m.predict_proba(X)[:,1]
out = {"type":"catboost","feats":FE,"trees":trees,"scale":float(sc[0]),"bias":float(bias),
       "thr_start": float(np.quantile(p_all, 0.90)),      # ambang awal = 10% terbaik
       "n_latih": int(len(df)), "waktu": pd.Timestamp.utcnow().isoformat()}
idx = np.random.RandomState(0).choice(len(X), min(500, len(X)), replace=False)
chk = {"X": X[idx].tolist(), "p": m.predict_proba(X[idx])[:,1].tolist()}
json.dump(out, open(f"{LIVE}/filter_cat.new.json","w")); json.dump(chk, open(f"{LIVE}/filter_cat_check.new.json","w"))
os.replace(f"{LIVE}/filter_cat.new.json", f"{LIVE}/filter_cat.json")
os.replace(f"{LIVE}/filter_cat_check.new.json", f"{LIVE}/filter_cat_check.json")
print(f"model baru: {len(df)} trade latih | ambang awal {out['thr_start']:.3f}")
