# Agent 11 - TP1: harga saat TP1 vs harga saat keluar akhir (apakah 60% yang dijual di TP memotong roket?)
import json, numpy as np, pandas as pd, os
os.chdir(os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..", ".."))
T = pd.DataFrame(json.load(open("hasil/uji_maju_final/trade_final178_lengkap.json")))
ST = {"u_ds5d": "ds5d", "u_ds24": "ds24", "m1": "m1", "m2": "m2"}
S = {ds: pd.read_csv(f"data/state_{s}.csv", usecols=["pid", "blk", "lmult"]) for ds, s in ST.items()}
rec = {}
for ds in ST:
    for l in open(f"data/{ds}/trades.jsonl"):
        t = json.loads(l)
        if t["plan"] == "v4": rec[(ds, t["pool"])] = t
rows = []
for _, r in T.iterrows():
    t = rec.get((r.ds, r.pool))
    if not t or not t["tp1"]: continue
    p = S[r.ds]; p = p[p.pid == r.pool]; B = p.blk.values; V = np.exp(p.lmult.values)
    if not (B <= t["tp1Blk"]).any(): continue
    vt = V[B <= t["tp1Blk"]][-1]; vx = V[B <= t["exitBlk"]][-1]
    rows.append(dict(no=r.no, ds=r.ds, pnl=r.pnl, tp1V=t["tp1V"], exit_over_tp=vx / vt, peak_over_tp=t["peakV"] / t["tp1V"]))
X = pd.DataFrame(rows)
print("trade TP1:", len(X), "| median V_keluar/V_TP1", X.exit_over_tp.median().round(3), "mean", X.exit_over_tp.mean().round(3),
      "| >1 (TP rugi dibanding jual semua di akhir):", (X.exit_over_tp > 1).mean().round(3))
print("peakV/tp1V median", X.peak_over_tp.median().round(3), ">=2x", (X.peak_over_tp >= 2).mean().round(3))
print("tp1V (harga saat TP1 dipicu): median", X.tp1V.median().round(3), "| >1,3 (indikasi TP ditunda p_naik):", (X.tp1V > 1.3).sum(), "trade, pnl", X[X.tp1V > 1.3].pnl.sum().round(0), "| <=1,3:", (X.tp1V <= 1.3).sum(), "pnl", X[X.tp1V <= 1.3].pnl.sum().round(0))
print(X.groupby("ds").agg(n=("pnl", "size"), tunda=("tp1V", lambda s: (s > 1.3).mean()), exit_over_tp=("exit_over_tp", "mean")).round(3))
