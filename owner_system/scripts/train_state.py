# Model HOLD vs JUAL dari 100k potret kondisi.
#  p_naik  : harga masih akan naik >= 1,5x dalam 30 menit
#  p_bahaya: turun >= 30% dalam 5 menit ATAU rug dalam 10 menit
# LAMA: skor out-of-fold (GroupKFold per koin) -> untuk memilih ambang tanpa curang.
# BARU: model dilatih di SELURUH LAMA -> skor murni out-of-time.
import numpy as np, pandas as pd
from sklearn.ensemble import HistGradientBoostingClassifier
from sklearn.model_selection import GroupKFold
from sklearn.metrics import roc_auc_score

df = pd.read_csv("state_rows.csv")
FEATS = [c for c in df.columns if c not in ("pid", "period", "blk", "fmax30", "f5", "rug10")]
X = df[FEATS].replace([np.inf, -np.inf], np.nan).astype(float).fillna(-1)
y_up = (df.fmax30 >= 1.5).astype(int).values
y_dg = ((df.f5 <= 0.7) | (df.rug10 == 1)).astype(int).values
old = (df.period == "LAMA").values; new = ~old
groups = df.pid.values

def mk(seed=7):
    return HistGradientBoostingClassifier(max_iter=400, learning_rate=0.05, max_depth=5, max_leaf_nodes=24,
        min_samples_leaf=80, l2_regularization=5.0, early_stopping=True, validation_fraction=0.15,
        n_iter_no_change=40, random_state=seed)

scores = pd.DataFrame({"pid": df.pid, "blk": df.blk, "period": df.period})
for name, y in [("p_naik", y_up), ("p_bahaya", y_dg)]:
    oof = np.zeros(len(df))
    Xo, yo, go = X[old], y[old], groups[old]
    idx_old = np.where(old)[0]
    for tr, te in GroupKFold(n_splits=5).split(Xo, yo, go):
        m = mk(); m.fit(Xo.iloc[tr], yo[tr])
        oof[idx_old[te]] = m.predict_proba(Xo.iloc[te])[:, 1]
    m = mk(); m.fit(Xo, yo)
    oof[new] = m.predict_proba(X[new])[:, 1]
    scores[name] = oof
    print(f"{name}: AUC LAMA (out-of-fold per koin) {roc_auc_score(yo, oof[old]):.3f} | "
          f"AUC BARU (out-of-time) {roc_auc_score(y[new], oof[new]):.3f} | base rate BARU {100*y[new].mean():.1f}%")
    # kalibrasi kasar di BARU
    q = pd.qcut(oof[new], 5, labels=False, duplicates="drop")
    print("   kelompok skor BARU -> kejadian nyata: " + " | ".join(
        f"{100*oof[new][q==k].mean():.0f}%->{100*y[new][q==k].mean():.0f}%" for k in sorted(set(q))))

# fitur terpenting (model bahaya, LAMA) lewat permutasi di sampel
from sklearn.inspection import permutation_importance
samp = np.random.RandomState(1).choice(np.where(new)[0], size=min(15000, int(new.sum())), replace=False)
for name, y in [("p_naik", y_up), ("p_bahaya", y_dg)]:
    m = mk(); m.fit(X[old], y[old])
    pi = permutation_importance(m, X.iloc[samp], y[samp], n_repeats=3, random_state=1, scoring="roc_auc")
    imp = pd.Series(pi.importances_mean, index=FEATS).sort_values(ascending=False)
    print(f"\n{name} — 8 tanda terpenting (diukur di BARU):")
    for k, v in imp.head(8).items(): print(f"   {v:+.4f}  {k}")

scores.to_csv("state_scores.csv", index=False)
print("\ntersimpan state_scores.csv")
