# Agent 14 - uji ATURAN KELUAR di tingkat bar. Kausal: hanya data <= bar sekarang.
# Fitur diprakomputasi sekali per koin (cumsum), lalu banyak aturan diuji cepat.
import os, sys, math, random, json, pickle
import statistics as st
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from lib14 import load

random.seed(11)
HERE = os.path.dirname(os.path.abspath(__file__))
PILIH = ["ags1","ags4","u_ds5d","u_ds24"]
BUKTI = ["m1","m2"]

def cs(a):
    o = [0.0]*(len(a)+1)
    for i, x in enumerate(a): o[i+1] = o[i] + x
    return o
def wsum(c, k, w): return c[k+1] - c[max(0, k-w+1)]

def prep_one(S):
    n = S["n"]; v = S["v"]; vx = S["vx"]
    cbu = cs(S["bu"]); csu = cs(S["su"]); cnb = cs(S["nb"]); cns = cs(S["ns"])
    pk = [0.0]*n; m = v[0]
    for k in range(n):
        if vx[k] > m: m = vx[k]
        pk[k] = m
    # puncak SESUDAH bar k (untuk penilaian, BUKAN untuk aturan)
    fut = [0.0]*n; m = v[n-1]
    for k in range(n-1, -1, -1):
        fut[k] = m
        if vx[k] > m: m = vx[k]
    dry = [0]*n; d = 0
    for k in range(n):
        d = d+1 if S["nb"][k] == 0 else 0
        dry[k] = d
    mx3 = [0.0]*n
    for k in range(n): mx3[k] = max(S["mxs"][max(0,k-5):k+1])
    F = []
    L = S["L"]; L0 = max(L[0], 1.0)
    for k in range(n):
        b1 = wsum(cbu,k,1); s1 = wsum(csu,k,1)
        b3 = wsum(cbu,k,6); s3 = wsum(csu,k,6)
        b10 = wsum(cbu,k,20); s10 = wsum(csu,k,20)
        cb3 = wsum(cnb,k,6); cs3 = wsum(cns,k,6)
        F.append((v[k], pk[k], (1-v[k]/pk[k]) if pk[k] > 0 else 0.0,
                  s1/max(b1,1.0), s3/max(b3,1.0), s10/max(b10,1.0),
                  cs3/max(cb3+cs3,1), mx3[k], dry[k], S["rf"][k], L[k]/L0, fut[k]))
    return F, v, n
# indeks fitur
IV,IPK,IDD,IR1,IR3,IR10,IRN,IMX,IDRY,IRF,ILP,IFUT = range(12)

CACHE = {}
def get(ds):
    if ds not in CACHE:
        D = load(ds); out = []
        for p, S in D.items():
            if S["n"] < 2: continue
            out.append((ds, p) + prep_one(S))
        CACHE[ds] = out
    return CACHE[ds]

def evalrule(dsl, rule, pess=False):
    R = []
    for ds in dsl:
        for (dsn, p, F, v, n) in get(ds):
            hit = None
            for k in range(1, n):
                if rule(F[k]): hit = k; break
            if hit is None:
                ex = v[n-1]; k = n-1; pkaf = v[n-1]
            else:
                k = hit
                ex = v[min(k+1, n-1)] if pess else v[k]
                pkaf = F[k][IFUT]
            pkall = F[n-1][IPK]
            R.append((ex, k, pkaf, pkall, dsn, p))
    n = len(R)
    tot = sum(x[0]-1 for x in R)
    med = st.median([x[0] for x in R])
    wn = sum(1 for x in R if x[0] > 1)/n
    early = sum(1 for x in R if x[2] > 1.5*x[0])
    late = sum(1 for x in R if x[3] > 0 and x[0] < 0.5*x[3])
    n10 = sum(1 for x in R if x[3] >= 10)
    near = sum(1 for x in R if x[3] >= 10 and x[0] >= 0.5*x[3])
    hold = st.median([x[1]/2.0 for x in R])
    return dict(n=n, pnl=tot, med=med, win=wn, early=early, late=late,
                near10=near, n10=n10, hold=hold, R=R)

def mk_trail(A,T):      return lambda f: f[IPK] >= A and f[IDD] >= T
def mk_conf(A,T,S):     return lambda f: f[IPK] >= A and f[IDD] >= T and (f[IR1] >= S or f[IRN] >= 0.55)
def mk_press(A,S):      return lambda f: f[IPK] >= A and f[IR3] >= S
def mk_big(X):          return lambda f: f[IMX] >= X
def mk_dry(Z):          return lambda f: f[IDRY] >= Z
def mk_lp(Y):           return lambda f: f[IRF] >= Y

RULES = {}
RULES["0-tahan 9 jam"] = lambda f: False
for A in (1.3,1.5,2.0):
    for T in (0.10,0.15,0.20,0.25,0.30,0.40):
        RULES[f"T-trail A{A} dd{T}"] = mk_trail(A,T)
for T in (0.15,0.25):
    for S in (1.0,1.5,2.0):
        RULES[f"C-trail+tekanan A1.5 dd{T} r1>{S}"] = mk_conf(1.5,T,S)
for A in (1.3,1.5):
    for S in (1.5,2.0,3.0):
        RULES[f"P-tekanan A{A} r3>{S}"] = mk_press(A,S)
for X in (0.03,0.05,0.10): RULES[f"B-jual besar {X} LP"] = mk_big(X)
for Z in (10,20,40):       RULES[f"K-kering {Z} bar"] = mk_dry(Z)
for Y in (0.30,0.50):      RULES[f"L-LP ditarik {Y}"] = mk_lp(Y)

def tabel(dsl, rules, pess=False):
    print(f"{'aturan':36s} {'n':>5} {'PnL/$1':>8} {'med':>6} {'win%':>6} {'dini':>5} {'telat':>6} {'10x dkt puncak':>15} {'mnt':>7}")
    out = {}
    for nm, r in rules.items():
        e = evalrule(dsl, r, pess); out[nm] = e
        print(f"{nm:36s} {e['n']:5d} {e['pnl']:8.1f} {e['med']:6.3f} {100*e['win']:6.1f} {e['early']:5d} {e['late']:6d} {e['near10']:6d}/{e['n10']:<8d} {e['hold']:7.1f}")
    return out

if __name__ == "__main__":
    mode = sys.argv[1] if len(sys.argv) > 1 else "pilih"
    dsl = PILIH if mode == "pilih" else BUKTI
    print(f"### {mode}: {dsl}")
    tabel(dsl, RULES)
    for hz in (0.005,0.02,0.05):
        e = evalrule(dsl, lambda f, hz=hz: random.random() < hz)
        print(f"{'ACAK p=%.3f/bar'%hz:36s} {e['n']:5d} {e['pnl']:8.1f} {e['med']:6.3f} {100*e['win']:6.1f} {e['early']:5d} {e['late']:6d} {e['near10']:6d}/{e['n10']:<8d} {e['hold']:7.1f}")
