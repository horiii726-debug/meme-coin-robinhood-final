# Skor ROKET kausal (resep sama dengan pipeline/arena_score_moon.py): model hanya belajar
# dari trade yang sudah TUTUP sebelum blok keputusan koin yang dinilai. Beda: daftar fitur.
# Pilihan fitur baru ditetapkan DI MUKA dari periode lama (AUC ret>=5 di LAMA >= 0.65 dan |rho| vs fitur lama < 0.85).
import numpy as np, pandas as pd, json, os, sys
from catboost import CatBoostClassifier

ROOT = r"C:\Users\horii\rhc-quant\rhc_vps"
K = os.path.join(ROOT, "hasil", "audit", "kerja_12")
OLD = json.load(open(os.path.join(ROOT, "bot", "filter_cat.json")))["feats"]

LUAS = ["ba_slope_n", "gap_mean1", "gap_mean3", "burst_idx", "vol_ratio", "buyvol_ratio",
        "hold_growth", "buyer_uniq_frac", "p2p_edges", "new_buyers_t3", "fund_frac",
        "traj_last_over_peak", "traj_up_frac", "traj_convex", "traj_late_ret",
        "dev_share", "dev_n_out", "dev_to_pool", "dev_first_out", "entry_gap_med", "entry_within5"]
INTI = ["gap_mean1", "gap_mean3", "burst_idx", "burst_max50_frac"]           # F2 saja (satu-satunya yg naik di m1 DAN m2)
SETS = {"lama": OLD, "inti": OLD + INTI, "luas": OLD + LUAS}

sc = pd.read_csv(os.path.join(ROOT, "data", "arena_scored.csv"))
f = pd.read_csv(os.path.join(K, "feat12.csv"))
df = sc.merge(f, on=["ds", "pool"], how="left").sort_values("decide").reset_index(drop=True)
THR = float(os.environ.get("MTHR", 2.0))
y = (df.ret.values >= THR)
decide = df.decide.values; exitb = df["exit"].values
n = len(df)

for nm, FE in SETS.items():
    X = df[FE].astype(float).fillna(-1).values
    moon = np.full(n, np.nan); model = None; dilatih = 0; nl = 0
    for i in range(n):
        siap = exitb < decide[i]; ns = int(siap.sum())
        if ns >= 60 and (model is None or ns - dilatih >= 100):
            idx = np.where(siap)[0]
            if y[idx].sum() >= 5:
                model = CatBoostClassifier(iterations=200, learning_rate=0.05, depth=4, l2_leaf_reg=5.0,
                                           random_seed=0, verbose=0, allow_writing_files=False,
                                           thread_count=1, auto_class_weights="Balanced")
                model.fit(X[idx], y[idx]); dilatih = ns; nl += 1
        if model is not None: moon[i] = model.predict_proba(X[i:i + 1])[:, 1][0]
    df["moon_" + nm] = moon
    print(nm, "latih ulang", nl, "| berskor", int((~np.isnan(moon)).sum()), file=sys.stderr)

from sklearn.metrics import roc_auc_score
print("\n=== AUC skor roket kausal (label ret>=%g), per periode bukti ===" % THR)
for nm in SETS:
    for ds in ["m1", "m2"]:
        s = df[(df.ds == ds) & df["moon_" + nm].notna()]
        for t in [2, 3, 5]:
            if (s.ret >= t).sum() >= 3:
                print("  %-5s %s ret>=%d : AUC %.3f (n=%d, roket=%d)" %
                      (nm, ds, t, roc_auc_score(s.ret >= t, s["moon_" + nm]), len(s), int((s.ret >= t).sum())))
    print()

for nm in SETS:
    o = df.copy(); o["moon"] = o["moon_" + nm]
    o.to_csv(os.path.join(K, "scored_%s.csv" % nm), index=False)
print("ditulis scored_*.csv", file=sys.stderr)
