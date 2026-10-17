# Agent 14 - STUDI KASUS per koin (semua koin >=10x + pembanding)
import os, sys, json, csv
import statistics as st
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from rule import get, IV,IPK,IDD,IR1,IR3,IR10,IRN,IMX,IDRY,IRF,ILP,IFUT, PILIH, BUKTI
DATA = r"C:\Users\horii\rhc-quant\rhc_vps\data"
ret_bot = {}
for ds in PILIH+BUKTI:
    with open(os.path.join(DATA, ds, "trades.jsonl")) as fh:
        for l in fh:
            t = json.loads(l)
            if t.get("plan") == "v4": ret_bot[t["pool"]] = (t["ret"], t.get("reason"), t.get("size"))

def simple(F, v, n, rule):
    for k in range(1, n):
        if rule(F[k]): return v[k], k
    return v[n-1], n-1
R15 = lambda f: f[IPK] >= 1.5 and f[IDD] >= 0.15
R30 = lambda f: f[IPK] >= 1.5 and f[IDD] >= 0.30
RAD = lambda f: f[IPK] >= 1.5 and f[IDD] >= (0.15 if f[IR3] >= 1.0 else 0.30)

rows = []
for ds in PILIH+BUKTI:
    for (dsn, p, F, v, n) in get(ds):
        pk = F[n-1][IPK]
        kp = next(k for k in range(n) if F[k][IPK] >= pk-1e-12)
        kd = None
        for k in range(kp, n):
            if F[k][IV] <= 0.5*pk: kd = k; break
        e15, k15 = simple(F, v, n, R15); e30, k30 = simple(F, v, n, R30); ead, kad = simple(F, v, n, RAD)
        rb = ret_bot.get(p, (float('nan'),"",0))
        rows.append(dict(ds=dsn, pool=p, pk=pk, kp=kp/2.0, kd=(kd-kp)/2.0 if kd is not None else None,
                         r3=F[kp][IR3], mx=F[kp][IMX], rn=F[kp][IRN],
                         h9=v[n-1], e15=e15, e30=e30, ead=ead, bot=rb[0], why=rb[1], size=rb[2],
                         n=n))
rows.sort(key=lambda r: -r["pk"])
print(f"{'ds':7s} {'pool':10s} {'puncak':>7} {'mnt':>6} {'p->dump':>8} {'r3@pk':>6} {'jualmax%LP':>10} {'bot':>7} {'9jam':>7} {'trail15':>8} {'trail30':>8} {'adaptif':>8} alasan bot")
for r in rows[:60]:
    kd = f"{r['kd']:.1f}" if r["kd"] is not None else "-"
    print(f"{r['ds']:7s} {r['pool'][:10]} {r['pk']:7.2f} {r['kp']:6.1f} {kd:>8} {r['r3']:6.2f} {100*r['mx']:10.1f} "
          f"{r['bot']:7.2f} {r['h9']:7.2f} {r['e15']:8.2f} {r['e30']:8.2f} {r['ead']:8.2f} {r['why']}")
print(f"\ntotal koin dengan deret: {len(rows)}")
for th in (10,25,50,100):
    s = [r for r in rows if r["pk"] >= th]
    if not s: continue
    print(f"puncak NILAI POSISI >= {th}x: {len(s)} koin | bot rata2 {st.mean([r['bot'] for r in s]):.2f}x"
          f" | 9jam {st.mean([r['h9'] for r in s]):.2f}x | trail15 {st.mean([r['e15'] for r in s]):.2f}x"
          f" | trail30 {st.mean([r['e30'] for r in s]):.2f}x | adaptif {st.mean([r['ead'] for r in s]):.2f}x")
# pembanding: rug (bot ret<0.3) dan koin datar
rug = [r for r in rows if r["bot"] == r["bot"] and r["bot"] < 0.3]
flat = [r for r in rows if r["pk"] < 2]
print(f"\nkoin RUG (ret bot <0,3): {len(rug)} | r3 di puncak med {st.median([r['r3'] for r in rug]):.2f}"
      f" | jual terbesar med {100*st.median([r['mx'] for r in rug]):.1f}% LP | trail30 rata2 {st.mean([r['e30'] for r in rug]):.2f}x")
print(f"koin DATAR (<2x): {len(flat)} | r3 di puncak med {st.median([r['r3'] for r in flat]):.2f}"
      f" | jual terbesar med {100*st.median([r['mx'] for r in flat]):.1f}% LP | trail30 rata2 {st.mean([r['e30'] for r in flat]):.2f}x")
