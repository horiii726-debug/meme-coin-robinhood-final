# Agent 11 - model bahaya terlambat? nilai saat keluar dibanding puncak selama dipegang (jalur state), dan menit dari puncak ke keluar.
import json, numpy as np, pandas as pd, os
os.chdir(os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..", ".."))
D = pd.read_csv("hasil/audit/kerja_11/a1_exit_rows.csv")
T = pd.DataFrame(json.load(open("hasil/uji_maju_final/trade_final178_lengkap.json")))[["no", "pool"]]; D = D.merge(T, on="no")
ST = {"u_ds5d": "ds5d", "u_ds24": "ds24", "m1": "m1", "m2": "m2"}
S = {ds: pd.read_csv(f"data/state_{s}.csv", usecols=["pid", "blk", "lmult"]) for ds, s in ST.items()}
o = []
for _, r in D[D.keluar == "model bahaya"].iterrows():
    p = S[r.ds]; p = p[(p.pid == r.pool) & (p.blk <= r.exit)]
    if not len(p): continue
    V = np.exp(p.lmult.values); B = p.blk.values; i = V.argmax()
    o.append(dict(ds=r.ds, vx_peak=V[-1] / V.max(), menit_puncak_ke_keluar=(r.exit - B[i]) * 0.1 / 60, hold=r.hold_min))
O = pd.DataFrame(o)
print("model bahaya n", len(O), "| V_keluar/V_puncak median", O.vx_peak.median().round(3), "p25", O.vx_peak.quantile(.25).round(3),
      "| menit puncak->keluar median", O.menit_puncak_ke_keluar.median().round(2), "| lama pegang median", O.hold.median().round(1))
print(O.groupby("ds").agg(n=("hold", "size"), vx_peak=("vx_peak", "median"), lag=("menit_puncak_ke_keluar", "median")).round(3))
