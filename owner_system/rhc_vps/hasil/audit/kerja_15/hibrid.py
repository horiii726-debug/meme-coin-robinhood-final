# Aturan HIBRIDA: hanya koin yang ditandai model rug (p_rug >= tau) yang ditunda masuknya.
# Ambang dipilih di periode LAMA, dibuktikan di m1+m2. Analisis berpasangan (koin yang sama).
import pandas as pd, numpy as np, json, os, sys
rng = np.random.default_rng(11)
PER = ["ags1", "ags4", "ds5d", "ds24", "m1", "m2"]
LAMA = ["ags1", "ags4", "ds5d", "ds24"]


def load(v):
    rows = []
    for p in PER:
        f = "out/%s_%s.jsonl" % (p, v)
        if not os.path.exists(f):
            continue
        for l in open(f, encoding="utf8"):
            l = l.strip()
            if not l:
                continue
            t = json.loads(l)
            if t.get("plan") != "v4":
                continue
            t["ds"] = p
            rows.append(t)
    return pd.DataFrame(rows).set_index("pool")


pr = pd.read_csv("prug_rug3.csv").set_index("pool")
base = load("base")
res = []
for dly in ["d900", "d1200", "d1800", "d3000"]:
    d = load(dly)
    j = base[["ret", "ds", "reason", "perfect"]].join(d[["ret", "perfect"]], rsuffix="_v", how="left")
    j = j.join(pr[["p_rug", "lab"]])
    j["per"] = np.where(j.ds.isin(["m1", "m2"]), "BARU", "LAMA")
    for tau in [0.05, 0.08, 0.10, 0.15, 0.20, 0.25, 0.30, 0.40, 0.50]:
        flag = (j.p_rug >= tau).fillna(False)
        # hasil hibrida: ditandai -> pakai varian tunda (NaN = tidak jadi beli, uang tetap kas)
        reth = np.where(flag, j.ret_v, j.ret)
        masuk = ~(flag & j.ret_v.isna())
        for per in ["LAMA", "BARU"]:
            s = j.per == per
            rb = j.ret[s].values
            rh = reth[s.values]
            mk = masuk[s].values
            rh2 = rh[mk]
            dif = np.nansum(rh2) - np.sum(rb) + (len(rb) - mk.sum()) * 0.0
            # rata2 ret per PELUANG (koin tak dibeli = 0 untung, uang bebas -> dihitung 1.0)
            rh_all = np.where(mk, np.nan_to_num(rh, nan=1.0), 1.0)
            b = [np.mean((rh_all - rb)[rng.integers(0, len(rb), len(rb))]) for _ in range(1000)]
            res.append(dict(tunda=dly, tau=tau, per=per, n=len(rb),
                            ditandai=int(flag[s].sum()),
                            tandai_benar=int((flag[s] & (j.lab[s] == 1)).sum()),
                            rug3_total=int((j.lab[s] == 1).sum()),
                            tak_jadi=int((~mk).sum()),
                            ret_base=round(np.mean(rb), 4),
                            ret_hib=round(np.mean(rh_all), 4),
                            d_ret=round(np.mean(rh_all - rb), 4),
                            ci=("[%.4f,%.4f]" % tuple(np.percentile(b, [2.5, 97.5]))),
                            benc_base=int((rb < 0.3).sum()), benc_hib=int((rh_all < 0.3).sum()),
                            roket_base=int((j.perfect[s] >= 3).sum()),
                            roket_hib=int(np.nansum(np.where(flag[s], j.perfect_v[s] >= 3, j.perfect[s] >= 3)))))
df = pd.DataFrame(res)
df.to_csv("hibrid_grid.csv", index=False)
pv = df.pivot_table(index=["tunda", "tau"], columns="per", values=["d_ret", "ditandai", "tandai_benar", "benc_hib", "roket_hib"])
print(df[df.per == "LAMA"].to_string(index=False))
print()
print(df[df.per == "BARU"].to_string(index=False))
