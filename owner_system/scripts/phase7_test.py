# FASE 7 — MEMBUKA TEST SET. JALANKAN SEKALI SAJA.
# Setelah ini, angka test tidak boleh dipakai untuk menyetel apa pun.
# Kalau hasilnya jelek, riset selesai. Itu aturan yang kamu tulis sendiri.
import sys, os, json, numpy as np, pandas as pd
from sklearn.ensemble import HistGradientBoostingClassifier
from sklearn.metrics import roc_auc_score

DIR = sys.argv[1] if len(sys.argv) > 1 else "ds6d"
SEAL = f"{DIR}/TEST_SET_SUDAH_DIBUKA.txt"
if os.path.exists(SEAL):
    print("=" * 70)
    print("TEST SET SUDAH PERNAH DIBUKA:")
    print(open(SEAL).read())
    print("Membukanya lagi TIDAK SAH secara metodologi. Berhenti.")
    sys.exit(1)
if os.environ.get("SAYA_YAKIN") != "YA":
    print("Ini membuka TEST SET dan hanya boleh sekali.")
    print("Jalankan dengan:  SAYA_YAKIN=YA python phase7_test.py " + DIR)
    sys.exit(1)

df = pd.read_csv(f"{DIR}/ml.csv").sort_values("init_block").reset_index(drop=True)
DROP = ["pool_id", "init_block", "y_mult"]
FEATS = [c for c in df.columns if c not in DROP and not c.startswith("noise")]
X = df[FEATS].replace([np.inf, -np.inf], np.nan).astype(float).fillna(-1)
y_mult = df["y_mult"].values
n = len(df); i_va = int(n * 0.8)
print(f"latih pada {i_va} baris (train+val) | TEST {n - i_va} baris\n")

out = {}
for name, thr in [("+100%", 2.0), ("+400%", 5.0), ("+1000%", 11.0)]:
    y = (y_mult >= thr).astype(int)
    ytr, yte = y[:i_va], y[i_va:]
    if ytr.sum() < 10 or yte.sum() < 1:
        print(f"{name}: positif terlalu sedikit — dilewati"); continue
    # rata-rata 10 seed supaya bukan keberuntungan satu model
    ps = []
    for s in range(10):
        m = HistGradientBoostingClassifier(max_iter=300, learning_rate=0.05, max_depth=4,
            max_leaf_nodes=12, min_samples_leaf=25, l2_regularization=5.0,
            early_stopping=True, validation_fraction=0.15, n_iter_no_change=40, random_state=100+s)
        m.fit(X.iloc[:i_va], ytr)
        ps.append(m.predict_proba(X.iloc[i_va:])[:, 1])
    p = np.mean(ps, axis=0)
    auc = roc_auc_score(yte, p)
    base = yte.mean()
    order = np.argsort(-p)
    res = {"auc_test": round(float(auc), 4), "base_rate": round(float(base), 4), "n_test": int(len(yte))}
    print("=" * 70)
    print(f"### TEST >= {name}   base rate {100*base:.2f}%  ({int(yte.sum())}/{len(yte)})")
    print(f"AUC TEST = {auc:.3f}")
    print("  K      kena   presisi   lift")
    for K in [10, 20, 40, 80]:
        if K > len(order): break
        h = int(yte[order[:K]].sum()); pr = h / K
        res[f"top{K}"] = round(float(pr), 4)
        print(f"  {K:<6} {h:>4}   {100*pr:>6.1f}%   {(pr/base if base>0 else 0):>5.1f}x")
    out[name] = res
    print()

with open(SEAL, "w") as f:
    f.write(f"Dibuka: {pd.Timestamp.now()}\nDataset: {DIR}\nHasil:\n{json.dumps(out, indent=2)}\n")
print("=" * 70)
print(f"TEST SET DITUTUP PERMANEN. Hasil tersegel di {SEAL}")
print("Mulai sekarang, jangan pakai angka ini untuk menyetel model.")
