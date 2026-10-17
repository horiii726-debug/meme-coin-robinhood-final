# Agent 14 - PUNCAK SEMENTARA vs PUNCAK AKHIR.
# Saat harga turun X% dari puncak berjalan: berapa sering koin naik lagi melewati puncak lama,
# dan apakah TEKANAN BELI saat penurunan itu bisa membedakannya? (kausal: fitur hanya sampai bar itu)
import os, sys, math
import statistics as st
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from rule import get, IV,IPK,IDD,IR1,IR3,IR10,IRN,IMX,IDRY,IRF,ILP,IFUT, PILIH, BUKTI

def kumpul(dsl, X, A=1.5):
    S = []
    for ds in dsl:
        for (dsn, p, F, v, n) in get(ds):
            for k in range(1, n):
                f = F[k]
                if f[IPK] < A or f[IDD] < X: continue
                pk = f[IPK]; fut = f[IFUT]
                S.append(dict(ds=dsn, pool=p, k=k, v=f[IV], pk=pk, dd=f[IDD],
                              r1=f[IR1], r3=f[IR3], rn=f[IRN], mx=f[IMX],
                              fut=fut, pulih=1 if fut > pk else 0,
                              lanjut=1 if fut > 1.5*f[IV] else 0, rasio=fut/max(f[IV],1e-9)))
                break     # satu kejadian per koin (penurunan X% PERTAMA)
    return S

def lapor(nama, S):
    if not S: print(nama, "tidak ada data"); return
    n = len(S)
    print(f"\n{nama}: {n} koin")
    print(f"  pulih melewati puncak lama : {100*sum(x['pulih'] for x in S)/n:.0f}%")
    print(f"  masih naik >=1,5x dari sini: {100*sum(x['lanjut'] for x in S)/n:.0f}%")
    print(f"  nilai puncak berikutnya / nilai sekarang: median {st.median([x['rasio'] for x in S]):.2f}")
    # apakah TEKANAN saat penurunan memisahkan yang pulih dari yang tidak?
    for kk, lab in (("r3","jual/beli 3mnt"), ("r1","jual/beli 1mnt"), ("rn","pecahan swap jual"), ("mx","jual terbesar %LP")):
        a = [x[kk] for x in S if x["pulih"]]; b = [x[kk] for x in S if not x["pulih"]]
        if len(a) < 5 or len(b) < 5: continue
        # AUC sederhana
        allv = sorted(set(a+b)); 
        import bisect
        cc = 0; tot = 0
        for xa in a:
            for xb in b:
                tot += 1
                cc += 1 if xa < xb else (0.5 if xa == xb else 0)
        print(f"  {lab:22s} pulih med {st.median(a):6.3f} | gagal med {st.median(b):6.3f} | AUC(pulih) {cc/tot:.3f}")
    # bucket by r3
    print("  === kelompok menurut jual/beli 3 menit saat turun ===")
    qs = sorted(x["r3"] for x in S)
    cut = [qs[int(len(qs)*q)] for q in (0.25,0.5,0.75)]
    for lo, hi, lab in ((-1,cut[0],"paling sedikit jual"),(cut[0],cut[1],"sedikit"),(cut[1],cut[2],"banyak"),(cut[2],1e18,"paling banyak jual")):
        sub = [x for x in S if lo <= x["r3"] < hi]
        if not sub: continue
        print(f"    {lab:20s} n={len(sub):4d} pulih {100*sum(x['pulih'] for x in sub)/len(sub):3.0f}% | "
              f"lanjut>=1,5x {100*sum(x['lanjut'] for x in sub)/len(sub):3.0f}% | puncak berikut/sekarang med {st.median([x['rasio'] for x in sub]):.2f}")

for X in (0.15, 0.30):
    for nama, dsl in (("PILIH", PILIH), ("BUKTI", BUKTI)):
        lapor(f"turun {int(X*100)}% dari puncak (setelah 1,5x) - {nama}", kumpul(dsl, X))
