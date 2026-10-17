"""Skill-vs-luck test on the continuous account: real ML entry scores vs RANDOM scores.

Random bots keep everything else identical (top-10% rule, honeypot/dev rules, exits, Kelly sizing, caps),
only the coin ranking is random. p-value = share of random bots that end with >= the real bot's equity.
Usage: python luck_chain.py <settings> <n_seeds> <window> [<window> ...]
"""
import os
import re
import subprocess
import sys
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).parent))
from chain_sim import BOT, LINE, LIVE, SETTINGS, WINDOWS, WORK  # noqa: E402


def run_chain(settings, wins, seed, tmp):
    env = {**os.environ, **SETTINGS[settings]}
    prev, end, buys = None, None, 0
    real = WORK / "chain" / settings
    for w in wins:
        a, b = WINDOWS[w]
        pools = [l.split(",")[0] for l in (real / f"{w}.jsonl.skor.csv").read_text().splitlines()[1:]]
        rng = np.random.default_rng(seed * 1000 + int(w[1:]) if w[1:].isdigit() else seed)
        sc = tmp / f"s{seed}_{w}.csv"
        sc.write_text("pool,score\n" + "".join(f"{p},{rng.random():.6f}\n" for p in pools))
        args = [str(LIVE), "sim", str(WORK / "data" / w), str(a), str(b), str(tmp / f"s{seed}_{w}.jsonl"), "--bot", str(BOT),
                "--skor", str(sc), "--thr0", "0.9", "--akun-out", str(tmp / f"s{seed}_{w}_akun.json")]
        if prev:
            args += ["--akun-in", str(prev)]
        r = subprocess.run(args, capture_output=True, text=True, env=env)
        m = LINE.search(r.stdout)
        if not m:
            return None
        end, buys = float(m[6]), int(m[1])
        prev = tmp / f"s{seed}_{w}_akun.json"
    for f in tmp.glob(f"s{seed}_*"):
        f.unlink()
    return end, buys


def main():
    settings, n, wins = sys.argv[1], int(sys.argv[2]), sys.argv[3:]
    tmp = WORK / "chain" / f"luck_{settings}"
    tmp.mkdir(parents=True, exist_ok=True)
    real_end = None
    for w in wins:
        pass
    last = (WORK / "chain" / settings / f"{wins[-1]}_akun.json")
    # real result = last line printed by chain_sim for these windows (re-run to be exact)
    r = subprocess.run([sys.executable, "-I", str(WORK / "chain_sim.py"), settings, *wins], capture_output=True, text=True)
    real_end = float(re.search(r"final equity \$([\d,.]+)", r.stdout)[1].replace(",", ""))
    with ThreadPoolExecutor(max_workers=16) as ex:
        res = [x for x in ex.map(lambda s: run_chain(settings, wins, s, tmp), range(n)) if x]
    ends = np.array([x[0] for x in res])
    print(f"settings {settings} | windows {' '.join(wins)}")
    print(f"REAL ML bot   : ${real_end:,.2f}")
    print(f"RANDOM bots ({len(ends)}): median ${np.median(ends):,.2f} | 5% ${np.quantile(ends, .05):,.2f} | 95% ${np.quantile(ends, .95):,.2f}"
          f" | best ${ends.max():,.2f} | median trades {np.median([x[1] for x in res]):.0f}")
    import json
    (WORK / "luck_result.json").write_text(json.dumps({"settings": settings, "windows": wins, "real_end": real_end,
        "random_ends": sorted(float(x) for x in ends), "random_trades_median": float(np.median([x[1] for x in res]))}))
    print(f"random bots beating the real bot: {(ends >= real_end).sum()}/{len(ends)}  -> p = {((ends >= real_end).sum() + 1) / (len(ends) + 1):.3f}")


if __name__ == "__main__":
    main()
