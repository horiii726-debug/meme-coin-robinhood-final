# Agent 3 (Leakage Auditor). Replikasi arena_score.py (kausal) + cek programatik + label diacak.
# Hipotesis H2: kalau tidak ada kebocoran, AUC dengan label diacak ~0,50 (+-0,03).
# Hipotesis H3: tiap model hanya dilatih dari baris dengan exit < decide koin yang dinilai.
# Jalankan dari folder ini:  python uji_label_acak.py
import json, sys, numpy as np, pandas as pd
from catboost import CatBoostClassifier
from sklearn.metrics import roc_auc_score
ROOT = "../../.."
FE = json.load(open(f"{ROOT}/bot/filter_cat.json"))["feats"]
df = pd.read_csv(f"{ROOT}/data/arena_feats.csv").sort_values("decide").reset_index(drop=True)
X = df[FE].fillna(-1).values
decide = df.decide.values; exitb = df["exit"].values; ds = df.ds.values
RETRAIN, MINSTART = 100, 60
NSEED = int(sys.argv[1]) if len(sys.argv) > 1 else 5

def causal(y, log=None):
    n = len(df); score = np.full(n, np.nan); model = None; dil = 0; viol = 0; ntrain = 0
    for i in range(n):
        siap = exitb < decide[i]; ns = int(siap.sum())
        if ns >= MINSTART and (model is None or ns - dil >= RETRAIN):
            idx = np.where(siap)[0]
            if len(set(y[idx])) > 1:
                model = CatBoostClassifier(iterations=200, learning_rate=0.05, depth=4, l2_leaf_reg=5.0, random_seed=0,
                                           verbose=0, allow_writing_files=False, thread_count=2)
                model.fit(X[idx], y[idx]); dil = ns; ntrain += 1
                train_max_exit = exitb[idx].max()
                if log is not None: log.append((i, int(decide[i]), int(train_max_exit), len(idx)))
        if model is not None:
            score[i] = model.predict_proba(X[i:i+1])[:, 1][0]
            # cek: semua baris latih model yang dipakai harus sudah tutup sebelum koin ini diputuskan
            if log and log[-1][2] >= decide[i]: viol += 1
    return score, viol, ntrain

def auc(y, s, mask=None):
    m = ~np.isnan(s) if mask is None else (~np.isnan(s) & mask)
    return roc_auc_score(y[m], s[m]) if len(set(y[m])) > 1 else np.nan

y = df.win.values.astype(int)
log = []
s, viol, nt = causal(y, log)
ref = pd.read_csv(f"{ROOT}/data/arena_scored.csv").sort_values("decide").reset_index(drop=True)
same = np.nanmax(np.abs(ref.score.values - s))
out = {"n": len(df), "retrain": nt, "pelanggaran_exit_ge_decide": viol,
       "selisih_maks_vs_arena_scored": float(same), "auc_kausal_semua": auc(y, s)}
# baris latih yang ikut padahal masih terbuka?  (harus 0)
out["baris_latih_masih_buka"] = int(sum(1 for (i, d, mx, n_) in log if mx >= d))
for p in ["u_ds5d", "u_ds24", "m1", "m2"]:
    out[f"auc_kausal_{p}"] = auc(y, s, ds == p)
# AUC top-10% (setara QTHR 0,90): win-rate koin berskor >= kuantil 0,9 bergulir tidak diulang di sini; laporkan global
# Uji label diacak: permutasi global label, alur kausal sama persis
rng = np.random.RandomState(123); aucs = []
for k in range(NSEED):
    yp = rng.permutation(y)
    sp_, _, _ = causal(yp)
    aucs.append(auc(yp, sp_))
out["auc_label_acak"] = aucs
out["auc_label_acak_rata2"] = float(np.mean(aucs)); out["auc_label_acak_sd"] = float(np.std(aucs))
print(json.dumps(out, indent=1, default=float))
json.dump(out, open("hasil_label_acak.json", "w"), indent=1, default=float)
