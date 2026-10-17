import numpy as np, pandas as pd, json, sys, os
from catboost import CatBoostClassifier
FE = json.load(open("../../../bot/filter_cat.json"))["feats"]
V = sys.argv[1]
df = pd.read_csv("feats_%s.csv" % V).sort_values("decide").reset_index(drop=True)
X = df[FE].fillna(-1).values
y = df.win.values.astype(bool)
decide = df.decide.values
exitb = df["exit"].values
n = len(df)
score = np.full(n, np.nan)
model = None
dilatih = 0
nl = 0
for i in range(n):
    siap = exitb < decide[i]
    ns = int(siap.sum())
    if ns >= 60 and (model is None or ns - dilatih >= 100):
        idx = np.where(siap)[0]
        if len(set(y[idx])) > 1:
            model = CatBoostClassifier(iterations=200, learning_rate=0.05, depth=4, l2_leaf_reg=5.0,
                                       random_seed=0, verbose=0, allow_writing_files=False, thread_count=1)
            model.fit(X[idx], y[idx])
            dilatih = ns
            nl += 1
    if model is not None:
        score[i] = model.predict_proba(X[i:i + 1])[:, 1][0]
df["score"] = score
df.to_csv("scored_%s.csv" % V, index=False)
print("%s: latih %dx | berskor %d/%d" % (V, nl, int((~np.isnan(score)).sum()), n))
