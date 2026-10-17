# Agent 11 - reputasi dev (dev = pengirim transaksi mint, kolom dev di arena_feats). Kausal: riwayat dev hanya dari koin
# yang exit < decide koin yang dinilai. Hipotesis H2: dev yang sudah pernah rug lebih sering rug lagi (out-of-sample per periode).
import json, numpy as np, pandas as pd, os
os.chdir(os.path.dirname(os.path.abspath(__file__)))
pd.set_option("display.width", 250)
A = pd.read_csv("../../../data/arena_scored.csv").sort_values("decide").reset_index(drop=True)
D = pd.DataFrame(json.load(open("dec_base.json")))
bought = set(D[D.why == "beli"].pool)
A["rug"] = A.ret < 0.3; A["win"] = A.ret > 1
print("koin:", len(A), "| dev diketahui:", A.dev.notna().sum(), "| dev unik:", A.dev.nunique())
vc = A.dev.value_counts()
print("dev dgn >=2 koin:", (vc >= 2).sum(), "| koin milik dev berulang:", vc[vc >= 2].sum(), f"({vc[vc>=2].sum()/A.dev.notna().sum():.1%})", "| dev terbanyak:", vc.iloc[:5].tolist())
def hist(i, only_bought):
    d = A.dev[i]
    if pd.isna(d): return "dev ?"
    m = (A.dev == d) & (A["exit"] < A.decide[i])
    if only_bought: m &= A.pool.isin(bought)
    h = A[m]
    if not len(h): return "belum dikenal"
    return "pernah rug" if h.rug.any() else "bersih"
for ob, nm in [(False, "riwayat dari SEMUA koin (bisa diketahui on-chain)"), (True, "riwayat hanya dari koin yang DIBELI (cara arena/bot)")]:
    A["g"] = [hist(i, ob) for i in range(len(A))]
    print("\n==", nm)
    print(A.groupby(["g"]).agg(n=("ret", "size"), rug=("rug", "mean"), win=("win", "mean"), ret=("ret", "mean")).round(3))
    print(A.pivot_table(index="g", columns="ds", values="rug", aggfunc=["mean", "size"]).round(3))
    A["g_" + ("b" if ob else "a")] = A.g
# di antara koin yang lolos ML (dibeli + honeypot ditolak): berapa yang devnya 'pernah rug'?
lolos = set(D[D.why.isin(["beli", "honey"])].pool)
L = A[A.pool.isin(lolos)]
print("\nkoin lolos ML (beli+ditolak honeypot):", len(L)); print(L.groupby("g_a").agg(n=("ret", "size"), rug=("rug", "mean"), ret=("ret", "mean")).round(3))
B = A[A.pool.isin(bought)]
print("\n178 dibeli, per riwayat dev (semua koin):"); print(B.groupby("g_a").agg(n=("ret", "size"), rug=("rug", "mean"), ret=("ret", "mean")).round(3))
A.to_csv("e1_rows.csv", index=False)
