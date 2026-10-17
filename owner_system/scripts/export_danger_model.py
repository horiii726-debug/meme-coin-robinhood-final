# Latih ulang model p_bahaya PERSIS seperti train_state.py (LAMA saja, seed 7),
# ekspor pohonnya ke JSON supaya mesin live (Node) bisa menghitung skor tanpa Python,
# lalu buktikan skornya identik dengan state_scores.csv (skor yang dipakai backtest v4).
import json, numpy as np, pandas as pd
from sklearn.ensemble import HistGradientBoostingClassifier

df = pd.read_csv("state_rows.csv")
FEATS = [c for c in df.columns if c not in ("pid", "period", "blk", "fmax30", "f5", "rug10")]
X = df[FEATS].replace([np.inf, -np.inf], np.nan).astype(float).fillna(-1)
y_dg = ((df.f5 <= 0.7) | (df.rug10 == 1)).astype(int).values
old = (df.period == "LAMA").values

m = HistGradientBoostingClassifier(max_iter=400, learning_rate=0.05, max_depth=5, max_leaf_nodes=24,
    min_samples_leaf=80, l2_regularization=5.0, early_stopping=True, validation_fraction=0.15,
    n_iter_no_change=40, random_state=7)
m.fit(X[old], y_dg[old])

trees = []
for it in m._predictors:
    nd = it[0].nodes
    trees.append({k: nd[k].tolist() for k in ("value", "feature_idx", "num_threshold", "missing_go_to_left", "left", "right", "is_leaf")})
model = {"feats": FEATS, "baseline": float(np.ravel(m._baseline_prediction)[0]), "trees": trees,
         "note": "p_bahaya: turun >=30% dalam 5 menit ATAU rug dalam 10 menit; dilatih LAMA saja (train_state.py, seed 7)"}
json.dump(model, open("danger_model.json", "w"))

# bukti 1: skor model ini == skor backtest (BARU, out-of-time)
new = ~old
p = m.predict_proba(X[new])[:, 1]
sc = pd.read_csv("state_scores.csv")
ref = sc.loc[new, "p_bahaya"].values
print(f"fitur: {len(FEATS)} | pohon: {len(trees)} | selisih maks vs state_scores.csv (BARU): {np.max(np.abs(p - ref)):.2e}")

# bukti 2: sampel untuk dicek oleh implementasi JS
rng = np.random.default_rng(3); idx = rng.choice(np.where(new)[0], 2000, replace=False)
json.dump({"X": X.iloc[idx].values.tolist(), "p": m.predict_proba(X.iloc[idx])[:, 1].tolist()}, open("danger_check.json", "w"))
print("tersimpan danger_model.json + danger_check.json")
