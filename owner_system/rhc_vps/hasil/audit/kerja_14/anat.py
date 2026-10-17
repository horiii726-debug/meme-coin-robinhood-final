# Agent 14 - ANATOMI: event study di PUNCAK, awal DUMP, dan 30 menit setelah masuk.
import os, sys, json, csv, math, random
import statistics as st
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from lib14 import load, feats, BAR

DSL = sys.argv[1:] or ["ags1","ags4","u_ds5d","u_ds24"]
random.seed(7)
DEL = [2,6,10,20,60]   # bar sebelum = 1,3,5,10,30 menit
KEYS = ["r1","r3","r5","rn3","net3","mxs3","acc","dry","quiet","rf","lpdrop","dd","nb3","ns3"]

rows = []
for ds in DSL:
    D = load(ds)
    for p, S in D.items():
        n = S["n"]
        if n < 4: continue
        vx = S["vx"]
        pk = max(vx); kp = vx.index(pk)
        # awal dump: bar pertama sesudah puncak dgn nilai <= 50% puncak
        kd = None
        for k in range(kp, n):
            if S["v"][k] <= 0.5*pk: kd = k; break
        rows.append(dict(ds=ds, pool=p, n=n, pk=pk, kp=kp, kd=kd, S=S,
                         vend=S["v"][n-1]))

def grp(r):
    if r["pk"] >= 10: return "roket10"
    if r["pk"] >= 3: return "naik3"
    if r["pk"] >= 1.5: return "naik1.5"
    return "datar"

def show(title, sel, anchor):
    R = []
    for r in sel:
        ka = anchor(r)
        if ka is None: continue
        S = r["S"]
        for d in DEL + [0]:
            k = ka - d
            if k < 1 or k >= S["n"]: continue
            f = feats(S, k)
            R.append((d, f))
    if not R: 
        print(f"--- {title}: tidak ada data"); return
    print(f"--- {title} (n koin {len(sel)}) ---")
    hdr = ["menit"] + KEYS
    print(" | ".join(f"{h:>7}" for h in hdr))
    for d in [60,20,10,6,2,0]:
        sub = [f for dd, f in R if dd == d]
        if not sub: continue
        lab = f"-{d/2:g}" if d else "0"
        line = [f"{lab:>7}"]
        for kk in KEYS:
            vals = [x[kk] for x in sub if x[kk] == x[kk] and math.isfinite(x[kk])]
            line.append(f"{st.median(vals):7.3f}" if vals else "      -")
        print(" | ".join(line))

allr = rows
for g in ["roket10","naik3","naik1.5","datar"]:
    sel = [r for r in allr if grp(r) == g]
    if len(sel) < 5: continue
    show(f"PUNCAK grup {g}", sel, lambda r: r["kp"])
print()
for g in ["roket10","naik3"]:
    sel = [r for r in allr if grp(r) == g and r["kd"] is not None]
    if len(sel) < 5: continue
    show(f"AWAL DUMP (-50% dari puncak) grup {g}", sel, lambda r: r["kd"])
print()
# 30 menit setelah masuk (bar 60) - pembanding netral
for g in ["roket10","naik3","datar"]:
    sel = [r for r in allr if grp(r) == g and r["n"] > 61]
    if len(sel) < 5: continue
    show(f"BASELINE 30 mnt stlh masuk grup {g}", sel, lambda r: 60)

# sebaran waktu puncak
print("\n=== waktu puncak (menit sejak masuk) ===")
for g in ["roket10","naik3","naik1.5","datar"]:
    sel = [r["kp"]/2.0 for r in allr if grp(r) == g]
    if len(sel) < 5: continue
    sel.sort()
    print(f"{g:9s} n={len(sel):4d} med {sel[len(sel)//2]:7.1f} p10 {sel[len(sel)//10]:7.1f} p90 {sel[int(len(sel)*0.9)]:7.1f}")
print("\n=== berapa koin yang dump >=50% setelah puncak ===")
for g in ["roket10","naik3","naik1.5","datar"]:
    sel = [r for r in allr if grp(r) == g]
    if len(sel) < 5: continue
    kd = [r for r in sel if r["kd"] is not None]
    lag = sorted([(r["kd"]-r["kp"])/2.0 for r in kd])
    print(f"{g:9s} {len(kd)}/{len(sel)} = {100*len(kd)/len(sel):.0f}% | jarak puncak->dump med {lag[len(lag)//2] if lag else float('nan'):.1f} mnt")
