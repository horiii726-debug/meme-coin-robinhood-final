# Gerbang rug KAUSAL: untuk tiap koin, model rug hanya dilatih dari pool yang status rug-nya
# SUDAH pasti sebelum blok keputusan koin itu (init+600+30menit <= decide). Dilatih ulang tiap 300 pool.
# Sumber latih: SEMUA pool yang terlihat (bukan hanya yang dibeli) di 9 periode.
import pandas as pd, numpy as np, glob, json, sys
from sklearn.ensemble import HistGradientBoostingClassifier
from sklearn.metrics import roc_auc_score

W30 = 18000
LAB = sys.argv[1] if len(sys.argv) > 1 else "rug3"
WIN = {"rug1": 600, "rug2": 1200, "rug3": 1800, "rug5": 3000, "rug7": 4200, "rug30": 18000}[LAB]

lp = pd.concat([pd.read_csv(f) for f in sorted(glob.glob("lp_*.csv")) if "dev" not in f], ignore_index=True)
lp["decide"] = lp.init + 600
lp["dt"] = lp.rug_blk - lp.decide
lp["lab"] = ((lp.dt > 0) & (lp.dt <= WIN)).astype(int)
lp["pasti"] = lp.decide + W30          # blok saat status rug30 koin ini sudah pasti diketahui
lp = lp.sort_values("init").reset_index(drop=True)

FE = ["ts", "fee", "hook", "w_main", "narrow", "full_range", "sym_off", "lo_main", "hi_main",
      "first_add_dt", "last_add_dt", "add_lg", "n_pos", "n_add", "n_rem", "max_add_share",
      "stage_span", "n_widths", "add_per_pos_lg"]
X = lp[FE].apply(pd.to_numeric, errors="coerce").values
y = lp.lab.values
pasti = lp.pasti.values
decide = lp.decide.values
n = len(lp)
p = np.full(n, np.nan)
model = None
dilatih = 0
nlatih = 0
order = np.argsort(decide)
for i in order:
    siap = pasti < decide[i]
    ns = int(siap.sum())
    if ns >= 300 and (model is None or ns - dilatih >= 300):
        idx = np.where(siap)[0]
        if len(set(y[idx])) > 1:
            model = HistGradientBoostingClassifier(max_depth=3, max_iter=150, learning_rate=0.06,
                                                   l2_regularization=1.0, random_state=0).fit(X[idx], y[idx])
            dilatih = ns
            nlatih += 1
    if model is not None:
        p[i] = model.predict_proba(X[i:i + 1])[:, 1][0]
lp["p_rug"] = p
lp[["ds", "pool", "init", "decide", "lab", "p_rug", "rug_blk"]].to_csv("prug_%s.csv" % LAB, index=False)
ok = lp.dropna(subset=["p_rug"])
print("model dilatih ulang %dx | pool berskor %d/%d" % (nlatih, len(ok), n))
for per, g in ok.groupby(np.where(ok.ds.isin(["m1", "m2"]), "BARU", "LAMA")):
    try:
        print(per, "n=%d base=%.4f AUC=%.3f" % (len(g), g.lab.mean(), roc_auc_score(g.lab, g.p_rug)))
    except Exception as e:
        print(per, e)
