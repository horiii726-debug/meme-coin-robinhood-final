"""Continuous $100 account across consecutive windows (equity, Kelly state, score history, dev history carried over).

Usage: python chain_sim.py <settings_name> <window> [<window> ...]
settings: a07 (VPS), official (default), nofilter (ML entry filter off), a07_si (a07 + our sells move price)
"""
import os
import re
import subprocess
import sys
from pathlib import Path

WORK = Path("/tmp/claude-0/-root/af19755f-534a-4afa-9b0b-1adc352c44c6/scratchpad/rhc_work")
REPO = Path("/tmp/claude-0/-root/af19755f-534a-4afa-9b0b-1adc352c44c6/scratchpad/repo/horiii-debug")
LIVE = REPO / "rust/rhc-live/target/release/rhc-live"
BOT = REPO / "rhc_vps/bot"
A07 = {"TUTUP_SAAT_RUG": "1", "TRAIL_PUNCAK": "0.4", "DUMP_FRAC": "0.12", "MAX_POS": "5"}
SETTINGS = {"a07": A07, "official": {"MAX_POS": "10"}, "nofilter": {**A07, "FILTER": "0"},
            "a07_si": {**A07, "SELL_IMPACT": "1"}, "official_si": {"MAX_POS": "10", "SELL_IMPACT": "1"}}
LINE = re.compile(r"beli (\d+) \| tutup (\d+) \| win ([\d.]+)% \| PF ([\d.inf]+) \| akun \$([\d.]+) -> \$([\d.]+) \| DD maks ([\d.]+)%")
WINDOWS = {l.split()[0]: (int(l.split()[1]), int(l.split()[2]))
           for f in ("windows.txt", "windows_hist.txt") for l in (WORK / f).read_text().splitlines() if l.strip()}


def main():
    name, wins = sys.argv[1], sys.argv[2:]
    env = {**os.environ, **SETTINGS[name]}
    out = WORK / "chain" / name
    out.mkdir(parents=True, exist_ok=True)
    prev, trades = None, 0
    print(f"settings {name}: {SETTINGS[name]}")
    for w in wins:
        a, b = WINDOWS[w]
        args = [str(LIVE), "sim", str(WORK / "data" / w), str(a), str(b), str(out / f"{w}.jsonl"), "--bot", str(BOT),
                "--akun-out", str(out / f"{w}_akun.json")]
        if prev:
            args += ["--akun-in", str(prev)]
        r = subprocess.run(args, capture_output=True, text=True, env=env)
        m = LINE.search(r.stdout)
        if not m:
            print(f"{w}: FAILED {r.stderr[-300:]}")
            return
        trades += int(m[1])
        print(f"{w}: trades {int(m[1]):4d} win {float(m[3]):5.1f}% PF {m[4]:>5s} | equity ${float(m[5]):,.2f} -> ${float(m[6]):,.2f} | max DD so far {m[7]}%")
        prev = out / f"{w}_akun.json"
    print(f"TOTAL {len(wins)} windows, {trades} trades, final equity ${float(m[6]):,.2f}")


if __name__ == "__main__":
    main()
