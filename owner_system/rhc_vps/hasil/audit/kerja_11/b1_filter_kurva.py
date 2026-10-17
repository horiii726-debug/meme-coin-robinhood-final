# Agent 11 - kurva belajar filter beli (CatBoost, parameter sama dgn arena_score.py), kausal:
# model untuk blok uji hanya dilatih dari koin yang exit < decide koin PERTAMA di blok itu.
# Hipotesis H1: AUC naik dari N=50 ke N~500 lalu mendatar; model dengan N kecil (<100) ~ acak (AUC ~0,5).
import json, numpy as np, pandas as pd, os
from catboost import CatBoostClassifier
from sklearn.metrics import roc_auc_score
os.chdir(os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..", ".."))
FE = json.load(open("bot/filter_cat.json"))["feats"]
df = pd.read_csv("data/arena_feats.csv").sort_values("decide").reset_index(drop=True)
X = df[FE].fillna(-1).values; y = (df.win.values == 1); ret = df.ret.values
dec = df.decide.values; ex = df["exit"].values
def fit(idx):
    m = CatBoostClassifier(iterations=200, learning_rate=0.05, depth=4, l2_leaf_reg=5.0, random_seed=0, verbose=0,
                           allow_writing_files=False, thread_count=1)
    m.fit(X[idx], y[idx]); return m
BLK = 200
Ns = [50, 100, 200, 500, 1000, 1500]
res = []
for s in range(0, len(df), BLK):
    te = np.arange(s, min(s + BLK, len(df)))
    closed = np.where(ex < dec[s])[0]
    closed = closed[np.argsort(ex[closed])]         # urut waktu tutup
    for N in Ns + ["semua"]:
        n = len(closed) if N == "semua" else N
        if len(closed) < n or n < 50: continue
        idx = closed[-n:]                           # N trade TERBARU yang sudah tutup
        if len(set(y[idx])) < 2 or len(set(y[te])) < 2: continue
        p = fit(idx).predict_proba(X[te])[:, 1]
        k = max(1, int(round(0.1 * len(te))))
        top = te[np.argsort(-p)[:k]]
        res.append(dict(blok=s, ds=df.ds[s], N=str(N), n_hist=len(closed), auc=roc_auc_score(y[te], p),
                        prec10=y[top].mean(), base=y[te].mean(), ret10=ret[top].mean(), ret_all=ret[te].mean(),
                        rug10=(ret[top] < 0.3).mean(), rug_all=(ret[te] < 0.3).mean()))
R = pd.DataFrame(res); R.to_csv("hasil/audit/kerja_11/b1_filter_kurva_rows.csv", index=False)
pd.set_option("display.width", 250)
print("per blok 200 koin (N = jumlah trade tutup terbaru untuk latih):")
print(R.pivot_table(index=["blok", "ds", "n_hist"], columns="N", values="auc").round(3))
com = R[R.n_hist >= 1500]
print("\nRATA2 blok uji yang sama (riwayat >=1500):")
print(com.groupby("N").agg(blok=("auc", "size"), auc=("auc", "mean"), prec10=("prec10", "mean"), base=("base", "mean"),
                           ret10=("ret10", "mean"), ret_all=("ret_all", "mean"), rug10=("rug10", "mean"), rug_all=("rug_all", "mean")).round(3))
com = R[R.n_hist >= 500]
print("\nRATA2 blok uji dgn riwayat >=500:")
print(com.groupby("N").agg(blok=("auc", "size"), auc=("auc", "mean"), prec10=("prec10", "mean"), base=("base", "mean"),
                           ret10=("ret10", "mean"), ret_all=("ret_all", "mean")).round(3))
