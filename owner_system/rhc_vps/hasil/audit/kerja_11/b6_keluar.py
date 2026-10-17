# Agent 11 - kurva belajar & drift model KELUAR (ringan: max_iter 150, baris latih disubsampel maks 60k, 1 thread).
# Latih HANYA dari periode sebelum periode uji; N = jumlah pool (trade hipotetis) terbaru.
import os
os.environ["OMP_NUM_THREADS"] = "1"
import numpy as np, pandas as pd
from sklearn.ensemble import HistGradientBoostingClassifier
from sklearn.metrics import roc_auc_score
os.chdir(os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..", ".."))
P = ["ags1", "ags4", "ds5d", "ds24", "m1", "m2"]
S = {p: pd.read_csv(f"data/state_{p}.csv") for p in P}
FE = [c for c in S["m2"].columns if c not in ("pid", "period", "blk", "fmax30", "f5", "rug10")]
FLOW = ["b60", "s60", "bu60", "su60", "avgs60", "avgb60", "net60_lp", "b300", "s300", "bu300", "su300", "sell_surge", "maxsell60_lp", "accel", "tx60"]
def lab(d, k): return (((d.f5 <= 0.7) | (d.rug10 == 1)) if k == "bahaya" else (d.fmax30 >= 1.5)).astype(int).values
def X(d, fe): return d[fe].replace([np.inf, -np.inf], np.nan).astype(float).fillna(-1).values
def mk(): return HistGradientBoostingClassifier(max_iter=150, learning_rate=0.08, max_depth=5, max_leaf_nodes=24, min_samples_leaf=80,
        l2_regularization=5.0, early_stopping=True, validation_fraction=0.15, n_iter_no_change=20, random_state=7)
def sub(d, n=60000):
    return d if len(d) <= n else d.sample(n, random_state=1)
res = []
def add(**kw):
    res.append(kw); pd.DataFrame(res).to_csv("hasil/audit/kerja_11/b6_keluar.csv", index=False); print(kw, flush=True)
for ti, tp in enumerate(P):
    if tp not in ("m1", "m2"): continue
    prior = pd.concat([S[p] for p in P[:ti]], ignore_index=True)
    order = prior.groupby("pid").blk.min().sort_values().index.tolist()
    te = S[tp]
    for k in ["bahaya", "naik"]:
        yt = lab(te, k)
        for N in [50, 200, "semua"]:
            pools = order if N == "semua" else order[-N:]
            tr = sub(prior[prior.pid.isin(set(pools))])
            m = mk().fit(X(tr, FE), lab(tr, k))
            add(uji=tp, label=k, varian=str(N), n_pool=len(pools), n_potret=len(tr), auc=round(roc_auc_score(yt, m.predict_proba(X(te, FE))[:, 1]), 4))
        tr = sub(pd.concat([S[p] for p in P[:3]]))          # beku: hanya ags1+ags4+ds5d
        m = mk().fit(X(tr, FE), lab(tr, k))
        add(uji=tp, label=k, varian="beku_W3", n_pool=tr.pid.nunique(), n_potret=len(tr), auc=round(roc_auc_score(yt, m.predict_proba(X(te, FE))[:, 1]), 4))
        fe2 = [f for f in FE if f not in FLOW]
        tr = sub(prior); m = mk().fit(X(tr, fe2), lab(tr, k))
        add(uji=tp, label=k, varian="tanpa_arus", n_pool=len(order), n_potret=len(tr), auc=round(roc_auc_score(yt, m.predict_proba(X(te, fe2))[:, 1]), 4))
print(pd.DataFrame(res).pivot_table(index=["label", "varian"], columns="uji", values="auc").round(3))
