# FASE 6 — Gradient Boosting. Split berbasis WAKTU. TEST SET TIDAK DIBUKA.
# Menjawab: "koin ini mirip pola koin lama yang naik X% -- berapa probabilitasnya?"
import sys, numpy as np, pandas as pd
from sklearn.ensemble import HistGradientBoostingClassifier
from sklearn.inspection import permutation_importance
from sklearn.metrics import roc_auc_score

DIR = sys.argv[1] if len(sys.argv) > 1 else "ds24"
df = pd.read_csv(f"{DIR}/ml.csv").sort_values("init_block").reset_index(drop=True)

DROP = ["pool_id", "init_block", "y_mult"]
FEATS = [c for c in df.columns if c not in DROP]
X = df[FEATS].replace([np.inf, -np.inf], np.nan).astype(float).fillna(-1)
y_mult = df["y_mult"].values

n = len(df)
i_tr, i_va = int(n * 0.6), int(n * 0.8)
print(f"total {n} | train {i_tr} | val {i_va-i_tr} | TEST {n-i_va} (DIKUNCI)")
print(f"fitur: {len(FEATS)}\n")

for name, thr in [("+100%", 2.0), ("+400%", 5.0), ("+1000%", 11.0)]:
    y = (y_mult >= thr).astype(int)
    Xtr, ytr = X.iloc[:i_tr], y[:i_tr]
    Xva, yva = X.iloc[i_tr:i_va], y[i_tr:i_va]
    if ytr.sum() < 10 or yva.sum() < 3:
        print(f"=== {name}: positif terlalu sedikit (train {ytr.sum()}, val {yva.sum()}) — dilewati\n")
        continue

    m = HistGradientBoostingClassifier(
        max_iter=300, learning_rate=0.05, max_depth=4, max_leaf_nodes=12,
        min_samples_leaf=25, l2_regularization=5.0,
        early_stopping=True, validation_fraction=0.15, n_iter_no_change=40,
        random_state=42)
    m.fit(Xtr, ytr)

    p_tr = m.predict_proba(Xtr)[:, 1]
    p_va = m.predict_proba(Xva)[:, 1]
    auc_tr = roc_auc_score(ytr, p_tr)
    auc_va = roc_auc_score(yva, p_va)
    base = yva.mean()

    print("=" * 72)
    print(f"### TARGET >= {name}   (base rate val {100*base:.2f}%, positif val {int(yva.sum())})")
    print("=" * 72)
    print(f"AUC train {auc_tr:.3f} | AUC VALIDATION {auc_va:.3f}")

    print("\n  ambil K teratas menurut skor model (VALIDATION):")
    print("  K      kena   presisi   lift")
    order = np.argsort(-p_va)
    for K in [5, 10, 20, 40, 80]:
        if K > len(order):
            break
        sel = order[:K]
        hit = int(yva[sel].sum())
        prec = hit / K
        print(f"  {K:<6} {hit:>4}   {100*prec:>6.1f}%   {(prec/base if base>0 else 0):>5.1f}x")

    print("\n  kalibrasi (VALIDATION): yang diprediksi vs yang terjadi")
    try:
        q = pd.qcut(p_va, 5, labels=False, duplicates="drop")
        for b in sorted(set(q)):
            msk = q == b
            print(f"    kelompok {b+1}: prediksi {100*p_va[msk].mean():>5.1f}%  |  kenyataan {100*yva[msk].mean():>5.1f}%  (n={int(msk.sum())})")
    except Exception as e:
        print("    (gagal:", e, ")")

    pi = permutation_importance(m, Xva, yva, n_repeats=8, random_state=42, scoring="roc_auc")
    imp = pd.Series(pi.importances_mean, index=FEATS).sort_values(ascending=False)
    print("\n  10 fitur terpenting (permutation importance):")
    for k, v in imp.head(10).items():
        tag = "   <== NOISE (BAHAYA)" if k.startswith("noise") else ""
        print(f"    {v:+.4f}  {k}{tag}")
    nr = [i for i, k in enumerate(imp.index) if k.startswith("noise")]
    print(f"  peringkat fitur noise: {nr} dari {len(FEATS)} — "
          + ("BOCOR" if any(r < 10 for r in nr) else "aman"))
    print()
