# AUDIT: (1) apakah model bergantung pada fitur NOISE? (2) seberapa lebar ketidakpastian top-K?
import sys, numpy as np, pandas as pd
from sklearn.ensemble import HistGradientBoostingClassifier
from sklearn.metrics import roc_auc_score

DIR = sys.argv[1] if len(sys.argv) > 1 else "ds24"
df = pd.read_csv(f"{DIR}/ml.csv").sort_values("init_block").reset_index(drop=True)
DROP = ["pool_id", "init_block", "y_mult"]
ALL = [c for c in df.columns if c not in DROP]
NONOISE = [c for c in ALL if not c.startswith("noise")]
y_mult = df["y_mult"].values
n = len(df); i_tr, i_va = int(n*0.6), int(n*0.8)

def wilson(h, N, z=1.96):
    if N == 0: return (0, 1)
    p = h/N; d = 1 + z*z/N
    c = (p + z*z/(2*N))/d
    m = (z/d)*np.sqrt(p*(1-p)/N + z*z/(4*N*N))
    return (max(0, c-m), min(1, c+m))

def run(feats, y, seed):
    X = df[feats].replace([np.inf, -np.inf], np.nan).astype(float).fillna(-1)
    m = HistGradientBoostingClassifier(max_iter=300, learning_rate=0.05, max_depth=4,
        max_leaf_nodes=12, min_samples_leaf=25, l2_regularization=5.0,
        early_stopping=True, validation_fraction=0.15, n_iter_no_change=40, random_state=seed)
    m.fit(X.iloc[:i_tr], y[:i_tr])
    p = m.predict_proba(X.iloc[i_tr:i_va])[:, 1]
    return p

print("=" * 76)
print("AUDIT 1 — apakah model butuh fitur NOISE? (buang noise, latih ulang)")
print("=" * 76)
print("target      AUC dgn noise   AUC TANPA noise   selisih")
print("-" * 76)
for name, thr in [("+100%", 2.0), ("+400%", 5.0), ("+1000%", 11.0)]:
    y = (y_mult >= thr).astype(int)
    yva = y[i_tr:i_va]
    a1 = roc_auc_score(yva, run(ALL, y, 42))
    a2 = roc_auc_score(yva, run(NONOISE, y, 42))
    print(f"{name:<11} {a1:>12.3f}   {a2:>15.3f}   {a2-a1:>+8.3f}")
print("\nKalau AUC TIDAK turun saat noise dibuang -> model tidak bergantung padanya.")

print("\n" + "=" * 76)
print("AUDIT 2 — stabilitas top-K lintas 10 seed acak (tanpa noise)")
print("=" * 76)
for name, thr in [("+400%", 5.0), ("+1000%", 11.0)]:
    y = (y_mult >= thr).astype(int)
    yva = y[i_tr:i_va]
    base = yva.mean()
    print(f"\n### >= {name}  (base {100*base:.2f}%, positif {int(yva.sum())}/{len(yva)})")
    for K in [5, 10, 20, 40]:
        hits = []
        for s in range(10):
            p = run(NONOISE, y, 100 + s)
            hits.append(int(yva[np.argsort(-p)[:K]].sum()))
        hits = np.array(hits)
        mean_prec = hits.mean()/K
        lo, hi = wilson(int(round(hits.mean())), K)
        print(f"  top-{K:<3} presisi rata2 {100*mean_prec:>5.1f}%  (min {100*hits.min()/K:.0f}% - max {100*hits.max()/K:.0f}%)"
              f"   selang 95%: {100*lo:.0f}%-{100*hi:.0f}%   lift {mean_prec/base:.1f}x")
