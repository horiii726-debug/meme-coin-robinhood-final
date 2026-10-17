# Model rug dilatih HANYA di wilayah keputusan (koin yang lolos filter ML longgar q60),
# bukan di seluruh pool. Semua fitur yang tersedia: 34 fitur menit-1 + struktur LP + posisi tick.
# Kausal: latih hanya dari koin yang status rug-nya sudah pasti sebelum blok keputusan.
import pandas as pd, numpy as np, json
from sklearn.ensemble import HistGradientBoostingClassifier
from sklearn.metrics import roc_auc_score
rng = np.random.default_rng(31)

d = pd.read_csv("scored_base_l60.csv")
lpf = pd.read_csv("kand2.csv")[["pool", "ts", "w_main", "narrow", "full_range", "sym_off", "lo_main", "hi_main",
                                "first_add_dt", "last_add_dt", "add_lg", "n_pos", "n_add", "max_add_share",
                                "stage_span", "pos_rng", "d_hi", "d_lo", "tick_move", "tick_v",
                                "n_prior", "n_prior_rug", "dev_baru", "prior_rug_rate"]]
m = pd.read_csv("prug_multi.csv")[["pool", "dt", "y_rug1", "y_rug3", "y_rug5", "y_rug10", "y_rug30"]]
d = d.merge(lpf, on="pool", how="left").merge(m, on="pool", how="left")
d = d.sort_values("decide").reset_index(drop=True)
lol = pd.read_csv("lolos.csv")
beli = set(lol[lol.lolos].pool)
d["beli"] = d.pool.isin(beli)
d["per"] = np.where(d.ds.isin(["m1", "m2"]), "BARU", "LAMA")

F34 = json.load(open("../../../bot/filter_cat.json"))["feats"]
FLP = ["ts", "w_main", "narrow", "full_range", "sym_off", "lo_main", "hi_main", "first_add_dt",
       "last_add_dt", "add_lg", "n_pos", "n_add", "max_add_share", "stage_span",
       "pos_rng", "d_hi", "d_lo", "tick_move", "tick_v", "n_prior", "n_prior_rug", "dev_baru", "prior_rug_rate"]
SETS = {"34 lama": F34, "struktur LP+tick": FLP, "gabungan": F34 + FLP}

sub = d[d.lolos60].reset_index(drop=True)
print("wilayah latih (lolos q60): %d koin | LAMA %d, BARU %d" % (len(sub), (sub.per == "LAMA").sum(), (sub.per == "BARU").sum()))
for LAB, W in [("y_rug1", 600), ("y_rug3", 1800), ("y_rug5", 3000), ("y_rug10", 6000)]:
    y = sub[LAB].fillna(0).astype(int).values
    pasti = (sub.decide + W).values
    dec = sub.decide.values
    n = len(sub)
    for nm, FE in SETS.items():
        X = sub[[f for f in FE if f in sub.columns]].apply(pd.to_numeric, errors="coerce").values
        p = np.full(n, np.nan)
        model = None
        dilatih = -10 ** 9
        i = 0
        nl = 0
        while i < n:
            ns = int((pasti < dec[i]).sum())
            if ns >= 150 and ns - dilatih >= 100:
                idx = np.where(pasti < dec[i])[0]
                if len(set(y[idx])) > 1:
                    model = HistGradientBoostingClassifier(max_depth=3, max_iter=150, learning_rate=0.06,
                                                           l2_regularization=1.0, random_state=0).fit(X[idx], y[idx])
                    dilatih = ns
                    nl += 1
            j = i
            while j < n and int((pasti < dec[j]).sum()) - dilatih < 100:
                j += 1
            j = max(j, i + 1)
            if model is not None:
                p[i:j] = model.predict_proba(X[i:j])[:, 1]
            i = j
        sub["p"] = p
        out = []
        for tag in ["LAMA", "BARU"]:
            for univ, msk in [("lolos60", sub.per == tag), ("daftar beli", (sub.per == tag) & sub.beli)]:
                g = sub[msk].dropna(subset=["p"])
                if len(g) < 15 or g[LAB].sum() < 2:
                    out.append("%s/%s n=%d -" % (tag, univ, len(g)))
                    continue
                a = roc_auc_score(g[LAB], g.p)
                bs = []
                yy = g[LAB].values
                pp = g.p.values
                for _ in range(600):
                    k = rng.integers(0, len(yy), len(yy))
                    if len(set(yy[k])) > 1:
                        bs.append(roc_auc_score(yy[k], pp[k]))
                ci = "[%.2f,%.2f]" % tuple(np.percentile(bs, [2.5, 97.5])) if bs else "-"
                out.append("%s/%-11s n=%3d base=%.3f AUC=%.3f %s" % (tag, univ, len(g), g[LAB].mean(), a, ci))
        print("\n%-8s %-17s latih %dx" % (LAB, nm, nl))
        for o in out:
            print("   ", o)
