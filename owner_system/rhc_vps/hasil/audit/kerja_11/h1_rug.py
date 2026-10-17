# Agent 11 - apakah rug (ret<0,3) bisa dikenali di menit-1? skor filter kausal vs model rug khusus (latih sebelum m1, uji m1+m2).
import json, numpy as np, pandas as pd, os
from catboost import CatBoostClassifier
from sklearn.metrics import roc_auc_score
os.chdir(os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..", ".."))
FE = json.load(open("bot/filter_cat.json"))["feats"]
df = pd.read_csv("data/arena_scored.csv").sort_values("decide").reset_index(drop=True)
t0 = np.where(df.ds.values == "m1")[0][0]
tr = np.where(df["exit"].values < df.decide.values[t0])[0]; te = np.arange(t0, len(df))
rug = (df.ret.values < 0.3)
X = df[FE].fillna(-1).values
print("rug rate latih", rug[tr].mean().round(3), "uji", rug[te].mean().round(3))
s = df.score.values[te]; ok = ~np.isnan(s)
print("AUC skor filter (kausal) utk TIDAK-rug di m1+m2:", round(roc_auc_score(~rug[te][ok], s[ok]), 3))
m = CatBoostClassifier(iterations=200, learning_rate=0.05, depth=4, l2_leaf_reg=5.0, random_seed=0, verbose=0, allow_writing_files=False, thread_count=1).fit(X[tr], rug[tr])
p = m.predict_proba(X[te])[:, 1]
print("AUC model rug khusus (latih pra-m1) di m1+m2:", round(roc_auc_score(rug[te], p), 3))
D = pd.DataFrame(json.load(open("hasil/audit/kerja_11/dec_base.json")))
b = np.isin(df.pool.values[te], D[D.why == "beli"].pool.values)
print("di antara koin DIBELI m1+m2:", b.sum(), "rug", rug[te][b].sum(), "| AUC model rug di antara yg dibeli:", round(roc_auc_score(rug[te][b], p[b]), 3))
thr = np.quantile(m.predict_proba(X[tr])[:, 1], 0.9)   # ambang dipilih di data latih (kuantil 90% skor rug latih)
k = p[b] >= thr
print(f"aturan 'lewati bila p_rug >= kuantil-90 latih ({thr:.3f})': lewati {k.sum()} dari {b.sum()} dibeli, rug di yg dilewati {rug[te][b][k].sum()}, ret rata2 yg dilewati {df.ret.values[te][b][k].mean():.3f} vs sisa {df.ret.values[te][b][~k].mean():.3f}")
