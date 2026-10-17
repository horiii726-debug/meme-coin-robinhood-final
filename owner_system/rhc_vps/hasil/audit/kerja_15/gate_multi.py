# MODEL RUG TERSENDIRI, label BERTINGKAT menurut waktu.
# Untuk tiap horizon H (1,3,5,10,30 menit sesudah blok keputusan) dilatih model kausal terpisah:
# hanya memakai pool yang status rug-nya SUDAH pasti sebelum blok keputusan koin yang dinilai.
# Sumber latih: SEMUA pool yang terlihat di 9 periode (bukan hanya yang dibeli).
import pandas as pd, numpy as np, glob, sys
from sklearn.ensemble import HistGradientBoostingClassifier
from sklearn.metrics import roc_auc_score

HOR = {"rug1": 600, "rug3": 1800, "rug5": 3000, "rug10": 6000, "rug30": 18000}
lp = pd.concat([pd.read_csv(f) for f in sorted(glob.glob("lp_*.csv")) if "dev" not in f], ignore_index=True)
lp["decide"] = lp.init + 600
lp["dt"] = lp.rug_blk - lp.decide
lp = lp.sort_values("decide").reset_index(drop=True)
FE = ["ts", "fee", "hook", "w_main", "narrow", "full_range", "sym_off", "lo_main", "hi_main",
      "first_add_dt", "last_add_dt", "add_lg", "n_pos", "n_add", "n_rem", "max_add_share",
      "stage_span", "n_widths", "add_per_pos_lg"]
X = lp[FE].apply(pd.to_numeric, errors="coerce").values
decide = lp.decide.values
n = len(lp)
res = {}
for nm, W in HOR.items():
    y = ((lp.dt > 0) & (lp.dt <= W)).astype(int).values
    pasti = (lp.decide + W).values          # status label ini pasti diketahui pada blok ini
    p = np.full(n, np.nan)
    model = None
    dilatih = -10 ** 9
    nlatih = 0
    i = 0
    while i < n:
        siap = pasti < decide[i]
        ns = int(siap.sum())
        if ns >= 300 and ns - dilatih >= 300:
            idx = np.where(siap)[0]
            if len(set(y[idx])) > 1:
                model = HistGradientBoostingClassifier(max_depth=3, max_iter=150, learning_rate=0.06,
                                                       l2_regularization=1.0, random_state=0).fit(X[idx], y[idx])
                dilatih = ns
                nlatih += 1
        # prediksi blok demi blok sampai kumpulan latih berikutnya layak (batch, hasil sama)
        j = i
        while j < n and int((pasti < decide[j]).sum()) - dilatih < 300:
            j += 1
        j = max(j, i + 1)
        if model is not None:
            p[i:j] = model.predict_proba(X[i:j])[:, 1]
        i = j
    lp["p_" + nm] = p
    lp["y_" + nm] = y
    res[nm] = nlatih
    ok = ~np.isnan(p)
    per = np.where(lp.ds.isin(["m1", "m2"]), "BARU", "LAMA")
    line = "%-6s latih %2dx |" % (nm, nlatih)
    for tag in ["LAMA", "BARU"]:
        s = ok & (per == tag)
        try:
            line += " %s n=%d base=%.4f AUC=%.3f |" % (tag, s.sum(), y[s].mean(), roc_auc_score(y[s], p[s]))
        except Exception:
            line += " %s - |" % tag
    print(line, flush=True)
cols = ["ds", "pool", "init", "decide", "rug_blk", "dt"] + ["p_" + k for k in HOR] + ["y_" + k for k in HOR]
lp[cols].to_csv("prug_multi.csv", index=False)
print("-> prug_multi.csv")
