# Agent 11 - skema belajar ulang filter beli, diuji di m1+m2 (semua kausal: label hanya dari koin yang exit < decide).
#  A  arena      : latih ulang tiap 100 koin tutup, dari SEMUA koin (termasuk ditolak; label kontrafaktual)
#  B  bot live   : basis = semua koin sebelum m1 (isi arena_feats saat bot mulai), lalu HANYA koin yang lolos filter bot
#                  (skor >= kuantil 0,90 dari 100 skor terakhir) ditambahkan saat tutup; latih ulang tiap 100 trade tutup (RETRAIN_TIAP)
#  B20: sama dengan B tapi latih ulang tiap 20 trade tutup
#  F  beku       : satu model dari semua koin sebelum m1, tidak pernah dilatih ulang
#  (Skema C = B + label koin ditolak yang dihitung setelah koin tutup = identik dengan A, asalkan bot menyimpan swap koin ditolak.)
# Hipotesis H1b: B dan F lebih buruk dari A (AUC & ret top-10%), karena B hanya melihat koin skor tinggi (bias seleksi).
import json, numpy as np, pandas as pd, os
from catboost import CatBoostClassifier
from sklearn.metrics import roc_auc_score
os.chdir(os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..", ".."))
FE = json.load(open("bot/filter_cat.json"))["feats"]
df = pd.read_csv("data/arena_feats.csv").sort_values("decide").reset_index(drop=True)
X = df[FE].fillna(-1).values; y = (df.win.values == 1); ret = df.ret.values; dec = df.decide.values; ex = df["exit"].values
def fit(idx):
    m = CatBoostClassifier(iterations=200, learning_rate=0.05, depth=4, l2_leaf_reg=5.0, random_seed=0, verbose=0, allow_writing_files=False, thread_count=1)
    m.fit(X[idx], y[idx]); return m
t0 = np.where(df.ds.values == "m1")[0][0]
base = np.where(ex < dec[t0])[0]
test = np.arange(t0, len(df))
def run(scheme, every):
    model = fit(base); train = set(base.tolist()); added = 0; recent = []; score = np.full(len(df), np.nan); passed = set(); nfit = 1
    for i in test:
        if scheme != "F":
            if scheme == "A":
                cand = [j for j in np.where(ex < dec[i])[0] if j not in train]
            else:
                cand = [j for j in passed if ex[j] < dec[i] and j not in train]
            if cand:
                train.update(cand); added += len(cand)
            if added >= every:
                model = fit(np.array(sorted(train))); added = 0; nfit += 1
        s = model.predict_proba(X[i:i + 1])[0, 1]; score[i] = s
        recent.append(s); recent = recent[-100:]
        thr = np.quantile(recent, 0.90, method="lower") if len(recent) >= 30 else 0.195
        if s >= sorted(recent)[min(len(recent) - 1, int(0.9 * len(recent)))] if len(recent) >= 30 else s >= 0.195:
            passed.add(i)
    return score, passed, nfit
out = []
for nm, sch, ev in [("A_arena", "A", 100), ("B_bot_live", "B", 100), ("B20", "B", 20), ("F_beku", "F", 10**9)]:
    sc, ps, nfit = run(sch, ev)
    for ds in ["m1", "m2", "m1+m2"]:
        te = test[np.isin(df.ds.values[test], ["m1", "m2"] if ds == "m1+m2" else [ds])]
        pp = np.array(sorted(i for i in ps if i in set(te)))
        out.append(dict(skema=nm, latih=nfit, ds=ds, auc=roc_auc_score(y[te], sc[te]), n_lolos=len(pp), win_lolos=y[pp].mean(),
                        ret_lolos=ret[pp].mean(), rug_lolos=(ret[pp] < 0.3).mean(), ret_semua=ret[te].mean()))
    print(nm, "selesai", flush=True)
R = pd.DataFrame(out); pd.set_option("display.width", 250)
print(R.round(3).to_string()); R.to_csv("hasil/audit/kerja_11/b2_skema.csv", index=False)
