# WALK-FORWARD PER HARI — uji stabilitas sesungguhnya.
# Untuk tiap hari d: latih HANYA pada hari-hari sebelum d, lalu uji di hari d.
# Ini meniru kondisi nyata: kamu tidak pernah punya data masa depan.
import sys, numpy as np, pandas as pd
from sklearn.ensemble import HistGradientBoostingClassifier
from sklearn.metrics import roc_auc_score

DIR = sys.argv[1] if len(sys.argv) > 1 else "ds6d"
import os
BLOCKS_PER_DAY = int(os.environ.get("PERIOD", "864000"))

df = pd.read_csv(f"{DIR}/ml.csv").sort_values("init_block").reset_index(drop=True)
df["day"] = ((df["init_block"] - df["init_block"].min()) // BLOCKS_PER_DAY).astype(int)
DROP = ["pool_id", "init_block", "y_mult", "day"]
FEATS = [c for c in df.columns if c not in DROP and not c.startswith("noise")]
X = df[FEATS].replace([np.inf, -np.inf], np.nan).astype(float).fillna(-1)
y_mult = df["y_mult"].values
days = sorted(df["day"].unique())

print(f"total {len(df)} pool | {len(days)} hari")
print("sebaran per hari:")
for d in days:
    m = df["day"] == d
    print(f"  hari {d}: {int(m.sum())} pool | >=+400% {100*(y_mult[m]>=5).mean():.1f}% | >=+1000% {100*(y_mult[m]>=11).mean():.1f}%")

def fit(Xtr, ytr, seed=42):
    m = HistGradientBoostingClassifier(
        max_iter=300, learning_rate=0.05, max_depth=4, max_leaf_nodes=12,
        min_samples_leaf=25, l2_regularization=5.0,
        early_stopping=True, validation_fraction=0.15, n_iter_no_change=40,
        random_state=seed)
    m.fit(Xtr, ytr)
    return m

for name, thr in [("+100%", 2.0), ("+400%", 5.0), ("+1000%", 11.0)]:
    y = (y_mult >= thr).astype(int)
    print("\n" + "=" * 78)
    print(f"WALK-FORWARD — target >= {name}")
    print("=" * 78)
    print("hari  n_latih  n_uji  base    AUC     top10_prec  top20_prec")
    print("-" * 78)
    aucs, p10s = [], []
    for d in days[1:]:
        tr = df["day"] < d
        te = df["day"] == d
        if tr.sum() < 200 or te.sum() < 20:
            continue
        ytr, yte = y[tr.values], y[te.values]
        if ytr.sum() < 10 or yte.sum() < 1:
            print(f"{d:<5} {int(tr.sum()):>7}  {int(te.sum()):>5}  positif terlalu sedikit")
            continue
        m = fit(X[tr.values], ytr)
        p = m.predict_proba(X[te.values])[:, 1]
        try:
            auc = roc_auc_score(yte, p)
        except Exception:
            auc = float("nan")
        order = np.argsort(-p)
        k10 = min(10, len(order)); k20 = min(20, len(order))
        pr10 = yte[order[:k10]].sum() / k10
        pr20 = yte[order[:k20]].sum() / k20
        aucs.append(auc); p10s.append(pr10)
        print(f"{d:<5} {int(tr.sum()):>7}  {int(te.sum()):>5}  {100*yte.mean():>5.1f}%  {auc:>6.3f}  "
              f"{100*pr10:>9.1f}%  {100*pr20:>9.1f}%")
    if aucs:
        a = np.array(aucs); p = np.array(p10s)
        print("-" * 78)
        print(f"AUC lintas hari : rata2 {a.mean():.3f} | min {a.min():.3f} | max {a.max():.3f}")
        print(f"top10 presisi   : rata2 {100*p.mean():.1f}% | min {100*p.min():.1f}% | max {100*p.max():.1f}%")
        stabil = (a.min() > 0.6) and (p.min() > 0)
        print(f"VERDIKT: {'STABIL (semua hari AUC>0,6)' if stabil else 'TIDAK STABIL — ada hari yang gagal'}")
