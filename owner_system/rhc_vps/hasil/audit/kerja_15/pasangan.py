# Analisis BERPASANGAN: koin yang sama, aturan masuk berbeda. Tanpa model yang berubah.
import pandas as pd, numpy as np, json, glob, sys, os
rng = np.random.default_rng(7)
VARS = ["base", "d900", "d1200", "d1800", "d3000", "g600", "g1200", "g1800", "g3000"]
PER = ["ags1", "ags4", "ds5d", "ds24", "m1", "m2"]


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
    d = pd.DataFrame(rows)
    return d


base = load("base").set_index("pool")
lp = pd.concat([pd.read_csv(f) for f in sorted(glob.glob("lp_*.csv")) if "dev" not in f], ignore_index=True)
lp["dt"] = lp.rug_blk - lp.init - 600
lp = lp.set_index("pool")
out = []
det = {}
for v in VARS:
    d = load(v)
    if not len(d):
        continue
    d = d.set_index("pool")
    j = base[["ret", "ds", "size", "reason", "tp1", "perfect"]].join(
        d[["ret", "size", "reason", "tp1", "perfect"]], rsuffix="_v", how="left")
    j["masuk_v"] = j.ret_v.notna()
    j = j.join(lp[["dt", "rug_blk"]])
    j["rug3"] = ((j.dt > 0) & (j.dt <= 1800)).astype(int)
    j["rug30"] = ((j.dt > 0) & (j.dt <= 18000)).astype(int)
    det[v] = j
    common = j[j.masuk_v]
    # bootstrap selisih rata2 ret pada koin yang sama
    dif = (common.ret_v - common.ret).values
    b = [np.mean(dif[rng.integers(0, len(dif), len(dif))]) for _ in range(2000)] if len(dif) else [np.nan]
    out.append(dict(varian=v, n_base=len(j), n_masuk=int(j.masuk_v.sum()),
                    tak_masuk=int((~j.masuk_v).sum()),
                    tak_masuk_rug3=int(j[~j.masuk_v].rug3.sum()),
                    tak_masuk_rug30=int(j[~j.masuk_v].rug30.sum()),
                    ret_base_semua=round(j.ret.mean(), 4),
                    ret_base_pd_masuk=round(common.ret.mean(), 4),
                    ret_var_pd_masuk=round(common.ret_v.mean(), 4),
                    d_ret=round(np.mean(dif), 4) if len(dif) else np.nan,
                    ci=("[%.4f,%.4f]" % tuple(np.percentile(b, [2.5, 97.5]))) if len(dif) else "",
                    bencana_base=int((j.ret < 0.3).sum()),
                    bencana_var=int((j.ret_v < 0.3).sum()),
                    roket_base=int((j.perfect >= 3).sum()),
                    roket_var=int((j.perfect_v >= 3).sum())))
print(pd.DataFrame(out).to_string(index=False))
pd.DataFrame(out).to_csv("pasangan_ringkas.csv", index=False)
# rincian: dari mana perubahan datang
print("\n== rincian per varian: koin yang TIDAK jadi dibeli ==")
for v, j in det.items():
    if v == "base":
        continue
    miss = j[~j.masuk_v]
    print("%-7s tidak dibeli %3d | di antaranya rug<=3mnt %3d | ret rata2 di base %.3f | 'akhir data' di base %d"
          % (v, len(miss), int(miss.rug3.sum()), miss.ret.mean() if len(miss) else np.nan,
             int((miss.reason == "akhir data").sum())))
