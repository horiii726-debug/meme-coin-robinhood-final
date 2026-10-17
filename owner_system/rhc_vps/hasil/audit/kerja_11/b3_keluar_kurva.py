# Agent 11 - kurva belajar & drift model KELUAR (p_bahaya, p_naik), parameter sama dgn latih_keluar_wf.py.
# Latih HANYA dari periode sebelum periode uji. N = jumlah pool (trade hipotetis) TERBARU yang dipakai latih.
# Juga: ablasi fitur tekanan beli/jual & fitur rasio baru (ditetapkan a priori, tidak disetel ke periode uji).
# Hipotesis H1c: AUC naik dengan N dan model beku (W3) melemah di m1/m2 dibanding model yang dilatih ulang.
# Hipotesis H5: fitur arus (b/s/bu/su/net/surge/maxsell) menyumbang AUC; rasio penjual menambah sedikit.
import os
os.environ["OMP_NUM_THREADS"] = "1"
import json, numpy as np, pandas as pd
from sklearn.ensemble import HistGradientBoostingClassifier
from sklearn.metrics import roc_auc_score
os.chdir(os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..", ".."))
P = ["ags1", "ags4", "ds5d", "ds24", "m1", "m2"]
S = {p: pd.read_csv(f"data/state_{p}.csv") for p in P}
for p in P: S[p]["per"] = p
FE = [c for c in S["m2"].columns if c not in ("pid", "period", "blk", "fmax30", "f5", "rug10", "per")]
FLOW = ["b60", "s60", "bu60", "su60", "avgs60", "avgb60", "net60_lp", "b300", "s300", "bu300", "su300", "sell_surge", "maxsell60_lp", "accel", "tx60"]
def add_ratio(d):
    d = d.copy()
    d["sratio60"] = d.s60 / np.maximum(d.b60 + d.s60, 1); d["sratio300"] = d.s300 / np.maximum(d.b300 + d.s300, 1)
    d["su_bu300"] = d.su300 / np.maximum(d.bu300, 1); d["net300_usd"] = d.bu300 - d.su300
    return d
def lab(d, k): return (((d.f5 <= 0.7) | (d.rug10 == 1)) if k == "bahaya" else (d.fmax30 >= 1.5)).astype(int).values
def mk(): return HistGradientBoostingClassifier(max_iter=400, learning_rate=0.05, max_depth=5, max_leaf_nodes=24, min_samples_leaf=80,
                                                l2_regularization=5.0, early_stopping=True, validation_fraction=0.15, n_iter_no_change=40, random_state=7)
def X(d, fe): return d[fe].replace([np.inf, -np.inf], np.nan).astype(float).fillna(-1).values
res = []
for ti, tp in enumerate(P):
    if ti < 3: continue                                  # uji ds24, m1, m2
    prior = pd.concat([S[p] for p in P[:ti]], ignore_index=True)
    order = prior.groupby("pid").blk.min().sort_values().index.tolist()   # pool urut waktu
    te = S[tp]
    for k in ["bahaya", "naik"]:
        yt = lab(te, k)
        for N in [25, 50, 100, 200, 400, "semua"]:
            if N != "semua" and N >= len(order): continue
            pools = order if N == "semua" else order[-N:]
            tr = prior[prior.pid.isin(set(pools))]
            m = mk().fit(X(tr, FE), lab(tr, k))
            res.append(dict(uji=tp, label=k, N=str(N), n_pool=len(pools), n_potret=len(tr), auc=roc_auc_score(yt, m.predict_proba(X(te, FE))[:, 1])))
        # model beku W3 (ags1+ags4+ds5d)
        if ti >= 4:
            tr = pd.concat([S[p] for p in P[:3]]); m = mk().fit(X(tr, FE), lab(tr, k))
            res.append(dict(uji=tp, label=k, N="beku_W3", n_pool=tr.pid.nunique(), n_potret=len(tr), auc=roc_auc_score(yt, m.predict_proba(X(te, FE))[:, 1])))
        # ablasi fitur arus + fitur rasio baru (latih semua periode sebelumnya)
        fe_noflow = [f for f in FE if f not in FLOW]
        m = mk().fit(X(prior, fe_noflow), lab(prior, k))
        res.append(dict(uji=tp, label=k, N="semua_tanpa_arus", n_pool=len(order), n_potret=len(prior), auc=roc_auc_score(yt, m.predict_proba(X(te, fe_noflow))[:, 1])))
        pr2, te2 = add_ratio(prior), add_ratio(te); fe2 = FE + ["sratio60", "sratio300", "su_bu300", "net300_usd"]
        m = mk().fit(X(pr2, fe2), lab(pr2, k))
        res.append(dict(uji=tp, label=k, N="semua_plus_rasio", n_pool=len(order), n_potret=len(prior), auc=roc_auc_score(yt, m.predict_proba(X(te2, fe2))[:, 1])))
        print(tp, k, "ok", flush=True)
R = pd.DataFrame(res); R.to_csv("hasil/audit/kerja_11/b3_keluar_kurva.csv", index=False)
pd.set_option("display.width", 250)
print(R.pivot_table(index=["label", "N"], columns="uji", values="auc").round(3))
# AUC univariat fitur arus per periode (arah tetap: dihitung apa adanya)
print("\nAUC univariat (tanpa model) fitur tekanan vs label, per periode:")
rows = []
for p in P[2:]:
    d = add_ratio(S[p])
    for k in ["bahaya", "naik"]:
        y = lab(d, k)
        for f in ["net60_lp", "sratio60", "sratio300", "maxsell60_lp", "sell_surge", "su_bu300", "b60", "s60"]:
            v = d[f].replace([np.inf, -np.inf], np.nan).fillna(-1).values
            rows.append(dict(per=p, label=k, fitur=f, auc=roc_auc_score(y, v)))
U = pd.DataFrame(rows); print(U.pivot_table(index=["label", "fitur"], columns="per", values="auc").round(3))
U.to_csv("hasil/audit/kerja_11/b3_univariat.csv", index=False)
