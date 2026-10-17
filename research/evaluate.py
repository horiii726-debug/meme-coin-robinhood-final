"""Skill-vs-luck evaluation of each frozen model on out-of-sample windows.

Usage: python evaluate.py <data_dir> <window> [<window> ...]
Inputs per window (written by run_window.sh):
  trades*.jsonl          replay of EVERY candidate coin (counterfactual: what v4 would have made if bought)
  sim_a07.jsonl.skor.csv entry-filter score per coin (frozen CatBoost)
Output: printed tables + <data_dir>/eval_<windows>.json
"""
import json
import sys
from pathlib import Path

import numpy as np
from sklearn.metrics import roc_auc_score

RNG = np.random.default_rng(7)
N_PERM = 10_000
N_BOOT = 5_000


def load_trades(path):
    out = {}
    if not path.exists():
        return out
    for line in path.read_text().splitlines():
        if not line.strip():
            continue
        t = json.loads(line)
        if t.get("plan") == "v4":
            out[t["pool"]] = t
    return out


def load_scores(path):
    s = {}
    if not path.exists():
        return s
    for line in path.read_text().splitlines()[1:]:
        pool, sc = line.split(",")
        try:
            v = float(sc)
        except ValueError:
            continue
        if np.isfinite(v):
            s[pool] = v
    return s


def entry_filter_test(trades, scores, top_frac=0.10):
    """Is the top-10% by model score better than a random 10% of the same candidates?"""
    pools = [p for p in trades if p in scores]
    if len(pools) < 30:
        return {"n": len(pools), "note": "too few coins"}
    ret = np.array([trades[p]["ret"] for p in pools])
    sc = np.array([scores[p] for p in pools])
    win = ret > 1.0
    k = max(1, int(round(top_frac * len(pools))))
    top = np.argsort(-sc)[:k]
    top_mean = ret[top].mean()
    # permutation null: random subsets of size k
    null = np.array([ret[RNG.choice(len(ret), k, replace=False)].mean() for _ in range(N_PERM)])
    p_value = (np.sum(null >= top_mean) + 1) / (N_PERM + 1)
    return {
        "n": len(pools),
        "base_win": float(win.mean()),
        "base_mean_ret": float(ret.mean()),
        "auc_win": float(roc_auc_score(win, sc)) if 0 < win.sum() < len(win) else None,
        "top_k": k,
        "top_win": float(win[top].mean()),
        "top_mean_ret": float(top_mean),
        "random_mean_ret_p50": float(np.median(null)),
        "random_mean_ret_p95": float(np.quantile(null, 0.95)),
        "p_value_vs_random": float(p_value),
    }


def paired_test(a, b):
    """Mean per-coin ret difference a-b on the same coins, bootstrap 95% CI."""
    pools = [p for p in a if p in b]
    if not pools:
        return {"n": 0}
    d = np.array([a[p]["ret"] - b[p]["ret"] for p in pools])
    boots = np.array([d[RNG.integers(0, len(d), len(d))].mean() for _ in range(N_BOOT)])
    return {
        "n": len(pools),
        "mean_diff": float(d.mean()),
        "ci95": [float(np.quantile(boots, 0.025)), float(np.quantile(boots, 0.975))],
        "share_better": float((d > 0).mean()),
        "share_worse": float((d < 0).mean()),
    }


def main():
    root = Path(sys.argv[1])
    windows = sys.argv[2:]
    report = {}
    pooled = {"full": {}, "nodanger": {}, "noup": {}, "noexitml": {}, "scores": {}}
    for w in windows:
        d = root / w
        tr = {k: load_trades(d / f) for k, f in [("full", "trades.jsonl"), ("nodanger", "trades_nodanger.jsonl"),
                                                  ("noup", "trades_noup.jsonl"), ("noexitml", "trades_noexitml.jsonl")]}
        sc = load_scores(d / "sim_a07.jsonl.skor.csv")
        r = {
            "entry_filter": entry_filter_test(tr["full"], sc),
            "danger_model": paired_test(tr["full"], tr["nodanger"]),
            "up_model": paired_test(tr["full"], tr["noup"]),
            "all_exit_ml": paired_test(tr["full"], tr["noexitml"]),
        }
        report[w] = r
        for k in tr:
            pooled[k].update({f"{w}:{p}": v for p, v in tr[k].items()})
        pooled["scores"].update({f"{w}:{p}": v for p, v in sc.items()})
    report["ALL"] = {
        "entry_filter": entry_filter_test(pooled["full"], pooled["scores"]),
        "danger_model": paired_test(pooled["full"], pooled["nodanger"]),
        "up_model": paired_test(pooled["full"], pooled["noup"]),
        "all_exit_ml": paired_test(pooled["full"], pooled["noexitml"]),
    }
    out = root / f"eval_{'_'.join(windows)[:80]}.json"
    out.write_text(json.dumps(report, indent=1))
    for w, r in report.items():
        f = r["entry_filter"]
        print(f"== {w}")
        if "auc_win" in f:
            print(f"  entry filter: n={f['n']} AUC={f['auc_win']} base ret {f['base_mean_ret']:.3f} | top10% ret {f['top_mean_ret']:.3f}"
                  f" win {f['top_win']:.0%} | random p50 {f['random_mean_ret_p50']:.3f} p95 {f['random_mean_ret_p95']:.3f} | p={f['p_value_vs_random']:.4f}")
        for k in ("danger_model", "up_model", "all_exit_ml"):
            x = r[k]
            if x.get("n"):
                print(f"  {k:13s}: n={x['n']} mean ret diff {x['mean_diff']:+.4f} CI95 [{x['ci95'][0]:+.4f},{x['ci95'][1]:+.4f}]"
                      f" better {x['share_better']:.0%} worse {x['share_worse']:.0%}")
    print("saved", out)


if __name__ == "__main__":
    main()
