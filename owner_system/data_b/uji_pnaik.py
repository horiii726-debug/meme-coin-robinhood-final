import numpy as np, pandas as pd, joblib
from sklearn.ensemble import HistGradientBoostingClassifier
from sklearn.metrics import roc_auc_score
d = pd.read_csv("state_rows.csv")
FE = [c for c in d.columns if c not in ("pid","period","blk","fmax30","f5","rug10")]
X = d[FE].replace([np.inf,-np.inf],np.nan).astype(float).fillna(-1).values
y_naik = (d.fmax30 >= 1.5).astype(int).values
y_bahaya = ((d.f5 <= 0.7) | (d.rug10 == 1)).astype(int).values
latih = (d.period == "LAMA").values; uji = ~latih
m = HistGradientBoostingClassifier(max_iter=400, learning_rate=0.05, max_depth=5, max_leaf_nodes=24,
    min_samples_leaf=80, l2_regularization=5.0, early_stopping=True, validation_fraction=0.15,
    n_iter_no_change=40, random_state=7)
m.fit(X[latih], y_naik[latih])
p = m.predict_proba(X[uji])[:,1]; yy = y_naik[uji]
print("MODEL p_naik (harga masih akan naik >=1,5x dalam 30 menit)")
print("  AUC luar-waktu: %.3f   <- p_bahaya baru 0,707 | p_bahaya lama 0,595" % roc_auc_score(yy, p))
print("  kejadian sebenarnya: %.1f%% dari potret" % (100*yy.mean()))
print()
print("  ambang | sinyal | BENAR (memang masih naik)")
for th in [0.3,0.5,0.6,0.7,0.8]:
    s = p >= th
    if s.sum() < 30: continue
    print("   %.1f   | %5.1f%% | %5.1f%%" % (th, 100*s.mean(), 100*yy[s].mean()))
bah = y_bahaya[uji] == 1
print()
print("Dari potret berlabel BAHAYA, %.1f%% ternyata MASIH NAIK >=1,5x dalam 30 menit." % (100*yy[bah].mean()))
print("  -> ini pemenang yang dijual terlalu dini oleh aturan 'bahaya saja'.")
joblib.dump({"model":m,"feats":FE}, "pnaik.pkl")
