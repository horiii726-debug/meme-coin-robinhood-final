# (a) korelasi fitur baru vs 34 fitur lama, (b) kenaikan AUC per keluarga di atas fitur lama,
# (c) skor "jalur roket" kausal untuk arena (latih HANYA di periode lama).
import numpy as np, pandas as pd, os, sys
from catboost import CatBoostClassifier
from scipy.stats import spearmanr
np.seterr(all="ignore")
K = r"C:\Users\horii\rhc-quant\rhc_vps\hasil\audit\kerja_12"
sys.path.insert(0, K)
from uji import FAM, OLD, auc, muat
TH = int(os.environ.get("TH", "5"))

def cb(X, y, seed=0):
    m = CatBoostClassifier(iterations=200, learning_rate=0.05, depth=3, l2_leaf_reg=6.0,
                           random_seed=seed, verbose=0, allow_writing_files=False,
                           thread_count=1, auto_class_weights="Balanced")
    m.fit(X, y); return m

df = muat()
lama = df.ds.isin(["u_ds5d","u_ds24","ags1","ags4"]).values
m1 = (df.ds=="m1").values; m2 = (df.ds=="m2").values
y = (df.pk_val >= TH).values
print("label pk_val>=%d | lama %d | m1 %d | m2 %d" % (TH, y[lama].sum(), y[m1].sum(), y[m2].sum()))

# ---- (a) korelasi maksimum tiap fitur baru terhadap fitur lama (di periode LAMA)
print("\n## Korelasi Spearman maks tiap fitur baru vs 34 fitur lama (periode LAMA)")
Xo = df[OLD].values[lama]
print("%-18s %-20s %8s %-16s" % ("keluarga","fitur baru","|rho|maks","paling mirip"))
for fam, cols in FAM.items():
    rows=[]
    for c in cols:
        v = df[c].values[lama].astype(float)
        best=0; bn="-"
        for j,o in enumerate(OLD):
            r = spearmanr(v, Xo[:,j], nan_policy="omit").statistic
            if np.isfinite(r) and abs(r)>best: best=abs(r); bn=o
        rows.append((best,c,bn))
    rows.sort(reverse=True)
    print("%-18s %-20s %8.2f %-16s   (rata2 keluarga %.2f)" % (fam, rows[0][1], rows[0][0], rows[0][2],
          np.mean([r[0] for r in rows])))

# ---- (b) kenaikan AUC: LAMA34 vs LAMA34 + keluarga
print("\n## Kenaikan AUC di atas 34 fitur lama (latih LAMA -> uji m1 & m2)")
base = {}
Xb = df[OLD].fillna(-1).values
mb = cb(Xb[lama], y[lama]); sb = mb.predict_proba(Xb)[:,1]
a1b, a2b = auc(y[m1], sb[m1]), auc(y[m2], sb[m2])
print("dasar LAMA34: AUC m1 %.3f | m2 %.3f" % (a1b, a2b))
print("%-18s %8s %8s" % ("+keluarga","d AUC m1","d AUC m2"))
for fam, cols in FAM.items():
    X = df[OLD+cols].fillna(-1).values
    m = cb(X[lama], y[lama]); s = m.predict_proba(X)[:,1]
    print("%-18s %+8.3f %+8.3f" % (fam, auc(y[m1],s[m1])-a1b, auc(y[m2],s[m2])-a2b))

# ---- (c) skor jalur roket untuk arena (rata2 3 seed, latih HANYA di LAMA)
NEW = [c for cs in FAM.values() for c in cs]
X = df[OLD+NEW].fillna(-1).values
sc = np.zeros(len(df))
for sd in range(3):
    sc += cb(X[lama], y[lama], sd).predict_proba(X)[:,1]
sc /= 3
df["moon12"] = sc
print("\nAUC skor jalur roket (3 seed): m1 %.3f | m2 %.3f" % (auc(y[m1],sc[m1]), auc(y[m2],sc[m2])))
rng = np.random.default_rng(1); ysh = y[m1|m2].copy(); rng.shuffle(ysh)
print("kontrol label diacak: %.3f" % auc(ysh, sc[m1|m2]))
df[["ds","pool","moon12"]].to_csv(os.path.join(K,"moon12.csv"), index=False)

# gabungkan ke arena_scored
ar = pd.read_csv(r"C:\Users\horii\rhc-quant\rhc_vps\data\arena_scored.csv")
ar = ar.merge(df[["pool","moon12"]], on="pool", how="left")
ar["moon"] = ar["moon12"]; ar = ar.drop(columns=["moon12"])
ar.to_csv(os.path.join(K,"arena_scored_12.csv"), index=False)
print("-> arena_scored_12.csv (kolom moon = skor jalur roket Agent 12)")
