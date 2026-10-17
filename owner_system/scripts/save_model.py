# Latih model final pada TRAIN+VAL (test tetap terkunci) lalu simpan untuk dipakai live.
import sys, json, numpy as np, pandas as pd, joblib
from sklearn.ensemble import HistGradientBoostingClassifier
from sklearn.metrics import roc_auc_score

DIR = sys.argv[1] if len(sys.argv) > 1 else "ds24"
df = pd.read_csv(f"{DIR}/ml.csv").sort_values("init_block").reset_index(drop=True)
DROP = ["pool_id", "init_block", "y_mult"]
FEATS = [c for c in df.columns if c not in DROP and not c.startswith("noise")]
X = df[FEATS].replace([np.inf, -np.inf], np.nan).astype(float).fillna(-1)
y_mult = df["y_mult"].values
n = len(df); i_va = int(n * 0.8)          # train+val = 80%, sisanya TEST (tidak disentuh)

models, report = {}, {}
for name, thr in [("p100", 2.0), ("p400", 5.0), ("p1000", 11.0)]:
    y = (y_mult >= thr).astype(int)
    m = HistGradientBoostingClassifier(
        max_iter=300, learning_rate=0.05, max_depth=4, max_leaf_nodes=12,
        min_samples_leaf=25, l2_regularization=5.0,
        early_stopping=True, validation_fraction=0.15, n_iter_no_change=40,
        random_state=42)
    m.fit(X.iloc[:i_va], y[:i_va])
    models[name] = m
    report[name] = {"threshold_mult": thr, "base_rate": float(y[:i_va].mean()),
                    "auc_insample": float(roc_auc_score(y[:i_va], m.predict_proba(X.iloc[:i_va])[:, 1]))}
    print(f"{name}: dilatih pada {i_va} baris, base rate {100*y[:i_va].mean():.2f}%")

joblib.dump({"models": models, "feats": FEATS}, f"{DIR}/model.joblib")
json.dump({"features": FEATS, "report": report, "trained_rows": int(i_va)},
          open(f"{DIR}/model_meta.json", "w"), indent=2)
print(f"\nmodel disimpan: {DIR}/model.joblib ({len(FEATS)} fitur)")
