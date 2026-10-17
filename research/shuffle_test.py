"""Random-order test: run the continuous $100 account over the 14 two-day windows in 100 random orders.

Answers: does the result depend on the lucky order of hot and quiet markets? (Each window is real unseen data;
only the order changes. Note: in a shuffled order the dev-history rule can see devs from 'later' windows; minor.)
Usage: python shuffle_test.py <settings name: official|sysA> <n_orders>
"""
import json
import os
import random
import re
import subprocess
import sys
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

import numpy as np

WORK = Path("/tmp/claude-0/-root/af19755f-534a-4afa-9b0b-1adc352c44c6/scratchpad/rhc_work")
REPO = Path("/tmp/claude-0/-root/af19755f-534a-4afa-9b0b-1adc352c44c6/scratchpad/repo/horiii-debug")
BOT = REPO / "rhc_vps/bot"
LIVE = REPO / "rust/rhc-live/target/release/rhc-live"
LINE = re.compile(r"beli (\d+) \| tutup (\d+) \| win ([\d.]+)% \| PF ([\d.inf]+) \| akun \$([\d.]+) -> \$([\d.]+) \| DD maks ([\d.]+)%")
WIN = {l.split()[0]: (int(l.split()[1]), int(l.split()[2])) for l in (WORK / "windows.txt").read_text().splitlines() if l.strip()}
ALL = [f"w{i:02d}" for i in range(14)]
SETTINGS = {"official": {"MAX_POS": "10"},
            "sysA": {"QTHR": "0.80", "MAX_POS": "10", "DANGER_TH": "0.5", "TRAIL_PUNCAK": "0.4", "TUTUP_SAAT_RUG": "1",
                     "DUMP_FRAC": "0.05", "KELLY_MAKS": "0.15"}}
SETTINGS["sysA_k2"] = {**SETTINGS["sysA"], "KELLY_MIN": "0.02"}
SETTINGS["official_k2"] = {**SETTINGS["official"], "KELLY_MIN": "0.02"}


def run(order, settings, tag):
    tmp = WORK / "shuf_tmp" / tag
    tmp.mkdir(parents=True, exist_ok=True)
    env = {**os.environ, **settings}
    prev, m, dd = None, None, 0.0
    for w in order:
        a, b = WIN[w]
        args = [str(LIVE), "sim", str(WORK / "data" / w), str(a), str(b), str(tmp / f"{w}.jsonl"), "--bot", str(BOT), "--akun-out", str(tmp / f"{w}_a.json")]
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
    return float(m[6]), dd


def main():
    name, n = sys.argv[1], int(sys.argv[2])
    orders = [random.Random(s).sample(ALL, len(ALL)) for s in range(n)]
    with ThreadPoolExecutor(max_workers=20) as ex:
        res = [r for r in ex.map(lambda i: run(orders[i], SETTINGS[name], f"{name}_{i}"), range(n)) if r]
    ends, dds = np.array([r[0] for r in res]), np.array([r[1] for r in res])
    out = {"settings": name, "n": len(res), "ends": sorted(ends.tolist()), "dd": sorted(dds.tolist()),
           "p5": float(np.quantile(ends, .05)), "p50": float(np.median(ends)), "p95": float(np.quantile(ends, .95)),
           "min": float(ends.min()), "loss_share": float((ends < 100).mean()), "dd_p50": float(np.median(dds)), "dd_p95": float(np.quantile(dds, .95)),
           "dd_over_50": float((dds > 50).mean())}
    (WORK / f"shuffle_{name}.json").write_text(json.dumps(out, indent=1))
    print(f"{name}: {len(res)} random orders | $100 -> 5% ${out['p5']:,.0f} | median ${out['p50']:,.0f} | 95% ${out['p95']:,.0f} | worst ${out['min']:,.0f}"
          f" | losing {out['loss_share']:.0%} | DD median {out['dd_p50']:.1f}% p95 {out['dd_p95']:.1f}% | DD>50% {out['dd_over_50']:.0%}")


if __name__ == "__main__":
    main()
