# Label ROKET nyata: puncak harga & puncak nilai posisi SETELAH blok masuk (init+630),
# dibaca streaming dari swaps_sorted.csv (tidak menyalin data). Output CSV kecil.
import csv, json, os, sys
csv.field_size_limit(10**7)
ROOT = r"C:\Users\horii\rhc-quant\rhc_vps"
DATA = os.path.join(ROOT, "data")
OUT = os.path.join(ROOT, "hasil", "audit", "kerja_12")
NATIVE = "0x" + "0" * 40
Q96 = 2.0 ** 96
HZ = 324000   # 9 jam, horizon yang sama dengan pipeline

def run(ds, w):
    d = os.path.join(DATA, ds)
    pools = {}
    with open(os.path.join(d, "pools.csv")) as fh:
        rd = csv.reader(fh); next(rd)
        for r in rd:
            pools[r[0].lower()] = (r[1].lower(), r[2].lower(), int(r[6]))
    want = {}
    with open(os.path.join(d, "trades.jsonl")) as fh:
        for line in fh:
            t = json.loads(line)
            if t.get("plan") != "v4": continue
            p = t["pool"]
            if p not in pools: continue
            want[p] = {"init": t["init"], "entry": t["entryBlk"], "eth": t["ethUsd"],
                       "q1": pools[p][1] == NATIVE, "st": None, "pk": 0.0, "pkv": 0.0,
                       "last": 0, "pkblk": 0, "pkvblk": 0, "n": 0}
    maxblk = 0
    with open(os.path.join(d, "swaps_sorted.csv")) as fh:
        fh.readline()
        for line in fh:
            p = line[:66]
            s = want.get(p)
            if s is None: continue
            f = line.rstrip("\n").split(",")
            b = int(f[1])
            if b > maxblk: maxblk = b
            if b < s["entry"] or b > s["init"] + HZ: continue
            sp = float(f[6]) / Q96
            L = float(f[7])
            if sp <= 0 or L <= 0: continue
            fee = float(f[9])
            pr = sp * sp if s["q1"] else 1.0 / (sp * sp)
            if s["st"] is None:
                eth = s["eth"]
                lpusd = 2 * (abs(L * sp if s["q1"] else L / sp) / 1e18) * eth
                size = min(200.0, 0.01 * lpusd)
                if size < 20:
                    s["st"] = {"bad": True, "p0": pr, "size": 0, "base": 0}
                else:
                    dIn = (size / eth) * 1e18 * (1 - fee / 1e6)
                    if s["q1"]:
                        sp1 = sp + dIn / L; base = L * (1 / sp - 1 / sp1)
                    else:
                        inv = 1 / sp + dIn / L; base = L * (sp - 1 / inv)
                    s["st"] = {"bad": base <= 0, "p0": pr, "size": size, "base": base}
                continue
            st = s["st"]; s["n"] += 1
            m = pr / st["p0"] if st["p0"] > 0 else 0
            if m > s["pk"]: s["pk"] = m; s["pkblk"] = b - s["entry"]
            if not st["bad"]:
                bIn = st["base"] * (1 - fee / 1e6)
                if s["q1"]:
                    inv = 1 / sp + bIn / L; r = L * (sp - 1 / inv)
                else:
                    spb = sp + bIn / L; r = L * (1 / sp - 1 / spb)
                v = (abs(r) / 1e18) * s["eth"] / st["size"]
                if v > s["pkv"]: s["pkv"] = v; s["pkvblk"] = b - s["entry"]
            s["last"] = b
    for p, s in want.items():
        if s["st"] is None: continue
        w.writerow([ds, p, s["init"], s["entry"], round(s["pk"], 4), round(s["pkv"], 4),
                    s["pkblk"], s["pkvblk"], s["n"],
                    1 if maxblk >= s["init"] + HZ else 0, s["last"] - s["entry"]])
    print(ds, "selesai", len(want), "koin | maxblk", maxblk, file=sys.stderr, flush=True)

if __name__ == "__main__":
    o = os.path.join(OUT, "label_puncak.csv")
    with open(o, "w", newline="") as fh:
        w = csv.writer(fh)
        w.writerow(["ds", "pool", "init", "entry", "pk_price", "pk_val", "pk_blk", "pkv_blk", "n_sw_post", "hz_penuh", "span"])
        for ds in sys.argv[1:]:
            run(ds, w); fh.flush()
    print("tulis", o, file=sys.stderr)
