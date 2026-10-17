"""Assemble everything the dashboard shows into report.json (all numbers from real on-chain data / sims).

Usage: python report_data.py <settings_dir_name> <window> [<window> ...]
  equity curve per trade, every trade with entry/exit reasons, Monte Carlo (block bootstrap), stress MC,
  luck test, model tests, tuning, stress scenarios, side experiments.
"""
import bisect
import os
import datetime as dt
import json
import sys
from pathlib import Path

import numpy as np

WORK = Path("/tmp/claude-0/-root/af19755f-534a-4afa-9b0b-1adc352c44c6/scratchpad/rhc_work")
NATIVE = "0x" + "0" * 40
ETH_POOL = "0x24107d152f14a76d292123265ae3f3c71f863fc2f4ef7ba49d64e78d28ea379e"
EXIT_REASON = {  # engine reason codes (Indonesian in the bot) -> short English label
    "tanda pucuk": "top signal (sell size surge after >=3x)",
    "model bahaya": "danger model >= threshold",
    "dump >=5% LP": "single sell >= 5% of pool",
    "stop -40%": "stop -40% before TP1",
    "stop bencana": "disaster stop",
    "rug": "liquidity pulled",
    "batas 9 jam": "9 h time limit",
    "akhir data": "end of data",
    "tanpa swap setelah masuk": "no swaps after entry",
}


def block_clock():
    pts = []
    for l in (WORK / "census.txt").read_text().splitlines():
        p = l.split()
        pts.append((int(p[2]), dt.datetime.strptime(p[0] + " " + p[1], "%Y-%m-%d %H:%M").replace(tzinfo=dt.timezone.utc).timestamp()))
    pts.sort()
    bs, ts = [p[0] for p in pts], [p[1] for p in pts]

    def to_ts(b):
        i = min(max(bisect.bisect_right(bs, b) - 1, 0), len(bs) - 2)
        return ts[i] + (b - bs[i]) * (ts[i + 1] - ts[i]) / (bs[i + 1] - bs[i])
    return to_ts


def window_meta(w):
    d = WORK / "data" / w
    pools = {}
    for l in (d / "pools.csv").read_text().splitlines()[1:]:
        p = l.split(",")
        pools[p[0]] = {"c0": p[1].lower(), "c1": p[2].lower(), "fee": float(p[3]), "init": int(p[6])}
    m1 = json.loads((d / "swaps_m1.json").read_text())
    dev = json.loads((d / "dev_creator.json").read_text())
    return pools, m1, dev


def minute1_stats(meta, rows):
    q1 = meta["c1"] == NATIVE
    init = meta["init"]
    buys = [r for r in rows if float(r[2] if q1 else r[3]) > 0]
    n, nb = len(rows), len(buys)
    first = sum(1 for r in rows if r[0] <= init + 300)
    return {"buys": nb, "sells": n - nb, "per10s": round(n / 6, 2), "accel": round((n - first) / max(first, 1), 2)}


def quarter_kelly(rets, kmax):
    """Same as bot.rs kelly() after 100 trades: grid f in [0.01, 0.6], maximise mean log growth, /4, clamp [0.01, kmax]."""
    best, bv = 0.02, -1e9
    for f in np.arange(0.01, 0.6001, 0.005):
        v = 1 + f * (rets - 1)
        if (v <= 0).any():
            continue
        g = np.log(v).mean()
        if g > bv:
            bv, best = g, f
    return float(min(max(best / 4, 0.01), kmax))


def monte_carlo(ret, cap, kmax=0.10, n_paths=10000, block=20, horizon=None, haircut=0.0, seed=7):
    """Block bootstrap of real trades (blocks of 20 consecutive trades keep losing streaks and regimes together).
    Position size follows the bot's own rule (bot.rs kelly + drawdown brake + 60% kill switch), capped at 1% of that
    coin's pool liquidity. Trades are applied one after another (the real bot overlaps up to MAX_POS positions)."""
    rng = np.random.default_rng(seed)
    n = len(ret)
    horizon = horizon or n
    qk = quarter_kelly(ret, kmax)
    nb = int(np.ceil(horizon / block))
    starts = rng.integers(0, n - block + 1, size=(n_paths, nb))
    idx = (starts[:, :, None] + np.arange(block)[None, None, :]).reshape(n_paths, -1)[:, :horizon]
    eq = np.full(n_paths, 100.0)
    peak = eq.copy()
    alive = np.ones(n_paths, bool)
    path = np.empty((n_paths, horizon))
    for k in range(horizon):
        j = idx[:, k]
        frac = 0.02 if k < 30 else (0.094 if k < 100 else qk)
        dd = 1 - eq / peak
        mult = np.where(dd > 0.30, 0.25, np.where(dd > 0.20, 0.5, np.where(dd > 0.10, 0.75, 1.0)))
        pos = np.minimum(frac * eq * mult, cap[j]) * alive
        eq = np.maximum(eq + pos * (ret[j] * (1 - haircut) - 1), 0.0)
        peak = np.maximum(peak, eq)
        alive &= (1 - eq / peak) < 0.60
        path[:, k] = eq
    pk = np.maximum.accumulate(np.concatenate([np.full((n_paths, 1), 100.0), path], axis=1), axis=1)[:, 1:]
    maxdd = (1 - path / np.maximum(pk, 1e-9)).max(axis=1)
    final = path[:, -1]
    stride = max(1, horizon // 300)
    pct = {str(q): np.quantile(path, q / 100, axis=0) for q in (5, 25, 50, 75, 95)}
    h = np.histogram(np.log10(np.maximum(final, 1e-2)), bins=40)
    return {
        "horizon_trades": horizon, "n_paths": n_paths, "block": block, "haircut": haircut, "kelly_after_100": qk,
        "fan": {k: [round(float(x), 2) for x in v[::stride]] for k, v in pct.items()}, "fan_x": list(range(1, horizon + 1, stride)),
        "sample_paths": [[round(float(x), 2) for x in path[i, ::stride]] for i in range(40)],
        "final": {"p5": float(np.quantile(final, .05)), "p25": float(np.quantile(final, .25)), "p50": float(np.median(final)),
                  "p75": float(np.quantile(final, .75)), "p95": float(np.quantile(final, .95))},
        "prob_loss": float((final < 100).mean()), "prob_below_50": float((final < 50).mean()),
        "prob_ruin_10": float((path.min(axis=1) < 10).mean()), "prob_kill_switch": float((~alive).mean()),
        "maxdd": {"p50": float(np.median(maxdd)), "p95": float(np.quantile(maxdd, .95))},
        "prob_dd_over_50": float((maxdd > 0.5).mean()),
        "final_hist": h[0].tolist(), "final_hist_edges": h[1].round(3).tolist(),
    }


def eth_prices(w):
    eth = []
    with open(WORK / "data" / w / "swaps_sorted.csv") as f:
        for l in f:
            if l.startswith(ETH_POOL):
                p = l.split(",")
                sp = float(p[6]) / 2 ** 96
                eth.append((int(p[1]), sp * sp * 1e12))
    eth.sort()
    return [e[0] for e in eth], [e[1] for e in eth]


def lp_at_entry(meta, rows, eth_b, eth_p):
    """Pool liquidity (USD) from the last minute-1 swap state."""
    if not rows:
        return float("nan")
    r = max(rows, key=lambda x: (x[0], x[1]))
    sp, L = float(r[4]) / 2 ** 96, float(r[5])
    e = eth_p[max(bisect.bisect_right(eth_b, meta["init"]) - 1, 0)]
    return 2 * (L * sp if meta["c1"] == NATIVE else L / sp) / 1e18 * e


def main():
    settings, wins = sys.argv[1], sys.argv[2:]
    to_ts = block_clock()
    chain = WORK / "chain" / settings
    trades, eq = [], 100.0
    for w in wins:
        pools, m1, dev = window_meta(w)
        eth_b, eth_p = eth_prices(w)
        scores = {}
        for l in (chain / f"{w}.jsonl.skor.csv").read_text().splitlines()[1:]:
            p, s = l.split(",")
            scores[p] = float(s) if s not in ("NaN", "nan") else None
        sv = np.array([v for v in scores.values() if v is not None and np.isfinite(v)])
        rows = [json.loads(l) for l in (chain / f"{w}.jsonl").read_text().splitlines() if l.strip()]
        for t in rows:
            meta = pools[t["pool"]]
            tok = meta["c1"] if meta["c0"] == NATIVE else meta["c0"]
            s = scores.get(t["pool"])
            trades.append({"window": w, "pool": t["pool"], "token": tok, "entry_blk": t["masuk"], "exit_blk": t["keluar"],
                           "entry_ts": to_ts(t["masuk"]), "exit_ts": to_ts(t["keluar"]),
                           "size": t["pos"], "back": t["kembali"], "pnl": t["kembali"] - t["pos"], "ret": t["ret"],
                           "exit_reason": t["alasan"], "exit_reason_en": EXIT_REASON.get(t["alasan"], t["alasan"]),
                           "ml_score": s, "ml_pct": float((sv < s).mean()) if s is not None and len(sv) else None,
                           "dev": (dev.get(t["pool"]) or {}).get("dev"),
                           "m1": minute1_stats(meta, m1.get(t["pool"], [])), "lp_usd": lp_at_entry(meta, m1.get(t["pool"], []), eth_b, eth_p), "hold_min": (t["keluar"] - t["masuk"]) * 0.1 / 60})
    # realized equity: each trade's pnl lands at its exit; equity before a trade = realized equity at its entry
    by_exit = sorted(range(len(trades)), key=lambda i: trades[i]["exit_blk"])
    exits_blk = [trades[i]["exit_blk"] for i in by_exit]
    cum = np.cumsum([trades[i]["pnl"] for i in by_exit])
    curve = [{"ts": trades[i]["exit_ts"], "equity": round(100 + float(c), 2)} for i, c in zip(by_exit, cum)]
    for t in trades:
        k = bisect.bisect_left(exits_blk, t["entry_blk"])
        t["equity_before"] = 100 + (float(cum[k - 1]) if k > 0 else 0.0)
    order = sorted(range(len(trades)), key=lambda i: trades[i]["entry_blk"])
    frac = np.array([trades[i]["size"] / trades[i]["equity_before"] for i in order])
    ret = np.array([trades[i]["ret"] for i in order])
    cap = np.array([0.01 * trades[i]["lp_usd"] if np.isfinite(trades[i]["lp_usd"]) else trades[i]["size"] for i in order])
    cap = np.maximum(cap, np.array([trades[i]["size"] for i in order]))  # never below what was actually traded
    eqv = np.array([c["equity"] for c in curve])
    peak = np.maximum.accumulate(np.concatenate([[100.0], eqv]))[1:]
    days = (trades[order[-1]]["exit_ts"] - trades[order[0]]["entry_ts"]) / 86400
    wins_ = ret > 1
    gp, gl = sum(t["pnl"] for t in trades if t["pnl"] > 0), -sum(t["pnl"] for t in trades if t["pnl"] < 0)
    summary = {"settings": settings, "windows": wins, "start": 100.0, "end": float(eqv[-1]), "trades": len(trades),
               "win_rate": float(wins_.mean()), "profit_factor": gp / gl if gl else None, "max_dd": float((1 - eqv / peak).max()),
               "days": days, "first_ts": trades[order[0]]["entry_ts"], "last_ts": trades[order[-1]]["exit_ts"],
               "median_hold_min": float(np.median([t["hold_min"] for t in trades])),
               "top5_share": float(sorted([t["pnl"] for t in trades], reverse=True)[:5] and sum(sorted([t["pnl"] for t in trades], reverse=True)[:5]) / (gp - gl))}
    per_day = {}
    for t in trades:
        d = dt.datetime.fromtimestamp(t["exit_ts"], dt.timezone.utc).strftime("%Y-%m-%d")
        per_day.setdefault(d, [0, 0.0])
        per_day[d][0] += 1
        per_day[d][1] += t["pnl"]
    reasons = {}
    for t in trades:
        r = reasons.setdefault(t["exit_reason"], {"n": 0, "pnl": 0.0, "wins": 0})
        r["n"] += 1
        r["pnl"] += t["pnl"]
        r["wins"] += t["pnl"] > 0
    per_trade_days = len(trades) / max(days, 1e-9)
    kmax = float(os.environ.get("KELLY_MAKS", "0.10"))
    mc = {"same_length": monte_carlo(ret, cap, kmax),
          "projection_30d": monte_carlo(ret, cap, kmax, horizon=int(round(per_trade_days * 30))),
          "haircut_5": monte_carlo(ret, cap, kmax, haircut=0.05),
          "haircut_10": monte_carlo(ret, cap, kmax, haircut=0.10),
          "haircut_20": monte_carlo(ret, cap, kmax, haircut=0.20),
          "haircut_30": monte_carlo(ret, cap, kmax, haircut=0.30)}
    extra = {}
    for name in ("stress_results.json", "luck_result.json", "eval_result.json", "tune_summary.json", "experiments.json"):
        f = WORK / name
        if f.exists():
            extra[name.replace(".json", "")] = json.loads(f.read_text())
    out = {"generated": dt.datetime.now(dt.timezone.utc).isoformat(), "summary": summary, "curve": curve,
           "per_day": [{"day": k, "trades": v[0], "pnl": v[1]} for k, v in sorted(per_day.items())],
           "exit_reasons": reasons, "trades": [trades[i] for i in order], "monte_carlo": mc, **extra}
    (WORK / f"report_{settings}.json").write_text(json.dumps(out, default=float))
    s = summary
    print(f"{settings}: ${s['start']:.0f} -> ${s['end']:,.2f} | {s['trades']} trades | win {s['win_rate']:.1%} | PF {s['profit_factor']:.2f} | "
          f"maxDD {s['max_dd']:.1%} | {s['days']:.1f} days")
    for k, m in mc.items():
        print(f"  MC {k:15s} horizon {m['horizon_trades']:5d} | final p5 ${m['final']['p5']:,.0f} p50 ${m['final']['p50']:,.0f} p95 ${m['final']['p95']:,.0f}"
              f" | P(loss) {m['prob_loss']:.1%} | P(DD>50%) {m['prob_dd_over_50']:.1%} | P(ruin<$10) {m['prob_ruin_10']:.1%}")


if __name__ == "__main__":
    main()
