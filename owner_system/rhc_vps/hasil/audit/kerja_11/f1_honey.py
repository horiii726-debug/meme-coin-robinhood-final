# Agent 11 - honeypot. Di arena, "honeypot" = belum ada swap JUAL di menit-1 (jual_m1==0), arena.js:80.
# Bukti on-chain bisa-dijual: ada swap jual (s60/s300 > 0) di jalur state_*.csv sesudah menit-1.
# Hipotesis H3: sebagian besar dari 120 koin itu sebenarnya bisa dijual (ada penjual kemudian), jadi penolakan ini membuang peluang.
import json, numpy as np, pandas as pd, os
os.chdir(os.path.dirname(os.path.abspath(__file__)))
pd.set_option("display.width", 250)
A = pd.read_csv("../../../data/arena_scored.csv")
D = pd.DataFrame(json.load(open("dec_base.json")))
ST = {"u_ds5d": "ds5d", "u_ds24": "ds24", "m1": "m1", "m2": "m2", "ags1": "ags1", "ags4": "ags4"}
sell = {}
for ds, s in ST.items():
    S = pd.read_csv(f"../../../data/state_{s}.csv", usecols=["pid", "s60", "s300", "b300"])
    g = S.groupby("pid").agg(s=("s300", "max"), s60=("s60", "sum"), b=("b300", "max"), n=("s60", "size"))
    for p, r in g.iterrows(): sell[p] = (r.s > 0 or r.s60 > 0, r.b > 0)
def cek(p):
    if p not in sell: return "tidak ada data jalur"
    return "ada jual sesudah m1" if sell[p][0] else ("hanya beli, tanpa jual" if sell[p][1] else "tanpa swap")
H = D[D.why == "honey"].merge(A[["pool", "ret", "n_sell", "n_buy", "n_sellers", "dev"]], on="pool", suffixes=("", "_a"))
H["bukti"] = H.pool.map(cek); H["rug"] = H.ret < 0.3
print("120 ditolak honeypot per periode:", H.ds.value_counts().to_dict())
print(H.groupby("bukti").agg(n=("ret", "size"), ret_sim=("ret", "mean"), win=("ret", lambda s: (s > 1).mean()), rug=("rug", "mean")).round(3))
print("n_buy menit-1 median", H.n_buy.median(), "| n_sell menit-1 (harus 0):", H.n_sell.max())
B = D[D.why == "beli"].merge(A[["pool", "ret", "n_sell", "n_sellers", "jual_m1"]], on="pool", suffixes=("", "_a"))
B["bukti"] = B.pool.map(cek)
print("\n178 dibeli: bukti jual sesudah m1:", B.bukti.value_counts().to_dict())
print("dibeli dgn hanya 1 penjual menit-1 (n_sellers<=1):", int((B.n_sellers <= 1).sum()), "rug", round((B[B.n_sellers <= 1].ret < 0.3).mean(), 3),
      "| n_sellers>=2 rug", round((B[B.n_sellers >= 2].ret < 0.3).mean(), 3))
# pembanding: ret kontrafaktual semua koin lolos ML berdasarkan jual_m1
print("\nkoin lolos-ML: ret rata2 jual_m1==0", H.ret.mean().round(3), "vs dibeli", B.ret.mean().round(3))
H.to_csv("f1_honey_rows.csv", index=False)
