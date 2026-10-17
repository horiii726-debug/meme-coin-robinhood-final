# Agent 11 - apa yang terjadi SESUDAH keluar (model bahaya / stop / dump)? Nilai sisa posisi bila tetap dipegang.
# Nilai = 0 kalau LP ditarik >80% (rug) sebelum titik waktu itu. Jalur dari state_*.csv (potret on-chain nyata).
import json, numpy as np, pandas as pd, os
os.chdir(os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..", ".."))
D = pd.read_csv("hasil/audit/kerja_11/a1_exit_rows.csv")
R = pd.read_csv("hasil/audit/kerja_11/a2_lp_rows.csv")[["no", "rug_min"]]
D = D.merge(R, on="no")
ST = {"u_ds5d": "ds5d", "u_ds24": "ds24", "m1": "m1", "m2": "m2"}
S = {ds: pd.read_csv(f"data/state_{s}.csv", usecols=["pid", "blk", "lmult"]) for ds, s in ST.items()}
T = pd.DataFrame(json.load(open("hasil/uji_maju_final/trade_final178_lengkap.json")))[["no", "pool"]]
D = D.merge(T, on="no")
out = []
for _, r in D.iterrows():
    p = S[r.ds]; p = p[p.pid == r.pool]
    B = p.blk.values; V = np.exp(p.lmult.values)
    if not len(B) or not (B <= r.exit).any(): continue
    vx = V[B <= r.exit][-1]
    rugB = None if pd.isna(r.rug_min) else r.entry + r.rug_min * 600
    o = dict(no=r.no, ds=r.ds, keluar=r.keluar, pnl=r.pnl)
    for nm, w in [("5m", 3000), ("30m", 18000), ("2j", 72000), ("akhir", r.init + 324000 - r.exit)]:
        tb = r.exit + w
        if rugB is not None and rugB <= tb: o["v_" + nm] = 0.0
        else:
            m = B <= tb
            o["v_" + nm] = V[m][-1] / vx
    out.append(o)
O = pd.DataFrame(out)
pd.set_option("display.width", 250)
print(O.groupby("keluar").agg(n=("pnl", "size"), med5=("v_5m", "median"), mean5=("v_5m", "mean"), med30=("v_30m", "median"), mean30=("v_30m", "mean"),
                              med2j=("v_2j", "median"), mean2j=("v_2j", "mean"), rug2j=("v_2j", lambda s: (s == 0).mean()), meanakhir=("v_akhir", "mean")).round(3))
for ds in ["u_ds5d", "u_ds24", "m1", "m2"]:
    x = O[(O.keluar == "model bahaya") & (O.ds == ds)]
    print(ds, "model bahaya n", len(x), "mean v_30m", x.v_30m.mean().round(3), "mean v_2j", x.v_2j.mean().round(3))
O.to_csv("hasil/audit/kerja_11/a3_after_rows.csv", index=False)
