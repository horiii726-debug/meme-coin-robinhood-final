# Agent 14 - deret waktu SETELAH MASUK (bar 300 blok ~= 30,4 detik) sampai init+324000 (9 jam).
# STREAMING swaps_sorted.csv + liq.csv. Hanya data on-chain nyata.
import csv, json, os, sys, math
ROOT = r"C:\Users\horii\rhc-quant\rhc_vps"
DATA = os.path.join(ROOT, "data"); OUT = os.path.dirname(os.path.abspath(__file__))
NATIVE = "0x" + "0"*40
Q96 = 2.0**96
HZ = 324000
BAR = 300          # blok per bar (~30,4 detik)

def run(ds):
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
                       "q1": pools[p][1] == NATIVE, "size": t["size"]}
    fo = open(os.path.join(OUT, f"bars_{ds}.csv"), "w", newline="")
    w = csv.writer(fo)
    w.writerow(["pool","k","nb","ns","bu","su","vlast","vmax","vmin","lp","mxs","ntx","gapmax","blast","nsw"])
    st = {}
    def flush(p, s):
        if s.get("bar") is None: return
        b = s["bar"]
        w.writerow([p, b["k"], b["nb"], b["ns"], round(b["bu"],2), round(b["su"],2),
                    round(b["vl"],5), round(b["vx"],5), round(b["vn"],5), round(b["lp"],1),
                    round(b["mxs"],5), len(b["tx"]), b["gap"], b["blast"], b["n"]])
        s["bar"] = None
    nrow = 0
    with open(os.path.join(d, "swaps_sorted.csv")) as fh:
        fh.readline()
        for line in fh:
            p = line[:66]
            s = want.get(p)
            if s is None: continue
            f = line.rstrip("\n").split(",")
            b = int(f[1])
            if b < s["entry"] or b > s["init"] + HZ: continue
            sp = float(f[6]) / Q96; L = float(f[7])
            if sp <= 0 or L <= 0: continue
            a0 = float(f[4]); a1 = float(f[5]); fee = float(f[9])
            q1 = s["q1"]
            base_amt = a0 if q1 else a1
            quote_amt = a1 if q1 else a0
            buy = base_amt > 0
            usd = abs(quote_amt)/1e18 * s["eth"]
            lpusd = 2.0 * (abs(L*sp if q1 else L/sp)/1e18) * s["eth"]
            t = st.get(p)
            if t is None:
                # blok masuk: pasang posisi (ukuran nyata dari trades.jsonl)
                size = s["size"]
                dIn = (size / s["eth"]) * 1e18 * (1 - fee/1e6)
                if q1:
                    sp1 = sp + dIn/L; bs = L*(1/sp - 1/sp1)
                else:
                    inv = 1/sp + dIn/L; bs = L*(sp - 1/inv)
                if not (bs > 0) or not math.isfinite(bs):
                    st[p] = {"dead": True, "bar": None}; continue
                t = st[p] = {"dead": False, "base": bs, "size": size, "eth": s["eth"], "q1": q1,
                             "entry": s["entry"], "bar": None, "prev": b}
                continue
            if t["dead"]: continue
            # nilai posisi kita kalau menjual di kondisi pool ini
            bIn = t["base"]*(1 - fee/1e6)
            if q1:
                inv = 1/sp + bIn/L; r = L*(sp - 1/inv)
            else:
                spb = sp + bIn/L; r = L*(1/sp - 1/spb)
            v = (abs(r)/1e18)*t["eth"]/t["size"] if (math.isfinite(r) and r > 0) else 0.0
            k = (b - t["entry"])//BAR
            bar = t["bar"]
            if bar is None or bar["k"] != k:
                flush(p, t); nrow += 1 if bar is not None else 0
                bar = t["bar"] = {"k": k, "nb":0,"ns":0,"bu":0.0,"su":0.0,"vl":v,"vx":v,"vn":v,
                                  "lp":lpusd,"mxs":0.0,"tx":set(),"gap":0,"blast":b,"n":0}
            gap = b - t["prev"]
            if gap > bar["gap"]: bar["gap"] = gap
            t["prev"] = b
            bar["n"] += 1; bar["tx"].add(f[3])
            if buy: bar["nb"] += 1; bar["bu"] += usd
            else:
                bar["ns"] += 1; bar["su"] += usd
                q = usd/max(lpusd,1.0)
                if q > bar["mxs"]: bar["mxs"] = q
            bar["vl"] = v; bar["lp"] = lpusd; bar["blast"] = b
            if v > bar["vx"]: bar["vx"] = v
            if v < bar["vn"]: bar["vn"] = v
    for p, t in st.items():
        if not t["dead"]: flush(p, t)
    fo.close()
    # --- LP events (penarikan likuiditas) sepanjang 9 jam ---
    fl = open(os.path.join(OUT, f"lp_{ds}.csv"), "w", newline="")
    wl = csv.writer(fl); wl.writerow(["pool","k","add","rem","remfrac"])
    cur = None; acc = None
    def flushlp():
        if cur is None or acc is None: return
        for k in sorted(acc["bars"]):
            a, r = acc["bars"][k]
            wl.writerow([cur, k, round(a,1), round(r,1), round(acc["ff"][k],4)])
    with open(os.path.join(d, "liq.csv")) as fh:
        fh.readline()
        for line in fh:
            p = line[:66]
            s = want.get(p)
            if s is None: continue
            f = line.rstrip("\n").split(",")
            b = int(f[1]); dl = float(f[5])
            if b > s["init"] + HZ: continue
            if p != cur:
                flushlp(); cur = p; acc = {"a":0.0,"r":0.0,"bars":{},"ff":{}}
            if dl > 0: acc["a"] += dl
            else: acc["r"] += -dl
            k = (b - s["entry"])//BAR
            e = acc["bars"].setdefault(k, [0.0,0.0])
            if dl > 0: e[0] += dl
            else: e[1] += -dl
            acc["ff"][k] = acc["r"]/acc["a"] if acc["a"] > 0 else 0.0
    flushlp(); fl.close()
    print(ds, "koin", len(want), "hidup", sum(1 for t in st.values() if not t["dead"]), flush=True)

for ds in sys.argv[1:]:
    run(ds)
