# Agent 11 - (a) roket: koin yang nilai posisinya pernah >=10x (dan >=3x) sesudah init+600 (jalur state_*.csv, 9 jam).
# V = nilai jual posisi hipotetis (min($200, 1% LP)) dibanding modal -> sudah termasuk slippage jual, harga on-chain nyata.
import json, numpy as np, pandas as pd, os
os.chdir(os.path.dirname(os.path.abspath(__file__)))
pd.set_option("display.width", 250); pd.set_option("display.max_columns", 30)
P = {"ags1": "ags1", "ags4": "ags4", "ds5d": "u_ds5d", "ds24": "u_ds24", "m1": "m1", "m2": "m2"}
pk = []
for s, ds in P.items():
    S = pd.read_csv(f"../../../data/state_{s}.csv", usecols=["pid", "blk", "lpeak", "t_entry"])
    g = S.sort_values("blk").groupby("pid")
    a = g.lpeak.max().rename("lpeak").to_frame()
    # menit (sejak masuk) saat pertama kali mencapai 3x dan 10x
    for x in [3, 10]:
        a[f"t{x}"] = S[S.lpeak >= np.log(x)].groupby("pid").t_entry.min()
    a["ds"] = ds; pk.append(a)
PK = pd.concat(pk); PK["peak"] = np.exp(PK.lpeak)
D = pd.DataFrame(json.load(open("dec_base.json"))).set_index("pool")
A = pd.read_csv("../../../data/arena_scored.csv").set_index("pool")
T = pd.DataFrame(json.load(open("../../uji_maju_final/trade_final178_lengkap.json"))).set_index("pool")
C = pd.DataFrame(json.load(open("ar_base.json"))["closed"]).set_index("pool")
PK["keputusan"] = [D.why.get(p, "tidak di arena") for p in PK.index]
PK["skor"] = [A.score.get(p, np.nan) for p in PK.index]
PK["ret_sim"] = [A.ret.get(p, np.nan) for p in PK.index]
print("pool dengan jalur state:", len(PK), "| arena koin:", len(A))
for x in [3, 10]:
    R = PK[PK.peak >= x]
    print(f"\n== koin pernah >= {x}x: {len(R)} (per periode {R.ds.value_counts().to_dict()})")
    print("  keputusan:", R.keputusan.value_counts().to_dict())
    print(f"  menit ke {x}x (median sejak masuk):", R[f"t{x}"].median())
    b = R[R.keputusan == "beli"]
    for p, r in b.iterrows():
        t = T.loc[p]; c = C.loc[p]
        print(f"   DIBELI {p[:10]} {r.ds} puncak {r.peak:.1f}x | keluar '{t.keluar}' ret {t.ret:.2f} tp1 {t.tp1} peakV-saat-pegang {t.peak:.2f} | posisi ${c.pos:.2f} pnl ${t.pnl:.2f} | "
              f"tertinggal (hindsight) ${c.pos*(r.peak - t.ret):.0f}")
    nb = R[R.keputusan != "beli"]
    print("  tidak dibeli: skor median", nb.skor.median().round(3), "| ret kontrafaktual strategi (sim v4) median", nb.ret_sim.median().round(3), "mean", nb.ret_sim.mean().round(3))
    print(nb.groupby("keputusan").agg(n=("peak", "size"), puncak_med=("peak", "median"), ret_sim=("ret_sim", "mean")).round(2))
PK.to_csv("g1_roket_rows.csv")
