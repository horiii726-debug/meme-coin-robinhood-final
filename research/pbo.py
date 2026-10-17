"""Probability of Backtest Overfitting via CSCV (Bailey, Borwein, Lopez de Prado & Zhu 2015).

Performance matrix: log growth of a $100 account per window (reset each window) for every tuning config.
CSCV: split the S windows into all halves; pick the best config in-sample, find its relative rank out-of-sample;
PBO = share of splits where that rank is below the median (logit <= 0).
Usage: python pbo.py <window> [...]
"""
import itertools
import json
import os
import re
import subprocess
import sys
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).parent))
from tune import GRID  # noqa: E402
from chain_sim import BOT, LINE, LIVE, WINDOWS, WORK  # noqa: E402


def one(cfg, w, tag):
    a, b = WINDOWS[w]
    out = WORK / "pbo_tmp" / f"{tag}_{w}.jsonl"
    out.parent.mkdir(exist_ok=True)
    r = subprocess.run([str(LIVE), "sim", str(WORK / "data" / w), str(a), str(b), str(out), "--bot", str(BOT)],
                       capture_output=True, text=True, env={**os.environ, **cfg})
    for f in out.parent.glob(f"{tag}_{w}*"):
        f.unlink()
    m = LINE.search(r.stdout)
    return np.log(float(m[6]) / 100) if m else np.nan


def main():
    wins = sys.argv[1:]
    keys = list(GRID)
    configs = [dict(zip(keys, v)) for v in itertools.product(*GRID.values())]
    jobs = [(i, w) for i in range(len(configs)) for w in wins]
    with ThreadPoolExecutor(max_workers=28) as ex:
        vals = list(ex.map(lambda j: one(configs[j[0]], j[1], f"c{j[0]}"), jobs))
    M = np.array(vals).reshape(len(configs), len(wins))           # configs x windows
    S = len(wins)
    logits = []
    for ins in itertools.combinations(range(S), S // 2):
        oos = [k for k in range(S) if k not in ins]
        best = int(np.nanargmax(M[:, list(ins)].sum(axis=1)))
        perf_oos = M[:, oos].sum(axis=1)
        rank = (np.sum(perf_oos < perf_oos[best]) + 0.5) / len(perf_oos)   # relative rank in (0,1)
        logits.append(np.log(rank / (1 - rank)))
    logits = np.array(logits)
    pbo = float(np.mean(logits <= 0))
    res = {"windows": wins, "configs": len(configs), "splits": len(logits), "pbo": pbo, "median_logit": float(np.median(logits))}
    (WORK / "pbo_result.json").write_text(json.dumps(res, indent=1))
    print(json.dumps(res))


if __name__ == "__main__":
    main()
