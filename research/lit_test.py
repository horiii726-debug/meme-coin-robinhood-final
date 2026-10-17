"""Do the literature features add predictive value on real data? Time-split test, both directions.

Fold A: train on early windows, test on late windows. Fold B: the reverse.
Feature sets: BASE (system's 34) | BASE + all literature features | BASE + each literature feature alone.
Models: CatBoost (system params) and LightGBM. Metrics on the test windows: AUC (ret > 1) and mean ret of top 10% / 20%.
Usage: python lit_test.py <early windows comma> <late windows comma>
"""
import json
import sys
from pathlib import Path

import numpy as np
import pandas as pd
from sklearn.metrics import roc_auc_score

sys.path.insert(0, str(Path(__file__).parent))
from lit_features import LIT_FEATS, window_features  # noqa: E402

WORK = Path("/tmp/claude-0/-root/af19755f-534a-4afa-9b0b-1adc352c44c6/scratchpad/rhc_work")
BOT = Path("/tmp/claude-0/-root/af19755f-534a-4afa-9b0b-1adc352c44c6/scratchpad/repo/horiii-debug/rhc_vps/bot")
BASE = json.loads((BOT / "filter_cat.json").read_text())["feats"]


def load(wins):
    rows = []
    for w in wins:
        d = WORK / "data" / w
        ret = {json.loads(l)["pool"]: json.loads(l)["ret"] for l in (d / "trades.jsonl").read_text().splitlines() if '"plan":"v4"' in l}
        lit = window_features(d)
        for l in (d / "features.jsonl").read_text().splitlines():
            j = json.loads(l)
            p = j["pool"]
            if p in ret:
                base = {k: (float(v) if not isinstance(v, str) else np.nan) for k, v in j["f"].items() if k in BASE}
                rows.append({"window": w, "pool": p, "ret": ret[p], **base, **lit.get(p, dict.fromkeys(LIT_FEATS, np.nan))})
    return pd.DataFrame(rows)


def X(df, cols):
    return np.clip(df[cols].replace([np.inf, -np.inf], np.nan).fillna(-1).values.astype(float), -1e30, 1e30)


def fit_score(kind, tr, te, cols):
    if kind == "catboost":
        from catboost import CatBoostClassifier
        m = CatBoostClassifier(iterations=200, learning_rate=0.05, depth=4, l2_leaf_reg=5.0, random_seed=0, verbose=0, allow_writing_files=False)
    else:
        from lightgbm import LGBMClassifier
        m = LGBMClassifier(n_estimators=400, learning_rate=0.03, num_leaves=15, min_child_samples=30, subsample=0.8, subsample_freq=1,
                           colsample_bytree=0.8, reg_lambda=5.0, n_jobs=16, random_state=0, verbose=-1)
    m.fit(X(tr, cols), (tr.ret > 1).astype(int))
    return m.predict_proba(X(te, cols))[:, 1]


def metrics(te, s):
    y = (te.ret.values > 1).astype(int)
    out = {"auc": roc_auc_score(y, s)}
    for q in (0.10, 0.20):
        vals = []
        for w in te.window.unique():
            g = te.window.values == w
            k = max(1, int(round(q * g.sum())))
            vals.append(te.ret.values[np.where(g)[0][np.argsort(-s[g])[:k]]].mean())
        out[f"top{int(q * 100)}"] = float(np.mean(vals))
    return out


def main():
    early, late = sys.argv[1].split(","), sys.argv[2].split(",")
    data = load(early + late)
    print(f"coins: {len(data)} | literature features non-missing share:",
          {k: round(float(data[k].notna().mean()), 2) for k in LIT_FEATS}, "\n", flush=True)
    # univariate check: rank correlation of each literature feature with return, per fold window set
    print("Univariate Spearman corr with trade return (early | late):")
    for k in LIT_FEATS:
        a = data[data.window.isin(early)][[k, "ret"]].corr("spearman").iloc[0, 1]
        b = data[data.window.isin(late)][[k, "ret"]].corr("spearman").iloc[0, 1]
        print(f"  {k:14s} {a:+.3f} | {b:+.3f}{'   (same sign both periods)' if np.sign(a) == np.sign(b) and abs(a) > 0.03 and abs(b) > 0.03 else ''}")
    sets = {"BASE (34 system features)": BASE, "BASE + ALL literature": BASE + LIT_FEATS,
            **{f"BASE + {k}": BASE + [k] for k in LIT_FEATS}, "literature ONLY": LIT_FEATS}
    res = []
    for kind in ("catboost", "lightgbm"):
        for name, cols in sets.items():
            ms = []
            for tr_w, te_w in ((early, late), (late, early)):
                tr, te = data[data.window.isin(tr_w)], data[data.window.isin(te_w)]
                ms.append(metrics(te, fit_score(kind, tr, te, cols)))
            avg = {k: float(np.mean([m[k] for m in ms])) for k in ms[0]}
            res.append({"model": kind, "features": name, **avg, "auc_folds": [m["auc"] for m in ms]})
            print(f"{kind:9s} {name:28s} AUC {avg['auc']:.4f} (folds {ms[0]['auc']:.3f}/{ms[1]['auc']:.3f}) | top10% {avg['top10']:.3f}x | top20% {avg['top20']:.3f}x", flush=True)
    (WORK / "lit_test.json").write_text(json.dumps(res, indent=1))


if __name__ == "__main__":
    main()
