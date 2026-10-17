# Agent 14 - berapa MENIT lebih awal tiap sinyal dibanding puncak & dump? + akurasi sinyal.
import os, sys, math
import statistics as st
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from rule import get, IV,IPK,IDD,IR1,IR3,IR10,IRN,IMX,IDRY,IRF,ILP,IFUT, PILIH, BUKTI

SIG = {
 "dd>=15% dari puncak":      lambda f: f[IPK] >= 1.5 and f[IDD] >= 0.15,
 "dd>=30% dari puncak":      lambda f: f[IPK] >= 1.5 and f[IDD] >= 0.30,
 "jual/beli 3mnt >= 1":      lambda f: f[IPK] >= 1.5 and f[IR3] >= 1.0,
 "jual/beli 1mnt >= 2":      lambda f: f[IPK] >= 1.5 and f[IR1] >= 2.0,
 "swap jual > 55% (3mnt)":   lambda f: f[IPK] >= 1.5 and f[IRN] >= 0.55,
 "1 jual >= 5% likuiditas":  lambda f: f[IMX] >= 0.05,
 "1 jual >= 10% likuiditas": lambda f: f[IMX] >= 0.10,
 "LP ditarik >= 30%":        lambda f: f[IRF] >= 0.30,
 "tidak ada pembeli 5 mnt":  lambda f: f[IDRY] >= 10,
 "likuiditas turun 30%":     lambda f: f[ILP] <= 0.70,
}

def run(dsl, nama, minpk):
    print(f"\n=== {nama} (koin dengan puncak >= {minpk}x, periode {dsl}) ===")
    print(f"{'sinyal':28s} {'nyala%':>7} {'lead puncak(mnt)':>17} {'lead dump(mnt)':>15} {'benar%':>7} {'dini%':>6} {'telat%':>7}")
    data = []
    for ds in dsl:
        for (dsn, p, F, v, n) in get(ds):
            pkall = F[n-1][IPK]
            if pkall < minpk: continue
            vx = [F[k][IV] for k in range(n)]
            # puncak nyata (pakai nilai maksimum yang tercatat)
            kp = max(range(n), key=lambda k: F[k][IPK] if k == 0 else (F[k][IPK] - F[k-1][IPK]))
            # bar puncak = bar pertama yang mencapai puncak global
            kp = next(k for k in range(n) if F[k][IPK] >= pkall - 1e-12)
            kd = None
            for k in range(kp, n):
                if F[k][IV] <= 0.5*pkall: kd = k; break
            data.append((F, v, n, kp, kd, pkall))
    for nm, fn in SIG.items():
        lp = []; ld = []; nfire = 0; benar = 0; dini = 0; telat = 0
        for (F, v, n, kp, kd, pkall) in data:
            hit = None
            for k in range(1, n):
                if fn(F[k]): hit = k; break
            if hit is None: continue
            nfire += 1
            lp.append((kp - hit)/2.0)
            if kd is not None: ld.append((kd - hit)/2.0)
            ex = v[hit]; fut = F[hit][IFUT]
            if fut > 1.5*ex: dini += 1
            elif ex < 0.5*pkall: telat += 1
            else: benar += 1
        N = len(data)
        f = lambda a: f"{st.median(a):6.1f}" if a else "     -"
        print(f"{nm:28s} {100*nfire/max(N,1):6.0f}% {f(lp):>17} {f(ld):>15} "
              f"{100*benar/max(nfire,1):6.0f}% {100*dini/max(nfire,1):5.0f}% {100*telat/max(nfire,1):6.0f}%  (nyala {nfire}/{N})")

for nama, dsl in (("PILIH", PILIH), ("BUKTI", BUKTI)):
    run(dsl, nama, 3.0)
    run(dsl, nama, 10.0)
