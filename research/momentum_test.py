"""Test the owner's buy-pressure entry + momentum exit idea on real on-chain swaps.

Entry : minute-1 buy pressure (ETH buy volume / sell volume up to init+600). Entry at init+630 (3 s latency).
Hold  : while the rolling 60 s buy:sell volume ratio stays above EXIT_RATIO.
Exit  : sell EVERYTHING when ratio <= EXIT_RATIO (after MIN_HOLD), filled 30 blocks later (3 s latency).
Safety: liquidity pulled > 80% (rug) -> position worth 0 from that block; horizon cap HZ.
Costs : pool fee via AMM math, gas $0.06 per swap + approve $0.03 (owner's measured values).
Compares against the system's own v4 exit on the SAME coins (trades.jsonl, replay with identical costs).

Usage: python momentum_test.py <window_dir> [<window_dir> ...]
"""
import json
import sys
from collections import defaultdict
from pathlib import Path

import numpy as np

Q96 = 2.0 ** 96
NATIVE = "0x" + "0" * 40
ETH_POOL = "0x24107d152f14a76d292123265ae3f3c71f863fc2f4ef7ba49d64e78d28ea379e"
LAT = 30            # 3 s execution latency (0.1 s blocks)
DECIDE = 600        # minute 1
WIN = 600           # rolling momentum window: 60 s
HZ = 324000         # 9 h data limit (only a safety cap here)
GAS, APPROVE = 0.06, 0.03
SIZE_USD, LP_FRAC, MIN_USD = 100.0, 0.01, 20.0


def load_window(d):
    d = Path(d)
    cand = {}
    for l in (d / "trades.jsonl").read_text().splitlines():
        t = json.loads(l)
        if t["plan"] == "v4":
            cand[t["pool"]] = t
    meta = {}
    for l in (d / "pools.csv").read_text().splitlines()[1:]:
        p = l.split(",")
        if p[0] in cand:
            meta[p[0]] = (p[1].lower(), p[2].lower(), float(p[6]))
    swaps, eth = defaultdict(list), []
    with open(d / "swaps_sorted.csv") as f:
        next(f)
        for l in f:
            pid = l[:l.index(",")]
            if pid == ETH_POOL:
                p = l.split(",")
                sp = float(p[6]) / Q96
                eth.append((int(p[1]), sp * sp * 1e12))
            elif pid in meta:
                p = l.split(",")
                swaps[pid].append((int(p[1]), int(p[2]), float(p[4]), float(p[5]), float(p[6]) / Q96, float(p[7]), float(p[9])))
    liq = defaultdict(list)
    for l in (d / "liq.csv").read_text().splitlines()[1:]:
        p = l.split(",")
        if p[0] in meta:
            liq[p[0]].append((int(p[1]), int(p[5])))
    eth.sort()
    return cand, meta, swaps, liq, eth


def eth_at(eth, b):
    i = np.searchsorted([x[0] for x in eth], b, side="right")
    return eth[max(i - 1, 0)][1]


def rug_block(ev):
    a = r = 0
    for b, dl in sorted(ev):
        if dl > 0:
            a += dl
        else:
            r += -dl
        if a > 0 and r * 100 > 80 * a:
            return b
    return None


def simulate(meta, sw, ev, eth_usd, exit_ratio, min_hold):
    c0, c1, init = meta
    q1 = c1 == NATIVE                      # ETH is token1
    sw.sort()
    is_buy = lambda x: (x[2] if q1 else x[3]) > 0
    q_eth = lambda x: abs(x[3] if q1 else x[2]) / 1e18
    lp_usd = lambda x: 2 * (x[5] * x[4] if q1 else x[5] / x[4]) / 1e18 * eth_usd
    pre = [x for x in sw if x[0] <= init + DECIDE]
    bv = sum(q_eth(x) for x in pre if is_buy(x))
    sv = sum(q_eth(x) for x in pre if not is_buy(x))
    nb = sum(1 for x in pre if is_buy(x))
    ns = len(pre) - nb
    ent = [x for x in sw if x[0] <= init + DECIDE + LAT]
    if not ent:
        return None
    e = ent[-1]
    size = min(SIZE_USD, LP_FRAC * lp_usd(e))
    if not np.isfinite(size) or size < MIN_USD:
        return None
    d_in = size / eth_usd * 1e18 * (1 - e[6] / 1e6)
    sp, L = e[4], e[5]
    if sp <= 0 or L <= 0:
        return None
    base = L * (1 / sp - 1 / (sp + d_in / L)) if q1 else L * (sp - 1 / (1 / sp + d_in / L))
    if not np.isfinite(base) or base <= 0:
        return None

    def value(x):  # USD from selling all tokens at swap state x
        b_in = base * (1 - x[6] / 1e6)
        s, l = x[4], x[5]
        if s <= 0 or l <= 0:
            return 0.0
        r = l * (s - 1 / (1 / s + b_in / l)) if q1 else l * (1 / s - 1 / (s + b_in / l))
        return 0.0 if not np.isfinite(r) or r <= 0 else r / 1e18 * eth_usd

    rug = rug_block(ev)
    after = [x for x in sw if init + DECIDE + LAT < x[0] <= init + HZ]
    peak = max([value(x) for x in after], default=0.0) / size
    exit_v, reason, j0 = None, "horizon", 0
    for i, x in enumerate(after):
        if rug is not None and x[0] >= rug:
            exit_v, reason = 0.0, "rug"
            break
        if x[0] - e[0] < min_hold:
            continue
        while after[j0][0] <= x[0] - WIN:
            j0 += 1
        w = after[j0:i + 1]
        b = sum(q_eth(y) for y in w if is_buy(y))
        s = sum(q_eth(y) for y in w if not is_buy(y))
        if s > 0 and b / s <= exit_ratio:
            fill = [y for y in after if y[0] <= x[0] + LAT]
            exit_v, reason = value(fill[-1]), "momentum"
            if rug is not None and x[0] + LAT >= rug:
                exit_v = 0.0
            break
    if exit_v is None:
        last = after[-1] if after else e
        exit_v = 0.0 if (rug is not None and rug <= init + HZ) else value(last)
    ret = (exit_v - 2 * GAS - APPROVE) / size
    return {"bp_vol": bv / sv if sv > 0 else (np.inf if bv > 0 else 0), "bp_cnt": nb / ns if ns > 0 else (np.inf if nb > 0 else 0),
            "ret": ret, "peak": peak, "reason": reason}


def summarize(name, rets):
    r = np.array(rets)
    if len(r) == 0:
        return f"{name:44s} n=0"
    win = r > 1
    gp, gl = (r[win] - 1).sum(), (1 - r[~win]).sum()
    return (f"{name:44s} n={len(r):5d} win {win.mean():5.1%} mean {r.mean():6.3f} median {np.median(r):6.3f} "
            f"PF {gp / gl if gl > 0 else float('inf'):5.2f}")


def main():
    rows = []
    for d in sys.argv[1:]:
        cand, meta, swaps, liq, eth = load_window(d)
        for pid, t in cand.items():
            if pid not in meta or not swaps.get(pid):
                continue
            eu = eth_at(eth, meta[pid][2])
            r = {"pool": pid, "window": Path(d).name, "v4_ret": t["ret"], "v4_perfect": t["perfect"]}
            for er, mh in ((1.0, 0), (1.0, 600), (1.5, 600)):
                s = simulate(meta[pid], list(swaps[pid]), liq.get(pid, []), eu, er, mh)
                if s is None:
                    break
                r.update({"bp_vol": s["bp_vol"], "bp_cnt": s["bp_cnt"], f"mom_{er}_{mh}": s["ret"], f"reason_{er}_{mh}": s["reason"]})
            else:
                rows.append(r)
    print(f"coins simulated: {len(rows)} from {len(sys.argv) - 1} windows")
    for label, sel in (("ALL coins", lambda r: True),
                       ("entry buy:sell volume >= 3:1", lambda r: r["bp_vol"] >= 3),
                       ("entry buy:sell volume >= 2:1", lambda r: r["bp_vol"] >= 2),
                       ("entry buy:sell volume < 1:1", lambda r: r["bp_vol"] < 1),
                       ("entry buy:sell COUNT >= 3:1", lambda r: r["bp_cnt"] >= 3)):
        g = [r for r in rows if sel(r)]
        print(f"\n== {label}")
        print("  " + summarize("current system exit (v4, models)", [r["v4_ret"] for r in g]))
        print("  " + summarize("momentum exit at 1:1, no min hold", [r["mom_1.0_0"] for r in g]))
        print("  " + summarize("momentum exit at 1:1, hold >= 60 s", [r["mom_1.0_600"] for r in g]))
        print("  " + summarize("momentum exit at 1.5:1, hold >= 60 s", [r["mom_1.5_600"] for r in g]))
        m = [r for r in g if r["v4_perfect"] >= 10]
        if m:
            print(f"  moonshots (>=10x possible): {len(m)} | captured v4 mean {np.mean([r['v4_ret'] for r in m]):.2f}x"
                  f" | momentum 1:1/60s mean {np.mean([r['mom_1.0_600'] for r in m]):.2f}x")
    # buy-pressure buckets
    print("\n== win rate & mean return by minute-1 buy:sell VOLUME bucket (current v4 exit | momentum 1:1/60s)")
    edges = [0, 0.5, 1, 1.5, 2, 3, 5, np.inf]
    for a, b in zip(edges[:-1], edges[1:]):
        g = [r for r in rows if a <= r["bp_vol"] < b]
        if g:
            v = np.array([r["v4_ret"] for r in g]); m = np.array([r["mom_1.0_600"] for r in g])
            pk = np.array([r["v4_perfect"] for r in g])
            print(f"  {a:>4}-{b:<4} n={len(g):5d} | v4 win {np.mean(v > 1):5.1%} mean {v.mean():.3f} | mom win {np.mean(m > 1):5.1%} mean {m.mean():.3f}"
                  f" | >=2x possible {np.mean(pk >= 2):5.1%} | >=10x {np.mean(pk >= 10):5.1%}")
    out = Path(sys.argv[1]).parent / "momentum_rows.json"
    out.write_text(json.dumps(rows, default=float))


if __name__ == "__main__":
    main()
