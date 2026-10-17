# Agent 14 - apakah GERBANG TEKANAN benar-benar menambah uang di atas trailing biasa?
# Diuji hanya pada koin yang sempat turun >=15% setelah naik 1,5x. Bootstrap untuk melihat noise.
import os, sys, math, random
import statistics as st
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from rule3 import get, IV,IPK,IDD,IR1,IR3,IRSP,IMX,INBSP,IAGE,IDROP,IFUT,IRF, PILIH, BUKTI
random.seed(17)

def jalan(dsl, gate):
    """gate(x) -> True berarti KELUAR di dd 15%; kalau False, tunggu sampai dd 30%"""
    out = []
    for ds in dsl:
        for (dsn,p,F,v,n) in get(ds):
            k15 = None
            for k in range(1,n):
                if F[k][IPK] >= 1.5 and F[k][IDD] >= 0.15: k15 = k; break
            if k15 is None: continue
            a = v[k15]
            if gate(F[k15]): b = a
            else:
                b = v[n-1]
                for k in range(k15+1, n):
                    if F[k][IDD] >= 0.30: b = v[k]; break
            out.append((a, b))
    return out

def ringkas(nama, R):
    n = len(R)
    sa = sum(x[0]-1 for x in R); sb = sum(x[1]-1 for x in R)
    la = st.mean([math.log(max(x[0],1e-6)) for x in R]); lb = st.mean([math.log(max(x[1],1e-6)) for x in R])
    d = [ (x[1]-1) - (x[0]-1) for x in R ]
    boot = []
    for _ in range(2000):
        s = sum(d[random.randrange(n)] for _ in range(n))
        boot.append(s)
    boot.sort()
    lo = boot[int(0.025*len(boot))]; hi = boot[int(0.975*len(boot))]
    print(f"{nama:46s} n={n:4d} | selalu keluar 15%: {sa:7.1f} (log {la:+.3f}) | "
          f"pakai gerbang: {sb:7.1f} (log {lb:+.3f}) | beda {sb-sa:+7.1f} [95%: {lo:+.1f} .. {hi:+.1f}]")

for nama, dsl in (("PILIH", PILIH), ("BUKTI", BUKTI)):
    print(f"\n### {nama}")
    ringkas(f"{nama} gerbang r3>=1 (jual menang -> keluar)", jalan(dsl, lambda x: x[IR3] >= 1.0))
    ringkas(f"{nama} gerbang r3>=1.5", jalan(dsl, lambda x: x[IR3] >= 1.5))
    ringkas(f"{nama} gerbang r1>=2", jalan(dsl, lambda x: x[IR1] >= 2.0))
    ringkas(f"{nama} TANPA gerbang (selalu tahan ke 30%)", jalan(dsl, lambda x: False))
    ringkas(f"{nama} KONTROL gerbang acak 50%", jalan(dsl, lambda x: random.random() < 0.5))
