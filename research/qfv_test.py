"""Test the 'Quantum Fluctuation Vacuum' radar formula against real swaps.

Formula (from the owner's PDF):
  theta = pi / (1 + exp(var_gap / v_ratio)),  P = sin(theta)^2
  var_gap = variance of seconds between trades in the last 5 min
  v_ratio = ETH volume last 5 min / ETH volume last 1 h
Signal: P > 0.75 ("pump potential"); P < 0.5 ("dead").

Scan: every tradable coin at age 1 h, 1.5 h, ... 8 h (needs 1 h of history).
Label: max mid price in the next 1 h after a 3 s entry delay vs the entry price (>= 2x, >= 10x).
Baselines on the same scan points: v_ratio alone, trades in last 5 min, trade acceleration.

Usage: python qfv_test.py <window_dir> [...]
"""
import sys
import time
from collections import defaultdict
from pathlib import Path

import numpy as np
from sklearn.metrics import roc_auc_score

Q96 = 2.0 ** 96
NATIVE = "0x" + "0" * 40
ETH_POOL = "0x24107d152f14a76d292123265ae3f3c71f863fc2f4ef7ba49d64e78d28ea379e"
H1, M5, LAT, STEP, BLK_S = 36000, 3000, 30, 18000, 0.1


def qfv(var_gap, v_ratio):
    x = var_gap / v_ratio
    theta = np.pi / (1 + np.exp(np.minimum(x, 700)))
    return np.sin(theta) ** 2


def tradable(c0, c1, fee, hooks):
    return (c0 == NATIVE or c1 == NATIVE) and fee <= 5000 and ((int(hooks, 16) >> 7) & 1) == 0


def scan_window(d):
    d = Path(d)
    meta = {}
    for l in (d / "pools.csv").read_text().splitlines()[1:]:
        p = l.split(",")
        if tradable(p[1].lower(), p[2].lower(), float(p[3]), p[5]):
            meta[p[0]] = (p[2].lower() == NATIVE, int(p[6]))
    sw = defaultdict(list)
    with open(d / "swaps_sorted.csv") as f:
        next(f)
        for l in f:
            pid = l[:l.index(",")]
            if pid in meta:
                p = l.split(",")
                sw[pid].append((int(p[1]), int(p[2]), float(p[4]), float(p[5]), float(p[6]) / Q96))
    rows = []
    t_calc = 0.0
    for pid, s in sw.items():
        q1, init = meta[pid]
        a = np.array(sorted(s))
        blk = a[:, 0]
        vol = np.abs(a[:, 3] if q1 else a[:, 2]) / 1e18
        sp = a[:, 4]
        with np.errstate(divide="ignore"):
            price = sp ** 2 if q1 else 1 / sp ** 2
        for t in range(init + H1, init + 8 * H1 + 1, STEP // 1):
            i_end = int(np.searchsorted(blk, t, side="right"))
            i_h = int(np.searchsorted(blk, t - H1, side="right"))
            i_5 = int(np.searchsorted(blk, t - M5, side="right"))
            v_h, v_5 = vol[i_h:i_end].sum(), vol[i_5:i_end].sum()
            n5 = i_end - i_5
            ie = int(np.searchsorted(blk, t + LAT, side="right")) - 1
            jf = int(np.searchsorted(blk, t + H1, side="right"))
            if ie < 0 or jf <= ie + 1 or not np.isfinite(price[ie]) or price[ie] <= 0:
                continue
            fwd = np.nanmax(price[ie + 1:jf]) / price[ie]
            c0 = time.perf_counter()
            if n5 >= 3 and v_h > 0 and v_5 > 0:
                gaps = np.diff(blk[i_5:i_end]) * BLK_S
                var_gap, v_ratio = float(np.var(gaps)), v_5 / v_h
                p = float(qfv(var_gap, v_ratio))
            else:
                var_gap, v_ratio, p = np.nan, (v_5 / v_h if v_h > 0 else 0.0), 0.0   # no activity -> "dead vacuum"
            t_calc += time.perf_counter() - c0
            n_h = i_end - i_h
            rows.append((p, v_ratio, n5, n5 / max(n_h / 12, 1e-9), fwd >= 2, fwd >= 10, var_gap))
    return rows, t_calc


def report(name, score, y, mask=None):
    s = np.asarray(score, float)
    ok = np.isfinite(s)
    return f"{name:34s} AUC >=2x {roc_auc_score(y[0][ok], s[ok]):.3f} | AUC >=10x {roc_auc_score(y[1][ok], s[ok]):.3f}"


def main():
    rows, t_calc = [], 0.0
    for d in sys.argv[1:]:
        r, t = scan_window(d)
        rows += r
        t_calc += t
    a = np.array(rows, dtype=float)
    P, vr, n5, acc, up2, up10 = a[:, 0], a[:, 1], a[:, 2], a[:, 3], a[:, 4].astype(bool), a[:, 5].astype(bool)
    days = 2 * len(sys.argv[1:])
    print(f"scan points: {len(a):,} (coins aged 1-8 h, every 30 min) over ~{days} days | formula time {1e6 * t_calc / len(a):.1f} us/point")
    print(f"base rate next 1 h: >=2x {up2.mean():.2%} | >=10x {up10.mean():.3%}\n")
    print("ACCURACY (AUC: 0.5 = coin flip, 1.0 = perfect)")
    print("  " + report("QFV P_collapse (quantum formula)", P, (up2, up10)))
    print("  " + report("volume ratio 5m/1h alone", vr, (up2, up10)))
    print("  " + report("trades in last 5 min", n5, (up2, up10)))
    print("  " + report("trade acceleration 5m vs 1h avg", acc, (up2, up10)))
    print("\nSIGNAL TABLE (QFV thresholds from the PDF)")
    for name, m in (("P > 0.75  'PUMP POTENTIAL'", P > 0.75), ("0.50-0.75 'weak'", (P >= 0.5) & (P <= 0.75)), ("P < 0.50  'dead'", P < 0.5)):
        print(f"  {name:28s} signals {m.sum():7,} ({m.sum() / days:7.0f}/day) | hit >=2x {up2[m].mean():6.2%} | hit >=10x {up10[m].mean():7.3%}"
              f" | catches {up2[m].sum() / max(up2.sum(), 1):5.1%} of all 2x, {up10[m].sum() / max(up10.sum(), 1):5.1%} of all 10x")
    for name, s in (("trade acceleration", acc), ("trades in last 5 min", n5)):
        thr = np.quantile(s, 1 - (P > 0.75).mean())
        m = s >= thr
        print(f"  same #signals by {name:22s} hit >=2x {up2[m].mean():6.2%} | hit >=10x {up10[m].mean():7.3%}")


if __name__ == "__main__":
    main()
