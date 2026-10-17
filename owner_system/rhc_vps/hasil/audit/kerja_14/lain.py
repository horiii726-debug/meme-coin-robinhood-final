# Agent 14 - arah tambahan dari pemilik: kecepatan turun, LP sebagai peringatan dini,
# ukuran posisi vs likuiditas, dan aturan berjenjang menurut seberapa tinggi koin sudah naik.
import os, sys, math, random, json, csv
import statistics as st
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from rule3 import get, ev, baris, IV,IPK,IDD,IR1,IR3,IRSP,IMX,INBSP,IAGE,IDROP,IFUT,IRF, PILIH, BUKTI
from lib14 import load
random.seed(23)
DATA = r"C:\Users\horii\rhc-quant\rhc_vps\data"

print("=== A. KECEPATAN TURUN: berapa bagian penurunan terjadi dalam SATU bar (30 dtk)? ===")
for nama, dsl in (("PILIH",PILIH),("BUKTI",BUKTI)):
    fast=[]; slow=[]; semua=[]
    for ds in dsl:
        for (dsn,p,F,v,n) in get(ds):
            pk=F[n-1][IPK]
            if pk < 3: continue
            kp=next(k for k in range(n) if F[k][IPK]>=pk-1e-12)
            kd=None
            for k in range(kp,n):
                if F[k][IV] <= 0.5*pk: kd=k; break
            if kd is None: continue
            # bagian penurunan terbesar dalam satu bar
            mx=max(F[k][IDROP] for k in range(kp+1,kd+1)) if kd>kp else F[kd][IDROP]
            semua.append(mx)
            (fast if mx>=0.4 else slow).append((kd-kp)/2.0)
    if not semua: continue
    print(f"{nama}: koin >=3x yang dump, n={len(semua)} | penurunan 1-bar terbesar: median {100*st.median(semua):.0f}% "
          f"| 'satu tembakan' (>=40% dlm 1 bar) {100*len(fast)/len(semua):.0f}% "
          f"| lama puncak->dump: cepat {st.median(fast) if fast else float('nan'):.1f} mnt vs pelan {st.median(slow) if slow else float('nan'):.1f} mnt")

print("\n=== B. LIKUIDITAS SEBAGAI PERINGATAN DINI (LP berubah sebelum harga) ===")
for nama, dsl in (("PILIH",PILIH),("BUKTI",BUKTI)):
    lead=[]; nlp=0; ntot=0
    for ds in dsl:
        D=load(ds)
        for (dsn,p,F,v,n) in get(ds):
            pk=F[n-1][IPK]
            kp=next(k for k in range(n) if F[k][IPK]>=pk-1e-12)
            kd=None
            for k in range(kp,n):
                if F[k][IV] <= 0.5*pk: kd=k; break
            if kd is None: continue
            ntot+=1
            klp=None
            for k in range(1,n):
                if F[k][IRF] >= 0.10: klp=k; break
            if klp is None: continue
            nlp+=1; lead.append((kd-klp)/2.0)
    if ntot:
        print(f"{nama}: koin yang dump {ntot} | yang pernah LP ditarik >=10% {nlp} ({100*nlp/ntot:.0f}%) | "
              f"LP ditarik mendahului dump median {st.median(lead) if lead else float('nan'):+.1f} mnt "
              f"(>0 = lebih awal); mendahului pada {100*sum(1 for x in lead if x>0)/max(len(lead),1):.0f}% kasus")

print("\n=== C. UKURAN POSISI KITA vs LIKUIDITAS (bisa keluar tanpa merusak harga?) ===")
for nama, dsl in (("PILIH",PILIH),("BUKTI",BUKTI)):
    fr=[]
    for ds in dsl:
        sz={}
        for l in open(os.path.join(DATA, ds, "trades.jsonl")):
            t=json.loads(l)
            if t.get("plan")=="v4": sz[t["pool"]]=t["size"]
        D=load(ds)
        for p,S in D.items():
            s=sz.get(p); 
            if not s or S["L"][0]<=0: continue
            fr.append(s/S["L"][0])
    fr.sort()
    print(f"{nama}: posisi/likuiditas saat masuk median {100*fr[len(fr)//2]:.2f}% | p90 {100*fr[int(len(fr)*0.9)]:.2f}% | "
          f"di atas 1% {100*sum(1 for x in fr if x>0.01)/len(fr):.0f}% | di atas 3% {100*sum(1 for x in fr if x>0.03)/len(fr):.0f}%")

print("\n=== D. ATURAN BERJENJANG menurut seberapa tinggi koin sudah naik ===")
def jenjang(t_rendah, t_tengah, t_tinggi):
    def f(x):
        pk=x[IPK]
        if pk < 1.5: return False
        T = t_rendah if pk < 3 else (t_tengah if pk < 10 else t_tinggi)
        return x[IDD] >= T
    return f
print(f"{'aturan':44s} {'n':>5} {'PnL/$1':>8} {'med':>6} {'win%':>6} {'dini':>5} {'telat':>6} {'10x dkt':>10} {'mnt':>7}")
for nama, dsl in (("PILIH",PILIH),("BUKTI",BUKTI)):
    print(f"--- {nama}")
    baris("rata 30% (acuan)", ev(dsl, lambda x: x[IPK]>=1.5 and x[IDD]>=0.30))
    for a,b,c in ((0.20,0.30,0.50),(0.30,0.30,0.50),(0.20,0.40,0.60),(0.30,0.40,0.40),(0.40,0.30,0.20)):
        baris(f"jenjang <3x:{a} 3-10x:{b} >10x:{c}", ev(dsl, jenjang(a,b,c)))

print("\n=== E. SIAPA YANG MENJUAL ===")
print("TIDAK ADA DATA: swaps_sorted.csv tidak punya kolom pengirim, dan transfers.json berhenti di init+600.")
print("Jadi 'penjual pertama = pembeli awal / holder besar / dev' tidak bisa diuji untuk fase keluar.")
