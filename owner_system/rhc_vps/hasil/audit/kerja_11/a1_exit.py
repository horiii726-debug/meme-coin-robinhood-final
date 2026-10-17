# Agent 11 - analisis keluar/TP pada 178 trade uji maju final.
# Hanya membaca data; jalur harga dari data/state_*.csv (potret tiap >=10 dtk, harga on-chain nyata).
import json, numpy as np, pandas as pd, os
os.chdir(os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..", ".."))
T = pd.DataFrame(json.load(open("hasil/uji_maju_final/trade_final178_lengkap.json")))
DIR = {"u_ds5d": "u_ds5d", "u_ds24": "u_ds24", "m1": "m1", "m2": "m2"}
ST = {"u_ds5d": "ds5d", "u_ds24": "ds24", "m1": "m1", "m2": "m2"}
rec = {}
for ds, d in DIR.items():
    for l in open(f"data/{d}/trades.jsonl"):
        t = json.loads(l)
        if t["plan"] == "v4": rec[(ds, t["pool"])] = t
S = {ds: pd.read_csv(f"data/state_{s}.csv", usecols=["pid", "blk", "lmult", "b60", "s60", "b300", "s300", "tx60", "rem_frac", "net60_lp"]) for ds, s in ST.items()}
HZ = 324000
rows = []
for _, r in T.iterrows():
    t = rec.get((r.ds, r.pool))
    if t is None: continue
    p = S[r.ds]; p = p[p.pid == r.pool].sort_values("blk")
    o = dict(no=r.no, ds=r.ds, keluar=r.keluar, pnl=r.pnl, ret=r.ret, tp1=r.tp1, peakV=t["peakV"], perfect=t["perfect"],
             entry=t["entryBlk"], exit=t["exitBlk"], init=t["init"], hold_min=t["hold"], n_state=len(p))
    if len(p):
        V = np.exp(p.lmult.values); B = p.blk.values
        pre = B <= t["exitBlk"]
        vx = V[pre][-1] if pre.any() else np.nan
        end = t["init"] + HZ
        for nm, w in [("30m", 18000), ("2j", 72000), ("hz", 10**9)]:
            m = (B > t["exitBlk"]) & (B <= min(t["exitBlk"] + w, end))
            o["max_" + nm] = V[m].max() / vx if m.any() and vx > 0 else np.nan
        mlast = (B <= end)
        o["v_end"] = V[mlast][-1] / vx if mlast.any() and vx > 0 else np.nan
        o["last_state_min"] = (B[-1] - t["entryBlk"]) * 0.1 / 60
        if t.get("tp1Blk"):
            m = (B > t["tp1Blk"]) & (B <= end)
            vt = V[B <= t["tp1Blk"]][-1] if (B <= t["tp1Blk"]).any() else np.nan
            o["tp_max_after"] = V[m].max() / vt if m.any() else np.nan
    rows.append(o)
D = pd.DataFrame(rows); D.to_csv("hasil/audit/kerja_11/a1_exit_rows.csv", index=False)
print("trade dgn jalur state:", (D.n_state > 0).sum(), "/", len(D))
g = D[D.n_state > 0].groupby("keluar")
print(g.agg(n=("pnl", "size"), pnl=("pnl", "sum"), max30_med=("max_30m", "median"), max2j_med=("max_2j", "median"),
            p_naik50_2j=("max_2j", lambda s: (s >= 1.5).mean()), maxhz_med=("max_hz", "median"), vend_med=("v_end", "median")).round(3))
tp = D[D.tp1 & D.tp_max_after.notna()]
print("TP1: n", len(tp), "median maks sesudah TP1 / harga TP1", tp.tp_max_after.median().round(3),
      "| >=2x", (tp.tp_max_after >= 2).mean().round(3), "| >=3x", (tp.tp_max_after >= 3).mean().round(3))
print("peakV vs ret (semua): median peakV", D.peakV.median().round(3), "median ret", D.ret.median().round(3))
print("perfect (maks selama sim masih jalan) median", D.perfect.median().round(3))
