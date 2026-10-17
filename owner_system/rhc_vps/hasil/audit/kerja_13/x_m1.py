# Agent 13 - ekstraksi swap mentah menit-1 (blok <= init+600) dgn tick + tx_hash
# STREAMING swaps_sorted.csv, tidak memuat semua.
import csv, json, os, sys
ROOT = r"C:\Users\horii\rhc-quant\rhc_vps"
DATA = os.path.join(ROOT, "data")
OUT  = os.path.join(ROOT, "hasil", "audit", "kerja_13")
WIN  = 600
csv.field_size_limit(10**9)

def proses(ds):
    d = os.path.join(DATA, ds)
    uni = set(json.load(open(os.path.join(d, "swaps_m1.json"))).keys())
    pools = {}
    with open(os.path.join(d, "pools.csv")) as fh:
        rd = csv.reader(fh); next(rd)
        for r in rd:
            pid = r[0].lower()
            if pid in uni:
                pools[pid] = (int(r[6]), int(r[4]))   # init, tick_spacing
    n = 0
    txmap = {}
    fo = open(os.path.join(OUT, f"m1raw_{ds}.csv"), "w", newline="")
    w = csv.writer(fo)
    w.writerow(["pool","rel","log_idx","tx","a0","a1","sqrtP","L","tick"])
    with open(os.path.join(d, "swaps_sorted.csv")) as fh:
        rd = csv.reader(fh); next(rd)
        for r in rd:
            p = pools.get(r[0])
            if p is None: continue
            b = int(r[1])
            rel = b - p[0]
            if rel > WIN or rel < 0: continue
            t = r[3]
            ti = txmap.get(t)
            if ti is None:
                ti = len(txmap); txmap[t] = ti
            w.writerow([r[0], rel, r[2], ti, r[4], r[5], r[6], r[7], r[8]])
            n += 1
    fo.close()
    # meta per pool: init, tick_spacing, ethUsd, fee, hooks
    eth = {}
    with open(os.path.join(d, "trades.jsonl")) as fh:
        for line in fh:
            t = json.loads(line)
            if t.get("plan") == "v4": eth[t["pool"]] = t["ethUsd"]
    meta = {}
    with open(os.path.join(d, "pools.csv")) as fh:
        rd = csv.reader(fh); next(rd)
        for r in rd:
            pid = r[0].lower()
            if pid in uni:
                meta[pid] = {"init": int(r[6]), "ts": int(r[4]), "fee": int(r[3]),
                             "c0": r[1].lower(), "c1": r[2].lower(), "hooks": r[5].lower(),
                             "eth": eth.get(pid)}
    json.dump(meta, open(os.path.join(OUT, f"meta_{ds}.json"), "w"))
    # liq menit-1 (tick range) streaming
    lq = {}
    with open(os.path.join(d, "liq.csv")) as fh:
        rd = csv.reader(fh); next(rd)
        for r in rd:
            pid = r[0].lower()
            m = meta.get(pid)
            if not m: continue
            rel = int(r[1]) - m["init"]
            if rel > WIN or rel < 0: continue
            lq.setdefault(pid, []).append([rel, int(r[2]), int(r[3]), int(r[4]), float(r[5])])
    json.dump(lq, open(os.path.join(OUT, f"liq_{ds}.json"), "w"))
    print(ds, "pools", len(pools), "swaps", n, "liqpools", len(lq), flush=True)

for ds in sys.argv[1:]:
    proses(ds)
