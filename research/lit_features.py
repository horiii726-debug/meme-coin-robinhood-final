"""Minute-1 features from the quantitative-finance literature (causal: only data up to init+600 blocks).

  hawkes_n     Hawkes branching ratio proxy n = 1 - 1/sqrt(Fano) from 5 s trade counts
               (Filimonov & Sornette 2012; Hardiman, Bercot & Bouchaud 2013; Bacry, Mastromatteo & Muzy 2015)
  fano         variance/mean of 5 s trade counts (overdispersion = clustering)
  vpin         mean |buy - sell| / volume over equal-volume buckets (Easley, Lopez de Prado & O'Hara 2012)
  amihud       mean |log return| per ETH traded (Amihud 2002)
  roll         2*sqrt(-cov(dp_t, dp_t-1)) on log price, 0 if cov >= 0 (Roll 1984)
  rv, bv, jump_share   realized variance, bipower variation, (rv-bv)/rv (Barndorff-Nielsen & Shephard 2004/2006)
  lm_jump      max |r| / sqrt(bv / n)  (Lee & Mykland 2008)
  sqrt_impact  slope of |dlog p| on sqrt(ETH size) through origin (Toth et al. 2011 square-root law)
  accel        trades in 2nd half of minute 1 / 1st half
  trader_growth  new unique buyer wallets 2nd half / 1st half (token transfers)
  sniper_share   share of minute-1 buy volume bought in the first 3 s (memecoin sniper literature)
"""
import json
from pathlib import Path

import numpy as np

NATIVE = "0x" + "0" * 40
PM = "0x8366a39cc670b4001a1121b8f6a443a643e40951"
Q96 = 2.0 ** 96
LIT_FEATS = ["hawkes_n", "fano", "vpin", "amihud", "roll", "rv", "bv", "jump_share", "lm_jump", "sqrt_impact",
             "accel", "trader_growth", "sniper_share"]


def coin_features(q1, init, rows, transfers):
    f = dict.fromkeys(LIT_FEATS, np.nan)
    if not rows:
        return f
    a = sorted(rows, key=lambda r: (r[0], r[1]))
    blk = np.array([r[0] for r in a], float)
    a0 = np.array([float(r[2]) for r in a])
    a1 = np.array([float(r[3]) for r in a])
    sp = np.array([float(r[4]) for r in a]) / Q96
    buy = (a0 if q1 else a1) > 0
    vol = np.abs(a1 if q1 else a0) / 1e18
    n = len(a)
    # trade arrival clustering (Hawkes)
    counts = np.bincount(np.clip(((blk - init) // 50).astype(int), 0, 11), minlength=12)
    m = counts.mean()
    if m > 0:
        fano = counts.var() / m
        f["fano"] = fano
        f["hawkes_n"] = float(np.clip(1 - 1 / np.sqrt(fano), -1, 1)) if fano > 0 else -1.0
    half = int((blk <= init + 300).sum())
    f["accel"] = (n - half) / max(half, 1)
    # VPIN over 5 equal-volume buckets
    tot = vol.sum()
    if tot > 0 and n >= 5:
        edges = np.linspace(0, tot, 6)
        cum = np.cumsum(vol)
        b = np.clip(np.searchsorted(edges, cum, side="left") - 1, 0, 4)
        imb = [abs(vol[(b == k) & buy].sum() - vol[(b == k) & ~buy].sum()) for k in range(5)]
        f["vpin"] = float(np.sum(imb) / tot)
    # prices & returns
    with np.errstate(divide="ignore", invalid="ignore"):
        lp = np.log(sp ** 2) if q1 else -np.log(sp ** 2)
    ok = np.isfinite(lp)
    lp, v2 = lp[ok], vol[ok]
    if len(lp) >= 3:
        r = np.diff(lp)
        f["amihud"] = float(np.mean(np.abs(r) / np.maximum(v2[1:], 1e-9)))
        c = np.cov(r[1:], r[:-1])[0, 1] if len(r) >= 3 else np.nan
        f["roll"] = float(2 * np.sqrt(-c)) if np.isfinite(c) and c < 0 else 0.0
        rv = float(np.sum(r ** 2))
        bv = float((np.pi / 2) * np.sum(np.abs(r[1:]) * np.abs(r[:-1]))) if len(r) >= 2 else np.nan
        f["rv"], f["bv"] = rv, bv
        f["jump_share"] = float(max(rv - bv, 0) / rv) if rv > 0 and np.isfinite(bv) else np.nan
        f["lm_jump"] = float(np.max(np.abs(r)) / np.sqrt(bv / len(r))) if bv and bv > 0 else np.nan
        x = np.sqrt(np.maximum(v2[1:], 0))
        f["sqrt_impact"] = float(np.sum(x * np.abs(r)) / np.sum(x * x)) if np.sum(x * x) > 0 else np.nan
    bv_all = vol[buy].sum()
    f["sniper_share"] = float(vol[buy & (blk <= init + 30)].sum() / bv_all) if bv_all > 0 else np.nan
    # unique buyer wallets (token transfers out of the pool manager / routers -> recipients)
    if transfers:
        seen, first, second = set(), 0, 0
        for t in sorted(transfers.get("tr", []), key=lambda x: (x[0], x[1])):
            to = t[3].lower()
            if to in (PM, NATIVE) or to in seen:
                continue
            seen.add(to)
            if t[0] <= init + 300:
                first += 1
            else:
                second += 1
        f["trader_growth"] = second / max(first, 1)
    return f


def window_features(d):
    d = Path(d)
    pools = {}
    for l in (d / "pools.csv").read_text().splitlines()[1:]:
        p = l.split(",")
        pools[p[0]] = (p[2].lower() == NATIVE, int(p[6]))
    m1 = json.loads((d / "swaps_m1.json").read_text())
    tf = json.loads((d / "transfers.json").read_text())
    return {pid: coin_features(*pools[pid], rows, tf.get(pid)) for pid, rows in m1.items() if pid in pools}
