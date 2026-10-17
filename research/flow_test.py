"""Order-flow test using TRANSACTION COUNTS of other traders (not volume).

Entry metrics (minute 1, data up to init+600 only):
  buy_sell_cnt  = number of buy swaps / number of sell swaps
  density       = swaps per 10 s in minute 1 ("how busy")
  gap_med       = median blocks between consecutive swaps ("how tight"; 1 block = 0.1 s)
  accel         = swaps in 2nd half of minute 1 / swaps in 1st half ("is activity speeding up")
Exit rules (evaluated at every swap while holding; sell ALL, filled 3 s later):
  ratio1      rolling 60 s buy:sell COUNT <= 1:1
  ratio1_min  same, but only after holding >= 60 s
  ratio_or_decel   ratio1_min OR activity decelerates (last 30 s < 50% of previous 30 s, prev >= 4 swaps)
  strong_hold      exit only when ratio <= 1:1 AND decelerating (hold while momentum is strong)
  + always: rug (>80% liquidity pulled) -> 0, no swap for 5 min -> exit at last price, 9 h cap.
Baseline: the current system's v4 exit on the SAME coins (replay with identical costs).

Usage: python flow_test.py <window_dir> [...]
"""
import json
import sys
from collections import defaultdict
from pathlib import Path

import numpy as np

Q96 = 2.0 ** 96
NATIVE = "0x" + "0" * 40
ETH_POOL = "0x24107d152f14a76d292123265ae3f3c71f863fc2f4ef7ba49d64e78d28ea379e"
LAT, DECIDE, WIN, HALF, DEAD, HZ = 30, 600, 600, 300, 3000, 324000
GAS, APPROVE = 0.06, 0.03
SIZE_USD, LP_FRAC, MIN_USD = 100.0, 0.01, 20.0
RULES = ("ratio1", "ratio1_min", "ratio_or_decel", "strong_hold")


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
            meta[p[0]] = (p[2].lower() == NATIVE, float(p[6]))
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
    return cand, meta, swaps, liq, np.array([x[0] for x in eth]), np.array([x[1] for x in eth])


def rug_block(ev):
    a = r = 0
    for b, dl in sorted(ev):
        a, r = (a + dl, r) if dl > 0 else (a, r - dl)
        if a > 0 and r * 100 > 80 * a:
            return b
    return None


def coin(q1, init, sw, ev, eth_usd):
    sw.sort()
    a = np.array(sw)
    blk, a0, a1, sp, L, fee = a[:, 0], a[:, 2], a[:, 3], a[:, 4], a[:, 5], a[:, 6]
    buy = (a0 if q1 else a1) > 0
    # ---- entry metrics (<= init+600)
    m1 = blk <= init + DECIDE
    nb, ns = int((buy & m1).sum()), int((~buy & m1).sum())
    if nb + ns == 0:
        return None
    b1 = blk[m1]
    gaps = np.diff(b1)
    first_half = int((b1 <= init + HALF).sum())
    feats = {"n_buy": nb, "n_sell": ns, "buy_sell_cnt": nb / ns if ns else (99.0 if nb else 0.0),
             "density": (nb + ns) / 6.0, "gap_med": float(np.median(gaps)) if len(gaps) else 600.0,
             "accel": (len(b1) - first_half) / max(first_half, 1)}
    # ---- entry fill at last state <= init+630
    ie = int(np.searchsorted(blk, init + DECIDE + LAT, side="right")) - 1
    if ie < 0 or sp[ie] <= 0 or L[ie] <= 0:
        return None
    lp = 2 * (L[ie] * sp[ie] if q1 else L[ie] / sp[ie]) / 1e18 * eth_usd
    size = min(SIZE_USD, LP_FRAC * lp)
    if not np.isfinite(size) or size < MIN_USD:
        return None
    d_in = size / eth_usd * 1e18 * (1 - fee[ie] / 1e6)
    base = L[ie] * (1 / sp[ie] - 1 / (sp[ie] + d_in / L[ie])) if q1 else L[ie] * (sp[ie] - 1 / (1 / sp[ie] + d_in / L[ie]))
    if not np.isfinite(base) or base <= 0:
        return None

    def value(i):
        s, l = sp[i], L[i]
        if s <= 0 or l <= 0:
            return 0.0
        b_in = base * (1 - fee[i] / 1e6)
        r = l * (s - 1 / (1 / s + b_in / l)) if q1 else l * (1 / s - 1 / (s + b_in / l))
        return 0.0 if not np.isfinite(r) or r <= 0 else r / 1e18 * eth_usd

    rug = rug_block(ev)
    lo = ie + 1
    hi = int(np.searchsorted(blk, init + HZ, side="right"))
    out = {}
    if hi <= lo:
        v = 0.0 if rug is not None else value(ie)
        for k in RULES:
            out[k] = ((v - 2 * GAS - APPROVE) / size, "no swaps")
        return feats, out
    idx = np.arange(lo, hi)
    cb, cs = np.cumsum(buy), np.cumsum(~buy)
    def cnt(c, i, j):  # count in (j, i]
        return c[i] - np.where(j >= 0, c[np.maximum(j, 0)], 0)
    j60 = np.searchsorted(blk, blk[idx] - WIN, side="right") - 1
    j30 = np.searchsorted(blk, blk[idx] - HALF, side="right") - 1
    b60, s60 = cnt(cb, idx, j60), cnt(cs, idx, j60)
    last30 = (idx - j30)
    prev30 = (j30 - j60)
    held = blk[idx] - blk[ie]
    ratio_bad = (s60 > 0) & (b60 <= s60)
    decel = (prev30 >= 4) & (last30 < 0.5 * prev30)
    masks = {"ratio1": ratio_bad, "ratio1_min": ratio_bad & (held >= 600),
             "ratio_or_decel": (ratio_bad | decel) & (held >= 600), "strong_hold": ratio_bad & decel & (held >= 600)}
    gap_next = np.append(np.diff(blk[lo:hi]), np.inf if hi >= len(blk) else blk[hi] - blk[hi - 1])
    dead = gap_next >= DEAD
    for k, m in masks.items():
        trig = np.flatnonzero(m | dead)
        if len(trig):
            t = idx[trig[0]]
            sig_blk = blk[t] + (DEAD if dead[trig[0]] and not m[trig[0]] else 0)
            f = int(np.searchsorted(blk, sig_blk + LAT, side="right")) - 1
            reason = "momentum" if m[trig[0]] else "quiet 5 min"
            v = 0.0 if (rug is not None and rug <= sig_blk + LAT) else value(f)
        else:
            reason = "horizon"
            v = 0.0 if (rug is not None and rug <= init + HZ) else value(hi - 1)
        if rug is not None and rug <= blk[idx[trig[0]]] if len(trig) else False:
            reason = "rug"
        out[k] = ((v - 2 * GAS - APPROVE) / size, reason)
    return feats, out


def stats(r):
    r = np.asarray(r, float)
    if not len(r):
        return "n=0"
    w = r > 1
    gp, gl = (r[w] - 1).sum(), (1 - r[~w]).sum()
    return f"n={len(r):5d} win {w.mean():5.1%} mean {r.mean():6.3f} med {np.median(r):5.3f} PF {gp / gl if gl else np.inf:5.2f}"


def main():
    rows = []
    for d in sys.argv[1:]:
        cand, meta, swaps, liq, eb, ep = load_window(d)
        for pid, t in cand.items():
            if pid not in meta or not swaps.get(pid):
                continue
            q1, init = meta[pid]
            eu = ep[max(int(np.searchsorted(eb, init, side="right")) - 1, 0)]
            r = coin(q1, init, list(swaps[pid]), liq.get(pid, []), eu)
            if r is None:
                continue
            f, o = r
            rows.append({"window": Path(d).name, "pool": pid, "v4": t["ret"], "perfect": t["perfect"], **f,
                         **{k: o[k][0] for k in RULES}, **{f"why_{k}": o[k][1] for k in RULES}})
    print(f"coins: {len(rows)} from {len(sys.argv) - 1} windows\n")
    groups = [("ALL coins", lambda r: True),
              ("buy:sell COUNT >= 3:1", lambda r: r["buy_sell_cnt"] >= 3),
              ("buy:sell COUNT 1-3", lambda r: 1 <= r["buy_sell_cnt"] < 3),
              ("buy:sell COUNT < 1", lambda r: r["buy_sell_cnt"] < 1),
              ("busy: >= 3 swaps / 10 s", lambda r: r["density"] >= 3),
              ("tight: median gap <= 10 blocks (1 s)", lambda r: r["gap_med"] <= 10),
              ("accelerating: 2nd half >= 2x 1st", lambda r: r["accel"] >= 2),
              ("COMBO: cnt>=3 & busy>=3 & accel>=1", lambda r: r["buy_sell_cnt"] >= 3 and r["density"] >= 3 and r["accel"] >= 1)]
    for name, sel in groups:
        g = [r for r in rows if sel(r)]
        if not g:
            continue
        pk = np.array([r["perfect"] for r in g])
        print(f"== {name}   (>=2x possible {np.mean(pk >= 2):.1%}, >=10x {np.mean(pk >= 10):.1%})")
        print(f"   {'current v4 exit':18s} {stats([r['v4'] for r in g])}")
        for k in RULES:
            print(f"   {k:18s} {stats([r[k] for r in g])}")
    Path(sys.argv[1]).parent.joinpath("flow_rows.json").write_text(json.dumps(rows, default=float))


if __name__ == "__main__":
    main()
