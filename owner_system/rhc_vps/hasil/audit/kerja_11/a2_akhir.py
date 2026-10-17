# Agent 11 - 30 trade "akhir data" (batas 9 jam): kapan nilainya hilang? peristiwa likuiditas nyata dari liq.csv
import json, numpy as np, pandas as pd, os
os.chdir(os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..", ".."))
D = pd.read_csv("hasil/audit/kerja_11/a1_exit_rows.csv")
T = pd.DataFrame(json.load(open("hasil/uji_maju_final/trade_final178_lengkap.json")))
rows = []
for ds in ["u_ds5d", "u_ds24", "m1", "m2"]:
    sub = D[D.ds == ds]
    pools = set(T[T.ds == ds].pool)
    L = pd.read_csv(f"data/{ds}/liq.csv", usecols=["pool_id", "block", "liq_delta"], dtype={"liq_delta": str})
    L = L[L.pool_id.isin(pools)]
    rec = {}
    for l in open(f"data/{ds}/trades.jsonl"):
        t = json.loads(l)
        if t["plan"] == "v4": rec[t["pool"]] = t
    for _, r in T[T.ds == ds].iterrows():
        t = rec.get(r.pool)
        if t is None: continue
        ev = L[L.pool_id == r.pool].sort_values("block")
        a = r_ = 0; warn = rug = None; nrem = 0
        for b, d in zip(ev.block.values, ev.liq_delta.values):
            d = int(d)
            if d > 0: a += d
            elif d < 0: r_ += -d; nrem += (b > t["entryBlk"])
            if a > 0:
                if warn is None and r_ * 100 > 30 * a: warn = b
                if rug is None and r_ * 100 > 80 * a: rug = b
        rows.append(dict(no=r.no, ds=ds, keluar=r.keluar, pnl=r.pnl, ret=r.ret, tp1=r.tp1, peakV=t["peakV"],
                         warn_min=None if warn is None else (warn - t["entryBlk"]) * 0.1 / 60,
                         rug_min=None if rug is None else (rug - t["entryBlk"]) * 0.1 / 60,
                         warn_to_rug_s=None if warn is None or rug is None else (rug - warn) * 0.1, n_lp_remove_after_entry=nrem))
R = pd.DataFrame(rows); R.to_csv("hasil/audit/kerja_11/a2_lp_rows.csv", index=False)
pd.set_option("display.width", 250)
A = R[R.keluar == "akhir data"]
print(A.to_string())
print("akhir data: rug(>80% LP) terjadi", A.rug_min.notna().sum(), "/", len(A), "| median menit ke rug", A.rug_min.median(),
      "| warn->rug detik median", A.warn_to_rug_s.median(), "| rug dalam 1 blok yg sama", (A.warn_to_rug_s == 0).sum())
nt = A[(~A.tp1) & (A.peakV >= 1.2)]
print("peakV>=1,2 tapi TP1 tidak terjadi (tunda-TP p_naik):", len(nt), "trade, pnl", nt.pnl.sum().round(2))
print("semua 178: rug setelah masuk", R.rug_min.gt(0).sum(), "| per alasan keluar:")
print(R[R.rug_min.gt(0)].groupby("keluar").agg(n=("pnl", "size"), pnl=("pnl", "sum")))
