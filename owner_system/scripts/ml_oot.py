# Skor ML OUT-OF-TIME: latih HANYA di periode LAMA, beri skor ke pool periode BARU.
# Ambang "skor tinggi" diambil dari sebaran skor di periode LAMA (tidak mengintip BARU).
import os, numpy as np, pandas as pd
from sklearn.ensemble import HistGradientBoostingClassifier

SPLIT = 59886162
df = pd.read_csv("ds6d/ml.csv")
feats = [c for c in df.columns if c not in ("pool_id", "init_block", "y_mult") and not c.startswith("noise") and not (os.environ.get("NODEV") and c.startswith("dev_"))]
X = df[feats].replace([np.inf, -np.inf], np.nan).astype(float).fillna(-1)
old, new = df.init_block < SPLIT, df.init_block >= SPLIT
out = pd.DataFrame({"pool_id": df.pool_id[new].str.lower()})
for name, thr in [("p100", 2.0), ("p400", 5.0)]:
    y = (df.y_mult >= thr).astype(int)
    ps = []
    for s in range(5):
        m = HistGradientBoostingClassifier(max_iter=300, learning_rate=0.05, max_depth=4, max_leaf_nodes=12,
            min_samples_leaf=25, l2_regularization=5.0, early_stopping=True, validation_fraction=0.15,
            n_iter_no_change=40, random_state=100 + s)
        m.fit(X[old], y[old])
        ps.append(m.predict_proba(X)[:, 1])
    p = np.mean(ps, axis=0)
    cut = np.quantile(p[old.values], 0.70)          # 30% teratas menurut periode LAMA
    out[name] = p[new.values]
    out[name + "_hi"] = (p[new.values] >= cut).astype(int)
    print(f"{name}: dilatih {int(old.sum())} baris LAMA | ambang top-30% = {cut:.3f} | BARU lolos {int(out[name + '_hi'].sum())}/{len(out)}")
out.to_csv(os.environ.get("OUTF", "ds6d/ml_oot_scores.csv"), index=False)
print("tersimpan ds6d/ml_oot_scores.csv")
