# Scorer: baca JSON {nama_fitur: nilai} dari stdin, keluarkan probabilitas.
# Tahan terhadap urutan kolom (pakai nama), fitur hilang diisi -1.
import sys, json, numpy as np, pandas as pd, joblib

DIR = sys.argv[1] if len(sys.argv) > 1 else "ds24"
bundle = joblib.load(f"{DIR}/model.joblib")
models, feats = bundle["models"], bundle["feats"]

rows = json.load(sys.stdin)
if isinstance(rows, dict):
    rows = [rows]
X = pd.DataFrame([{f: r.get(f, -1) for f in feats} for r in rows])[feats]
X = X.replace([np.inf, -np.inf], np.nan).astype(float).fillna(-1)

out = []
for i in range(len(X)):
    o = {"pool_id": rows[i].get("pool_id", "")}
    for name, m in models.items():
        o[name] = round(float(m.predict_proba(X.iloc[[i]])[:, 1][0]), 4)
    out.append(o)
print(json.dumps(out))
