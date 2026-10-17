# Agent 13 - skor roket KAUSAL dari fitur mikrostruktur.
# Model hanya belajar dari trade yang sudah TUTUP sebelum blok keputusan koin yang dinilai.
import numpy as np, pandas as pd, os, sys
from catboost import CatBoostClassifier
ROOT = r"C:\Users\horii\rhc-quant\rhc_vps"
K = os.path.dirname(os.path.abspath(__file__))
sc = pd.read_csv(os.path.join(ROOT, "data", "arena_scored.csv"))
mk = pd.read_csv(os.path.join(K, "mikro.csv"))
df = sc.merge(mk, on=["ds", "pool"], how="left").sort_values("decide").reset_index(drop=True)
print("baris", len(df), "mikro hilang", int(df.mz_med_buy.isna().sum()), file=sys.stderr)

# A = pra-daftar (dipilih HANYA dari periode lama, sebelum melihat m1/m2)
A = ['md_maxbuy_L','mf_dev_buy','me_width','mf_match','mt_span','mi_decay','mt_same_blk','mt_first_gap']
# B = "kasus terbaik": arah konsisten di periode lama DAN bukti (optimistis, bukan pra-daftar)
Bf = ['mi_buy','mi_sell','me_tick_per_usd','mf_dom_buyer','mf_repeat_frac','lp_m1','md_pool_bought','mz_tot_buy']
SETS = {"A_pradaftar": A, "B_kasusterbaik": Bf}
THR = float(os.environ.get("MTHR", 3.0))
y = (df.ret.values >= THR)
decide = df.decide.values; exitb = df["exit"].values; n = len(df)
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
        if model is not None: moon[i] = model.predict_proba(X[i:i+1])[:, 1][0]
    df["moon_" + nm] = moon
    print(nm, "latih ulang", nl, "| berskor", int((~np.isnan(moon)).sum()), file=sys.stderr)

from sklearn.metrics import roc_auc_score
lab = pd.read_csv(os.path.join(ROOT, "hasil", "audit", "kerja_12", "label_puncak.csv"))[["ds","pool","pk_price"]]
d2 = df.merge(lab, on=["ds","pool"], how="left")
print("\n=== AUC skor roket kausal di periode bukti ===")
for nm in SETS:
    for ds in ["m1","m2"]:
        s = d2[(d2.ds==ds) & d2["moon_"+nm].notna()]
        for t in [3,10]:
            if (s.pk_price>=t).sum() >= 3:
                print("  %-14s %s pk>=%2dx : AUC %.3f (n=%d, roket=%d)" % (nm, ds, t,
                    roc_auc_score(s.pk_price>=t, s["moon_"+nm]), len(s), int((s.pk_price>=t).sum())))
for nm in SETS:
    o = df.copy(); o["moon"] = o["moon_"+nm]
    o.to_csv(os.path.join(K, "scored_%s.csv" % nm), index=False)
print("ditulis scored_*.csv", file=sys.stderr)
