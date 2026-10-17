"""Account-level luck test: run the real bot sim with RANDOM entry scores (same gates, exits, sizing).

Usage: python luck_sim.py <window_dir> <from> <to> <n_seeds> [settings=a07|official]
Compares the real bot's final equity against the distribution of random-pick bots.
"""
import json
import os
import re
import subprocess
import sys
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

import numpy as np

REPO = Path("/tmp/claude-0/-root/af19755f-534a-4afa-9b0b-1adc352c44c6/scratchpad/repo/horiii-debug")
LIVE = REPO / "rust/rhc-live/target/release/rhc-live"
BOT = REPO / "rhc_vps/bot"
SETTINGS = {
    "a07": {"TUTUP_SAAT_RUG": "1", "TRAIL_PUNCAK": "0.4", "DUMP_FRAC": "0.12", "MAX_POS": "5"},
    "official": {"MAX_POS": "10"},
}
LINE = re.compile(r"beli (\d+) \| tutup (\d+) \| win ([\d.]+)% \| PF ([\d.inf]+) \| akun \$([\d.]+) -> \$([\d.]+) \| DD maks ([\d.]+)%")


def run_sim(d, frm, to, out, env_extra, extra_args=()):
    env = dict(os.environ, **env_extra)
    r = subprocess.run([str(LIVE), "sim", str(d), str(frm), str(to), str(out), "--bot", str(BOT), *extra_args],
                       capture_output=True, text=True, env=env)
    m = LINE.search(r.stdout)
    if not m:
        return None
    return {"buys": int(m[1]), "win": float(m[3]), "pf": float(m[4]), "end": float(m[6]), "dd": float(m[7])}


def main():
    d, frm, to, n = Path(sys.argv[1]), sys.argv[2], sys.argv[3], int(sys.argv[4])
    setting = sys.argv[5] if len(sys.argv) > 5 else "a07"
    env = SETTINGS[setting]
    tmp = d / "luck"
    tmp.mkdir(exist_ok=True)
    real = run_sim(d, frm, to, tmp / "real.jsonl", env)
    pools = [l.split(",")[0] for l in (tmp / "real.jsonl.skor.csv").read_text().splitlines()[1:]]

    def one(seed):
        rng = np.random.default_rng(seed)
        f = tmp / f"rand_{seed}.csv"
        f.write_text("pool,score\n" + "".join(f"{p},{rng.random():.6f}\n" for p in pools))
        # thr0=0.9 so the random scorer starts at the same top-10% rule as the moving threshold
        r = run_sim(d, frm, to, tmp / f"rand_{seed}.jsonl", env, ("--skor", str(f), "--thr0", "0.9"))
        for x in tmp.glob(f"rand_{seed}*"):
            x.unlink()
        return r

    with ThreadPoolExecutor(max_workers=int(os.environ.get("PAR", "8"))) as ex:
        rand = [r for r in ex.map(one, range(n)) if r]
    ends = np.array([r["end"] for r in rand])
    res = {
        "window": d.name, "setting": setting, "real": real, "n_random": len(rand),
        "random_end_p05": float(np.quantile(ends, 0.05)), "random_end_p50": float(np.median(ends)),
        "random_end_p95": float(np.quantile(ends, 0.95)),
        "p_value_real_vs_random": float((np.sum(ends >= real["end"]) + 1) / (len(ends) + 1)),
        "random_buys_median": float(np.median([r["buys"] for r in rand])),
    }
    (d / f"luck_{setting}.json").write_text(json.dumps(res, indent=1))
    print(json.dumps(res))


if __name__ == "__main__":
    main()
