# Agent 11 - "jangan buang peluru": sinyal rezim yang DIKETAHUI saat keputusan (kausal), vs hasil trade.
# Hipotesis H6: rug-rate koin yang sudah tutup (N terakhir) dan hasil trade sendiri yang sudah tutup lebih rendah/buruk di ±5 Sep
# daripada m1/m2, sehingga aturan "berhenti" yang dipilih di ds5d+ds24 menyaring rugi tanpa memotong m1/m2.
import json, numpy as np, pandas as pd, os
from scipy.stats import spearmanr
os.chdir(os.path.dirname(os.path.abspath(__file__)))
pd.set_option("display.width", 250); pd.set_option("display.max_columns", 30)
A = pd.read_csv("../../../data/arena_scored.csv").sort_values("decide").reset_index(drop=True)
T = pd.read_csv("c1_rows.csv").merge(A[["pool","decide"]], on="pool")
C = pd.DataFrame(json.load(open("ar_base.json"))["closed"])   # trade akun yang sudah tutup (urut tutup)
dec, ex, ret = A.decide.values, A["exit"].values, A.ret.values
def sig(d):
    o = {}
    o["lahir_1j"] = int(((dec < d) & (dec >= d - 36000)).sum())                 # koin baru (lolos 'safe') 1 jam terakhir
    cl = np.where(ex < d)[0]; cl = cl[np.argsort(ex[cl])][-50:]
    o["rug50"] = (ret[cl] < 0.3).mean() if len(cl) >= 20 else np.nan           # rug-rate 50 koin terakhir yg sudah tutup
    o["ret50"] = np.median(ret[cl]) if len(cl) >= 20 else np.nan
    sc = A.score.values[(dec < d)][-100:]; sc = sc[~np.isnan(sc)]
    o["skor100"] = sc.mean() if len(sc) >= 30 else np.nan
    own = C[C.blk < d].tail(10)                                                   # 10 trade SENDIRI terakhir yg sudah tutup
    o["own10"] = own.ret.median() if len(own) >= 5 else np.nan
    o["own10_rug"] = (own.ret < 0.3).mean() if len(own) >= 5 else np.nan
    return o
S = pd.DataFrame([sig(d) for d in T.decide.values]); T = pd.concat([T.reset_index(drop=True), S], axis=1)
T.to_csv("d1_rows.csv", index=False)
K = ["lahir_1j", "rug50", "ret50", "skor100", "own10", "own10_rug"]
print("rata2 sinyal per periode (di 178 trade) + hasil:")
print(T.groupby("ds").agg(n=("pnl", "size"), rgas=("rgas", "mean"), **{k: (k, "mean") for k in K}).round(3))
print("\nspearman sinyal vs ret bersih per trade (rgas):")
for k in K:
    out = []
    for ds in ["u_ds5d", "u_ds24", "m1", "m2"]:
        x = T[T.ds == ds][[k, "rgas"]].dropna()
        out.append(f"{ds}:{spearmanr(x[k], x.rgas)[0]:+.2f}(n{len(x)})" if len(x) > 5 else f"{ds}:-")
    print(f"  {k:10s}", " ".join(out))
# aturan berhenti: pilih ambang + arah di PERIODE PILIH (ds5d+ds24), uji di m1+m2
pick = T[T.ds.isin(["u_ds5d", "u_ds24"])]; test = T[T.ds.isin(["m1", "m2"])]
print("\nATURAN: lewati trade bila sinyal melewati ambang (ambang = kuantil sinyal di periode pilih). Skor = jumlah rgas trade yang dibiarkan.")
for k in K:
    best = None
    for qq in [0.2, 0.33, 0.5, 0.67, 0.8]:
        thr = pick[k].quantile(qq)
        for arah in ["<", ">"]:
            keep_p = ~(pick[k] < thr) if arah == "<" else ~(pick[k] > thr)
            v = pick.rgas[keep_p | pick[k].isna()].sum()
            if best is None or v > best[0]: best = (v, thr, arah)
    v, thr, arah = best
    skip_t = (test[k] < thr) if arah == "<" else (test[k] > thr)
    base_p = pick.rgas.sum()
    print(f"  {k:10s} lewati bila {arah}{thr:.3f} | pilih: rgas {base_p:+.2f} -> {v:+.2f} | UJI m1+m2: dilewati {int(skip_t.sum())}/{len(test)} trade, "
          f"rgas dilewati {test.rgas[skip_t].sum():+.2f} (pnl$ {test.pnl[skip_t].sum():+.0f}), rgas tersisa {test.rgas[~skip_t].sum():+.2f} dari {test.rgas.sum():+.2f}")
