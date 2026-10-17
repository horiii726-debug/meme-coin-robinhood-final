"""Execution stress tests on the continuous $100 account (official settings unless overridden).

Usage: python stress.py <window> [<window> ...]   -> stress_results.json
"""
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from tune import chain  # noqa: E402
from chain_sim import WORK  # noqa: E402

BASE = {"MAX_POS": "10"}
SCENARIOS = [
    ("baseline (3 s latency, owner's costs)", {}),
    ("our sells move the price", {"SELL_IMPACT": "1"}),
    ("latency 5 s", {"LAT_BLOCKS": "50"}),
    ("latency 10 s", {"LAT_BLOCKS": "100"}),
    ("gas busy $0.21/tx + approve $0.06", {"GAS_USD": "0.21", "APPROVE_USD": "0.06"}),
    ("10% buys + 10% sells fail", {"FAIL_BUY": "0.10", "FAIL_SELL": "0.10"}),
    ("all of the above combined", {"SELL_IMPACT": "1", "LAT_BLOCKS": "100", "GAS_USD": "0.21", "APPROVE_USD": "0.06",
                                   "FAIL_BUY": "0.10", "FAIL_SELL": "0.10"}),
]


def main():
    wins = sys.argv[1:]
    out = []
    for i, (name, extra) in enumerate(SCENARIOS):
        r = chain({**BASE, **extra}, wins, f"stress{i}")
        out.append({"scenario": name, "settings": extra, "end": r and r[0], "max_dd": r and r[1], "trades": r and r[2]})
        print(f"{name:42s} -> ${r[0]:>12,.2f} | max DD {r[1]:5.1f}% | trades {r[2]}" if r else f"{name}: failed", flush=True)
    (WORK / "stress_results.json").write_text(json.dumps(out, indent=1))


if __name__ == "__main__":
    main()
