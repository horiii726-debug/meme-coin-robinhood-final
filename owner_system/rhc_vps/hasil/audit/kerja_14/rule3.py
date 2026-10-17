# Agent 14 - RONDE 3. Temuan dip.py: saat turun dari puncak, TEKANAN menentukan apakah koin pulih.
# Aturan baru: "keluar cepat kalau penjual menang, TAHAN kalau pembeli masih menang".
import os, sys, math, random
import statistics as st
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from lib14 import load
random.seed(5)
PILIH = ["ags1","ags4","u_ds5d","u_ds24"]; BUKTI = ["m1","m2"]

def prep(S):
    n = S["n"]; v = S["v"]; vx = S["vx"]; bu=S["bu"]; su=S["su"]; nb=S["nb"]; ns=S["ns"]
    L=S["L"]; mxs=S["mxs"]
    pk=[0.0]*n; kpk=[0]*n; m=v[0]; km=0
    for k in range(n):
        if vx[k] > m: m=vx[k]; km=k
        pk[k]=m; kpk[k]=km
    fut=[0.0]*n; m=v[n-1]
    for k in range(n-1,-1,-1):
        fut[k]=m
        if vx[k]>m: m=vx[k]
    cbu=[0.0]*(n+1); csu=[0.0]*(n+1); cnb=[0]*(n+1); cns=[0]*(n+1)
    for i in range(n):
        cbu[i+1]=cbu[i]+bu[i]; csu[i+1]=csu[i]+su[i]; cnb[i+1]=cnb[i]+nb[i]; cns[i+1]=cns[i]+ns[i]
    F=[]
    for k in range(n):
        w=lambda c,ww: c[k+1]-c[max(0,k-ww+1)]
        b3=w(cbu,6); s3=w(csu,6); b1=w(cbu,2); s1=w(csu,2)
        kp=kpk[k]
        bsp=cbu[k+1]-cbu[kp]; ssp=csu[k+1]-csu[kp]      # sejak bar puncak berjalan
        nbsp=cnb[k+1]-cnb[kp]
        drop1 = 1 - v[k]/max(v[k-1],1e-9) if k>0 else 0.0
        F.append((v[k], pk[k], (1-v[k]/pk[k]) if pk[k]>0 else 0.0,
                  s1/max(b1,1.0), s3/max(b3,1.0), ssp/max(bsp,1.0),
                  max(mxs[max(0,k-5):k+1]), nbsp, (k-kp)/2.0, drop1, fut[k], S["rf"][k]))
    return F, v, n
IV,IPK,IDD,IR1,IR3,IRSP,IMX,INBSP,IAGE,IDROP,IFUT,IRF = range(12)

C={}
def get(ds):
    if ds not in C:
        D=load(ds); o=[]
        for p,S in D.items():
            if S["n"]<2: continue
            o.append((ds,p)+prep(S))
        C[ds]=o
    return C[ds]

def ev(dsl, rule):
    R=[]
    for ds in dsl:
        for (dsn,p,F,v,n) in get(ds):
            hit=None
            for k in range(1,n):
                if rule(F[k]): hit=k; break
            if hit is None: ex=v[n-1]; k=n-1; fut=v[n-1]
            else: k=hit; ex=v[k]; fut=F[k][IFUT]
            pkall=F[n-1][IPK]
            R.append((ex,k,fut,pkall))
    n=len(R)
    return dict(n=n, pnl=sum(x[0]-1 for x in R), med=st.median([x[0] for x in R]),
                win=sum(1 for x in R if x[0]>1)/n,
                dini=sum(1 for x in R if x[2]>1.5*x[0]),
                telat=sum(1 for x in R if x[3]>0 and x[0]<0.5*x[3]),
                near10=sum(1 for x in R if x[3]>=10 and x[0]>=0.5*x[3]),
                n10=sum(1 for x in R if x[3]>=10),
                mnt=st.median([x[1]/2.0 for x in R]))

def tahan(Tk, Tl, S, A=1.5, use="r3"):
    ix = {"r3":IR3, "r1":IR1, "rsp":IRSP}[use]
    def f(x):
        if x[IPK] < A: return False
        if x[IDD] >= Tl: return True
        return x[IDD] >= Tk and x[ix] >= S
    return f

def baris(nm, e):
    print(f"{nm:44s} {e['n']:5d} {e['pnl']:8.1f} {e['med']:6.3f} {100*e['win']:6.1f} {e['dini']:5d} {e['telat']:6d} {e['near10']:4d}/{e['n10']:<5d} {e['mnt']:7.1f}")

if __name__ == "__main__":
    print(f"{'aturan':44s} {'n':>5} {'PnL/$1':>8} {'med':>6} {'win%':>6} {'dini':>5} {'telat':>6} {'10x dkt':>10} {'mnt':>7}")
    for nama, dsl in (("PILIH", PILIH), ("BUKTI", BUKTI)):
        print(f"\n### {nama} {dsl}")
        baris("REF trail 30% (dipilih ronde 1)", ev(dsl, lambda x: x[IPK]>=1.5 and x[IDD]>=0.30))
        baris("REF trail 15%", ev(dsl, lambda x: x[IPK]>=1.5 and x[IDD]>=0.15))
        for use in ("r3","rsp"):
            for Tk in (0.10,0.15,0.20):
                for Tl in (0.30,0.40,0.50,0.60):
                    for S in (0.7,1.0,1.5):
                        baris(f"TAHAN {use} keluar dd{Tk} bila {use}>{S}, paksa dd{Tl}",
                              ev(dsl, tahan(Tk,Tl,S,1.5,use)))
        for hz in (0.01,0.03):
            baris(f"KONTROL acak p={hz}", ev(dsl, lambda x, hz=hz: random.random()<hz))
        baris("KONTROL ambang acak (r3 diacak)", ev(dsl, lambda x: x[IPK]>=1.5 and (x[IDD]>=0.5 or (x[IDD]>=0.15 and random.random()<0.5))))
