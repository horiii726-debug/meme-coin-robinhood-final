"""Which ML model makes the best ENTRY filter? Same data, same features, same label, no tuning on the test set.

Train: arena_feats.csv (2,797 coins, 2 Aug - 17 Sep; exactly what the official filter was trained on).
Test : every candidate coin in the new windows (features from feat_dump, label = v4 trade ret > 1).
Metrics: AUC, mean return of each model's top 10% / 20% per window, inference time per coin,
         and a continuous $100 account run with each model's scores (QTHR 0.90 and 0.80).
Usage: python models_compare.py <window> [...]
"""
import json
import os
import re
import subprocess
import sys
import time
from pathlib import Path

import numpy as np
import pandas as pd
from sklearn.metrics import roc_auc_score

WORK = Path("/tmp/claude-0/-root/af19755f-534a-4afa-9b0b-1adc352c44c6/scratchpad/rhc_work")
REPO = Path("/tmp/claude-0/-root/af19755f-534a-4afa-9b0b-1adc352c44c6/scratchpad/repo/horiii-debug")
BOT = REPO / "rhc_vps/bot"
LIVE = REPO / "rust/rhc-live/target/release/rhc-live"
FEATS = json.loads((BOT / "filter_cat.json").read_text())["feats"]
LINE = re.compile(r"beli (\d+) \| tutup (\d+) \| win ([\d.]+)% \| PF ([\d.inf]+) \| akun \$([\d.]+) -> \$([\d.]+) \| DD maks ([\d.]+)%")
WINDOWS = {l.split()[0]: (int(l.split()[1]), int(l.split()[2])) for l in (WORK / "windows.txt").read_text().splitlines() if l.strip()}


def models():
    from catboost import CatBoostClassifier
    from lightgbm import LGBMClassifier
    from sklearn.ensemble import ExtraTreesClassifier, HistGradientBoostingClassifier, RandomForestClassifier
    from sklearn.linear_model import LogisticRegression
    from sklearn.pipeline import make_pipeline
    from sklearn.preprocessing import StandardScaler
    from xgboost import XGBClassifier
    return {
        "CatBoost (system params)": CatBoostClassifier(iterations=200, learning_rate=0.05, depth=4, l2_leaf_reg=5.0, random_seed=0, verbose=0, allow_writing_files=False),
        "CatBoost (bigger)": CatBoostClassifier(iterations=600, learning_rate=0.03, depth=6, l2_leaf_reg=5.0, random_seed=0, verbose=0, allow_writing_files=False),
        "XGBoost": XGBClassifier(n_estimators=400, learning_rate=0.03, max_depth=4, subsample=0.8, colsample_bytree=0.8, min_child_weight=5, reg_lambda=5.0, n_jobs=16, random_state=0),
        "LightGBM": LGBMClassifier(n_estimators=400, learning_rate=0.03, num_leaves=15, min_child_samples=30, subsample=0.8, subsample_freq=1, colsample_bytree=0.8, reg_lambda=5.0, n_jobs=16, random_state=0, verbose=-1),
        "HistGradientBoosting": HistGradientBoostingClassifier(max_iter=300, learning_rate=0.05, max_leaf_nodes=15, min_samples_leaf=30, l2_regularization=5.0, random_state=0),
        "RandomForest": RandomForestClassifier(n_estimators=500, min_samples_leaf=10, max_features="sqrt", n_jobs=16, random_state=0),
        "ExtraTrees": ExtraTreesClassifier(n_estimators=500, min_samples_leaf=10, max_features="sqrt", n_jobs=16, random_state=0),
        "LogisticRegression": make_pipeline(StandardScaler(), LogisticRegression(C=0.5, max_iter=2000)),
    }


def load_test(wins):
    rows = []
    for w in wins:
        d = WORK / "data" / w
        ret = {}
        for l in (d / "trades.jsonl").read_text().splitlines():
            t = json.loads(l)
            if t["plan"] == "v4":
                ret[t["pool"]] = t["ret"]
        for l in (d / "features.jsonl").read_text().splitlines():
            j = json.loads(l)
            if j["pool"] in ret:
                rows.append({"window": w, "pool": j["pool"], "ret": ret[j["pool"]],
                             **{k: (float(v) if not isinstance(v, str) else np.nan) for k, v in j["f"].items() if k in FEATS}})
    return pd.DataFrame(rows)


def prep(df):
    return np.clip(df[FEATS].replace([np.inf, -np.inf], np.nan).fillna(-1).values.astype(float), -1e30, 1e30)


def official_scores(wins):
    s = {}
    for w in wins:
        for l in (WORK / "chain" / "official" / f"{w}.jsonl.skor.csv").read_text().splitlines()[1:]:
            p, v = l.split(",")
            s[(w, p)] = float(v)
    return s


def chain(score_tag, wins, thr0, qthr):
    env = {**os.environ, "MAX_POS": "10", "QTHR": qthr}
    tmp = WORK / "mc_tmp" / f"{score_tag}_{qthr}".replace(" ", "_").replace("(", "").replace(")", "")
    tmp.mkdir(parents=True, exist_ok=True)
    prev, m, dd = None, None, 0.0
    for w in wins:
        a, b = WINDOWS[w]
        args = [str(LIVE), "sim", str(WORK / "data" / w), str(a), str(b), str(tmp / f"{w}.jsonl"), "--bot", str(BOT),
                "--skor", str(WORK / "data" / w / f"mscore_{score_tag}.csv"), "--thr0", f"{thr0:.6f}", "--akun-out", str(tmp / f"{w}_a.json")]
        if prev:
            args += ["--akun-in", str(prev)]
        r = subprocess.run(args, capture_output=True, text=True, env=env)
        m = LINE.search(r.stdout)
        if not m:
            return None
        dd = max(dd, float(m[7]))
        prev = tmp / f"{w}_a.json"
    return float(m[6]), dd, int(m[1])


def main():
    wins = sys.argv[1:]
    tr = pd.read_csv(REPO / "rhc_vps/data/arena_feats.csv")
    Xtr, ytr = prep(tr), tr.win.values.astype(int)
    te = load_test(wins)
    Xte, yte = prep(te), (te.ret.values > 1).astype(int)
    print(f"train {len(tr)} coins (Aug 2 - Sep 17) | test {len(te)} coins in {wins}\n", flush=True)
    res, scores = [], {}
    off = official_scores(wins)
    scores["Official frozen model"] = (np.array([off.get((w, p), np.nan) for w, p in zip(te.window, te.pool)]), float(json.loads((BOT / "filter_cat.json").read_text())["thr_start"]), 0.0, 0.0)
    for name, m in models().items():
        t0 = time.perf_counter()
        m.fit(Xtr, ytr)
        fit_s = time.perf_counter() - t0
        t0 = time.perf_counter()
        for _ in range(200):
            m.predict_proba(Xte[:1])
        one_ms = (time.perf_counter() - t0) / 200 * 1e3
        p = m.predict_proba(Xte)[:, 1]
        thr0 = float(np.quantile(m.predict_proba(Xtr)[:, 1], 0.90))
        scores[name] = (p, thr0, fit_s, one_ms)
        print(f"  trained {name} in {fit_s:.1f} s", flush=True)
    # ensemble of the three boosted libraries (mean rank)
    rk = lambda v: pd.Series(v).rank(pct=True).values
    ens = (rk(scores["CatBoost (system params)"][0]) + rk(scores["XGBoost"][0]) + rk(scores["LightGBM"][0])) / 3
    scores["Ensemble Cat+XGB+LGBM"] = (ens, 0.9, 0.0, 0.0)
    for name, (p, thr0, fit_s, one_ms) in scores.items():
        ok = np.isfinite(p)
        top = {}
        for q in (0.10, 0.20):
            vals = []
            for w in wins:
                g = (te.window.values == w) & ok
                k = max(1, int(round(q * g.sum())))
                idx = np.where(g)[0][np.argsort(-p[g])[:k]]
                vals.append(te.ret.values[idx].mean())
            top[q] = float(np.mean(vals))
        tag = re.sub(r"[^A-Za-z0-9]+", "_", name)
        for w in wins:
            g = te.window.values == w
            pd.DataFrame({"pool": te.pool.values[g], "score": np.where(np.isfinite(p[g]), p[g], np.nan)}).to_csv(WORK / "data" / w / f"mscore_{tag}.csv", index=False)
        acc = {q: chain(tag, wins, thr0, q) for q in ("0.90", "0.80")}
        r = {"model": name, "auc": float(roc_auc_score(yte[ok], p[ok])), "top10_ret": top[0.10], "top20_ret": top[0.20],
             "fit_s": fit_s, "predict_ms": one_ms,
             "acct_q90": acc["0.90"] and acc["0.90"][0], "dd_q90": acc["0.90"] and acc["0.90"][1],
             "acct_q80": acc["0.80"] and acc["0.80"][0], "dd_q80": acc["0.80"] and acc["0.80"][1]}
        res.append(r)
        print(f"{name:26s} AUC {r['auc']:.3f} | top10% {r['top10_ret']:.3f}x top20% {r['top20_ret']:.3f}x | "
              f"$100 -> ${r['acct_q90'] or 0:>10,.0f} (DD {r['dd_q90'] or 0:4.1f}%) @top10%  ${r['acct_q80'] or 0:>10,.0f} (DD {r['dd_q80'] or 0:4.1f}%) @top20% | "
              f"predict {one_ms:.3f} ms", flush=True)
    base = float(te.ret.mean())
    (WORK / "models_compare.json").write_text(json.dumps({"train_n": len(tr), "test_n": len(te), "windows": wins, "base_ret": base, "rows": res}, indent=1))
    print(f"\nbaseline (buy every candidate): mean ret {base:.3f}x")


if __name__ == "__main__":
    main()
