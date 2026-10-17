# Agent 11 - (5a) seberapa penting fitur tekanan beli/jual di filter beli. Model dilatih dari koin yang tutup sebelum m1,
# diuji di m1+m2 (out-of-sample): permutation importance (turunnya AUC) + ablasi grup (latih ulang tanpa grup).
import json, numpy as np, pandas as pd, os
from catboost import CatBoostClassifier
from sklearn.metrics import roc_auc_score
os.chdir(os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..", ".."))
FE = json.load(open("bot/filter_cat.json"))["feats"]
df = pd.read_csv("data/arena_feats.csv").sort_values("decide").reset_index(drop=True)
t0 = np.where(df.ds.values == "m1")[0][0]
tr = np.where(df["exit"].values < df.decide.values[t0])[0]; te = np.arange(t0, len(df))
y = (df.win.values == 1)
PRESS = ["n_buy", "n_sell", "buy_usd", "sell_usd", "flow_lp", "kyle_lambda", "lam_buy", "lam_sell", "n_buyers", "n_sellers"]
def fit(fe):
    m = CatBoostClassifier(iterations=200, learning_rate=0.05, depth=4, l2_leaf_reg=5.0, random_seed=0, verbose=0, allow_writing_files=False, thread_count=1)
    X = df[fe].fillna(-1).values; m.fit(X[tr], y[tr]); return m, roc_auc_score(y[te], m.predict_proba(X[te])[:, 1])
m, auc0 = fit(FE); X = df[FE].fillna(-1).values
print("latih", len(tr), "uji", len(te), "| AUC uji m1+m2", round(auc0, 3))
rng = np.random.RandomState(0); imp = []
for j, f in enumerate(FE):
    d = []
    for r in range(3):
        Xp = X[te].copy(); Xp[:, j] = rng.permutation(Xp[:, j]); d.append(auc0 - roc_auc_score(y[te], m.predict_proba(Xp)[:, 1]))
    imp.append((f, np.mean(d), f in PRESS))
I = pd.DataFrame(imp, columns=["fitur", "turun_auc", "tekanan"]).sort_values("turun_auc", ascending=False)
print(I.head(12).round(4).to_string(index=False))
print("fitur tekanan:", I[I.tekanan].round(4).to_string(index=False))
_, a1 = fit([f for f in FE if f not in PRESS]); print("ABLASI: tanpa 10 fitur tekanan AUC", round(a1, 3), "vs penuh", round(auc0, 3))
_, a2 = fit(PRESS); print("HANYA fitur tekanan AUC", round(a2, 3))
I.to_csv("hasil/audit/kerja_11/b4_penting.csv", index=False)
