"""Honest parameter tuning: pick settings on a random TUNE subset of windows, report them on the held-out TEST subset.

Each config runs as a continuous $100 account over the tune windows (time order), then separately over the test windows.
Objective (tune only): log(final equity), rejected if max drawdown > MAX_DD.
Usage: python tune.py <window> [<window> ...]      (windows that have finished the pipeline)
Output: tune_results.csv, tune_split.json
"""
import itertools
import json
import os
import random
import re
import subprocess
import sys
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

import numpy as np
import pandas as pd

sys.path.insert(0, str(Path(__file__).parent))
from chain_sim import BOT, LINE, LIVE, WINDOWS, WORK  # noqa: E402

MAX_DD = 35.0
GRID = {
    "QTHR": ["0.80", "0.85", "0.90", "0.95"],
    "MAX_POS": ["5", "10", "20"],
    "DANGER_TH": ["0.3", "0.4", "0.5"],
    "TRAIL_PUNCAK": ["0", "0.4"],
    "TUTUP_SAAT_RUG": ["0", "1"],
    "DUMP_FRAC": ["0.05", "0.12"],
    "KELLY_MAKS": ["0.10", "0.15"],
}


def chain(cfg, wins, tag):
    tmp = WORK / "tune_tmp" / tag
    tmp.mkdir(parents=True, exist_ok=True)
    env = {**os.environ, **cfg}
    prev, m, dd = None, None, 0.0
    for w in wins:
        a, b = WINDOWS[w]
        args = [str(LIVE), "sim", str(WORK / "data" / w), str(a), str(b), str(tmp / f"{w}.jsonl"), "--bot", str(BOT),
                "--akun-out", str(tmp / f"{w}_a.json")]
        if prev:
            args += ["--akun-in", str(prev)]
        r = subprocess.run(args, capture_output=True, text=True, env=env)
        m = LINE.search(r.stdout)
        if not m:
            return None
        dd = max(dd, float(m[7]))
        prev = tmp / f"{w}_a.json"
    for f in tmp.iterdir():
        f.unlink()
    tmp.rmdir()
    return float(m[6]), dd, int(m[1])


def main():
    wins = sorted(sys.argv[1:], key=lambda w: WINDOWS[w][0])
    rng = random.Random(42)
    tune = sorted(rng.sample(wins, k=max(2, len(wins) // 2 + len(wins) % 2)), key=lambda w: WINDOWS[w][0])
    test = [w for w in wins if w not in tune]
    (WORK / "tune_split.json").write_text(json.dumps({"tune": tune, "test": test}))
    print(f"TUNE windows {tune} | TEST windows {test}", flush=True)
    keys = list(GRID)
    configs = [dict(zip(keys, v)) for v in itertools.product(*GRID.values())]

    def run(i):
        c = configs[i]
        t = chain(c, tune, f"t{i}")
        s = chain(c, test, f"s{i}") if test else None
        return {**c, "tune_end": t and t[0], "tune_dd": t and t[1], "tune_trades": t and t[2],
                "test_end": s and s[0], "test_dd": s and s[1], "test_trades": s and s[2]}
    with ThreadPoolExecutor(max_workers=24) as ex:
        rows = list(ex.map(run, range(len(configs))))
    df = pd.DataFrame(rows)
    df["tune_obj"] = np.where(df.tune_dd <= MAX_DD, np.log(df.tune_end / 100), -np.inf)
    df = df.sort_values("tune_obj", ascending=False)
    df.to_csv(WORK / "tune_results.csv", index=False)
    base = df[(df.QTHR == "0.90") & (df.MAX_POS == "10") & (df.DANGER_TH == "0.4") & (df.TRAIL_PUNCAK == "0") &
              (df.TUTUP_SAAT_RUG == "0") & (df.DUMP_FRAC == "0.05") & (df.KELLY_MAKS == "0.10")]
    print(f"{len(df)} configs tested")
    print("OFFICIAL settings:\n", base[["tune_end", "tune_dd", "test_end", "test_dd"]].to_string(index=False))
    print("TOP 10 by TUNE objective (test columns were NOT used to choose):")
    print(df.head(10)[keys + ["tune_end", "tune_dd", "test_end", "test_dd", "test_trades"]].to_string(index=False))


if __name__ == "__main__":
    main()
