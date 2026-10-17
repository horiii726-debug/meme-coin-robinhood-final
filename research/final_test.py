"""FINAL exam on untouched October data (w06-w13). Every candidate was chosen using September only.

Candidates (entry filter scores) -> $100 account over October with official settings, QTHR 0.90 and 0.80:
  official   frozen production model (trained to 17 Sep)
  lgbm_arena LightGBM on the official training set (arena_feats, Aug-Sep 17)
  ens_arena  rank-average CatBoost+XGBoost+LightGBM on arena_feats
  cat_sep    CatBoost, 34 base features, trained on September windows w00-w05 (labels closed before October)
  cat_sep_lit  same + 4 literature features that kept the same sign in both September halves
  lgbm_sep_lit LightGBM, same data as cat_sep_lit
Also: official model with the September-tuned settings (best of tune set A).
Usage: python final_test.py
"""
import json
import os
import re
import subprocess
import sys
from pathlib import Path

import numpy as np
import pandas as pd
from sklearn.metrics import roc_auc_score

sys.path.insert(0, str(Path(__file__).parent))
from lit_test import load, X, BASE  # noqa: E402

WORK = Path("/tmp/claude-0/-root/af19755f-534a-4afa-9b0b-1adc352c44c6/scratchpad/rhc_work")
REPO = Path("/tmp/claude-0/-root/af19755f-534a-4afa-9b0b-1adc352c44c6/scratchpad/repo/horiii-debug")
BOT = REPO / "rhc_vps/bot"
LIVE = REPO / "rust/rhc-live/target/release/rhc-live"
LINE = re.compile(r"beli (\d+) \| tutup (\d+) \| win ([\d.]+)% \| PF ([\d.inf]+) \| akun \$([\d.]+) -> \$([\d.]+) \| DD maks ([\d.]+)%")
WIN = {l.split()[0]: (int(l.split()[1]), int(l.split()[2])) for l in (WORK / "windows.txt").read_text().splitlines() if l.strip()}
SEP = ["w00", "w01", "w02", "w03", "w04", "w05"]
OCT = ["w06", "w07", "w08", "w09", "w10", "w11", "w12", "w13"]
LIT4 = ["accel", "trader_growth", "amihud", "sniper_share"]
TUNED = {"QTHR": "0.80", "MAX_POS": "10", "DANGER_TH": "0.5", "TRAIL_PUNCAK": "0.4", "TUTUP_SAAT_RUG": "1", "DUMP_FRAC": "0.05", "KELLY_MAKS": "0.15"}


def models_arena():
    from catboost import CatBoostClassifier
    from lightgbm import LGBMClassifier
    from xgboost import XGBClassifier
    return {
        "cat": lambda: CatBoostClassifier(iterations=200, learning_rate=0.05, depth=4, l2_leaf_reg=5.0, random_seed=0, verbose=0, allow_writing_files=False),
        "lgbm": lambda: LGBMClassifier(n_estimators=400, learning_rate=0.03, num_leaves=15, min_child_samples=30, subsample=0.8, subsample_freq=1,
                                       colsample_bytree=0.8, reg_lambda=5.0, n_jobs=16, random_state=0, verbose=-1),
        "xgb": lambda: XGBClassifier(n_estimators=400, learning_rate=0.03, max_depth=4, subsample=0.8, colsample_bytree=0.8, min_child_weight=5,
                                     reg_lambda=5.0, n_jobs=16, random_state=0),
    }


def chain(tag, wins, env_extra, thr0, score_file=None):
    env = {**os.environ, "MAX_POS": "10", **env_extra}
    tmp = WORK / "final_tmp" / tag
    tmp.mkdir(parents=True, exist_ok=True)
    prev, m, dd, rows = None, None, 0.0, []
    for w in wins:
        a, b = WIN[w]
        args = [str(LIVE), "sim", str(WORK / "data" / w), str(a), str(b), str(tmp / f"{w}.jsonl"), "--bot", str(BOT), "--akun-out", str(tmp / f"{w}_a.json")]
        if score_file:
            args += ["--skor", str(WORK / "data" / w / score_file), "--thr0", f"{thr0:.6f}"]
        if prev:
            args += ["--akun-in", str(prev)]
        r = subprocess.run(args, capture_output=True, text=True, env=env)
        m = LINE.search(r.stdout)
        if not m:
            return None
        dd = max(dd, float(m[7]))
        rows.append({"window": w, "end": float(m[6])})
        prev = tmp / f"{w}_a.json"
    return {"end": float(m[6]), "dd": dd, "trades": int(m[1]), "path": rows}


def main():
    te = load(OCT)
    sep = load(SEP)
    exit_blk = {}
    for w in SEP:
        for l in (WORK / "data" / w / "trades.jsonl").read_text().splitlines():
            if '"plan":"v4"' in l:
                t = json.loads(l)
                exit_blk[t["pool"]] = t["exitBlk"]
    oct_start = WIN["w06"][0]
    sep = sep[[exit_blk.get(p, 1e18) < oct_start for p in sep.pool]]          # label known before October
    arena = pd.read_csv(REPO / "rhc_vps/data/arena_feats.csv")
    print(f"train: arena {len(arena)} coins, September {len(sep)} coins | test October {len(te)} coins", flush=True)
    M = models_arena()
    scores, thr = {}, {}

    def fit(kind, df, ycol, cols):
        m = M[kind]()
        y = df.win.values if ycol == "win" else (df.ret.values > 1).astype(int)
        m.fit(X(df, cols), y)
        return m.predict_proba(X(te, cols))[:, 1], m.predict_proba(X(df, cols))[:, 1]

    off = {}
    for w in OCT:
        for l in (WORK / "data" / w / "sim_official.jsonl.skor.csv").read_text().splitlines()[1:]:
            p, v = l.split(",")
            off[(w, p)] = float(v)
    scores["official"] = np.array([off.get((w, p), np.nan) for w, p in zip(te.window, te.pool)])
    thr["official"] = float(json.loads((BOT / "filter_cat.json").read_text())["thr_start"])
    pr = {}
    for k in ("cat", "lgbm", "xgb"):
        pr[k] = fit(k, arena, "win", BASE)
    scores["lgbm_arena"], thr["lgbm_arena"] = pr["lgbm"][0], float(np.quantile(pr["lgbm"][1], 0.9))
    rk = lambda v: pd.Series(v).rank(pct=True).values
    scores["ens_arena"], thr["ens_arena"] = (rk(pr["cat"][0]) + rk(pr["lgbm"][0]) + rk(pr["xgb"][0])) / 3, 0.9
    for name, kind, cols in (("cat_sep", "cat", BASE), ("cat_sep_lit", "cat", BASE + LIT4), ("lgbm_sep_lit", "lgbm", BASE + LIT4)):
        s, tr_s = fit(kind, sep, "ret", cols)
        scores[name], thr[name] = s, float(np.quantile(tr_s, 0.9))
    y = (te.ret.values > 1).astype(int)
    res = {}
    for name, s in scores.items():
        ok = np.isfinite(s)
        top = []
        for w in OCT:
            g = (te.window.values == w) & ok
            k = max(1, int(round(0.1 * g.sum())))
            top.append(te.ret.values[np.where(g)[0][np.argsort(-s[g])[:k]]].mean())
        for w in OCT:
            g = te.window.values == w
            pd.DataFrame({"pool": te.pool.values[g], "score": s[g]}).to_csv(WORK / "data" / w / f"fscore_{name}.csv", index=False)
        r = {"auc": float(roc_auc_score(y[ok], s[ok])), "top10_ret": float(np.mean(top))}
        for q in ("0.90", "0.80"):
            t0 = thr[name] if q == "0.90" else thr[name] * 0.97
            r[f"acct_{q}"] = chain(f"{name}_{q}", OCT, {"QTHR": q}, t0, f"fscore_{name}.csv")
        res[name] = r
        a9, a8 = r["acct_0.90"], r["acct_0.80"]
        print(f"{name:13s} AUC {r['auc']:.3f} top10% {r['top10_ret']:.3f}x | $100 -> ${a9['end']:>10,.0f} DD {a9['dd']:4.1f}% @top10% | "
              f"${a8['end']:>10,.0f} DD {a8['dd']:4.1f}% @top20%", flush=True)
    base = float(te.ret.mean())
    res["official_frozen_native"] = chain("official_native", OCT, {}, 0)
    res["official_tuned_settings"] = chain("official_tuned", OCT, TUNED, 0)
    res["official_full_sep_oct"] = chain("official_full", SEP + OCT, {}, 0)
    print(f"\nofficial model, its own scorer (production path): $100 -> ${res['official_frozen_native']['end']:,.0f} DD {res['official_frozen_native']['dd']:.1f}%")
    print(f"official model + September-tuned settings:        $100 -> ${res['official_tuned_settings']['end']:,.0f} DD {res['official_tuned_settings']['dd']:.1f}%")
    print(f"official, continuous 18 Sep -> 15 Oct:            $100 -> ${res['official_full_sep_oct']['end']:,.0f} DD {res['official_full_sep_oct']['dd']:.1f}%")
    print(f"October baseline (buy every candidate) mean ret {base:.3f}x")
    (WORK / "final_test.json").write_text(json.dumps(res, indent=1, default=float))


if __name__ == "__main__":
    main()
