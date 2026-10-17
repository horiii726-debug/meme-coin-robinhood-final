# Agent 14 - TIGA TANDA: masih mau naik / sudah puncak / mau rug. Presisi kausal.
import os, sys, math, random
import statistics as st
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from rule3 import get, IV,IPK,IDD,IR1,IR3,IRSP,IMX,INBSP,IAGE,IDROP,IFUT,IRF, PILIH, BUKTI
from lib14 import load
random.seed(31)
STEP = 10   # ambil potret tiap 10 bar (5 menit) supaya tidak saling menyalin

def uji(dsl, cond, hasil, nama):
    tp=fp=tn=fn=0
    for ds in dsl:
        D = load(ds); dd = {p: S for p, S in D.items()}
        for (dsn,p,F,v,n) in get(ds):
            S = dd.get(p)
            for k in range(1, n, STEP):
                x = F[k]
                c = cond(x, S, k)
                if c is None: continue
                h = hasil(x, S, k)
                if h is None: continue
                if c and h: tp+=1
                elif c and not h: fp+=1
                elif (not c) and h: fn+=1
                else: tn+=1
    N=tp+fp+tn+fn
    if N==0: print(nama,"tidak ada data"); return
    base=(tp+fn)/N
    pres=tp/max(tp+fp,1); rec=tp/max(tp+fn,1)
    print(f"{nama:46s} n={N:6d} | dasar {100*base:5.1f}% | nyala {100*(tp+fp)/N:5.1f}% | "
          f"benar(presisi) {100*pres:5.1f}% | tertangkap(recall) {100*rec:5.1f}% | angkat {pres/max(base,1e-9):.2f}x")

# --- TANDA 1: masih mau naik (nilai akan naik >=1,5x lagi)
naik = lambda x,S,k: x[IFUT] > 1.5*x[IV]
c1 = lambda x,S,k: (S["nb"][max(0,k-5):k+1].count(0) < 6) and sum(S["nb"][max(0,k-5):k+1])>=5 and x[IR3] <= 0.5
c1b= lambda x,S,k: sum(S["nb"][max(0,k-5):k+1])>=5 and x[IR3] <= 1.0
crand = lambda x,S,k: random.random() < 0.25
# --- TANDA 2: sudah puncak (tidak akan ada nilai >1,1x nilai sekarang lagi)
puncak = lambda x,S,k: not (x[IFUT] > 1.1*x[IV])
c2 = lambda x,S,k: x[IPK]>=1.5 and x[IDD]>=0.30
c2b= lambda x,S,k: x[IPK]>=1.5 and x[IR3]>=1.0
c2c= lambda x,S,k: x[IPK]>=1.5 and x[IDD]>=0.30 and x[IR3]>=1.0
# --- TANDA 3: mau rug (nilai jadi <=10% dalam 30 menit ke depan)
def rug(x,S,k):
    n=S["n"]; hi=min(n, k+60)
    return min(S["v"][k:hi]) <= 0.10*max(S["v"][k],1e-9)
c3 = lambda x,S,k: x[IRF] >= 0.30
c3b= lambda x,S,k: x[IMX] >= 0.05
c3c= lambda x,S,k: x[IR1] >= 3.0

for nama, dsl in (("PILIH",PILIH),("BUKTI",BUKTI)):
    print(f"\n### {nama}")
    uji(dsl, c1, naik,  "T1 pembeli ramai & jual/beli<=0,5 -> naik>=1,5x")
    uji(dsl, c1b,naik,  "T1b pembeli ramai & jual/beli<=1,0 -> naik>=1,5x")
    uji(dsl, crand,naik,"T1 KONTROL acak 25%")
    uji(dsl, c2, puncak,"T2 turun>=30% dari puncak -> sudah puncak")
    uji(dsl, c2b,puncak,"T2b jual/beli 3mnt>=1 (stlh 1,5x) -> sudah puncak")
    uji(dsl, c2c,puncak,"T2c turun>=30% DAN jual/beli>=1 -> sudah puncak")
    uji(dsl, crand,puncak,"T2 KONTROL acak 25%")
    uji(dsl, c3, rug,   "T3 LP ditarik>=30% -> nilai jadi <=10% dlm 30 mnt")
    uji(dsl, c3b,rug,   "T3b satu jual>=5% LP -> rug")
    uji(dsl, c3c,rug,   "T3c jual/beli 1mnt>=3 -> rug")
    uji(dsl, crand,rug, "T3 KONTROL acak 25%")
