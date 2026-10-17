# Agent 14 - ronde 2: aturan ADAPTIF (trailing yang mengetat saat tekanan jual naik) + kombinasi.
import os, sys, random
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from rule import (evalrule, tabel, PILIH, BUKTI, IV,IPK,IDD,IR1,IR3,IR10,IRN,IMX,IDRY,IRF,ILP,IFUT)
random.seed(3)

R = {}
R["REF-trail A1.5 dd0.30"] = lambda f: f[IPK] >= 1.5 and f[IDD] >= 0.30
# ADAPTIF: trailing longgar saat PEMBELI menang, ketat saat PENJUAL menang
def adapt(A, Tlonggar, Tketat, S):
    return lambda f: f[IPK] >= A and f[IDD] >= (Tketat if f[IR3] >= S else Tlonggar)
for Tl, Tk, S in ((0.30,0.15,1.0),(0.30,0.15,1.5),(0.40,0.20,1.0),(0.30,0.10,1.0),(0.50,0.20,1.0)):
    R[f"A-adaptif A1.5 {Tl}/{Tk} r3>{S}"] = adapt(1.5, Tl, Tk, S)
# trailing + KELUAR TAMBAHAN pada jual besar / tekanan ekstrem (OR)
def orbig(A,T,X): return lambda f: (f[IPK] >= A and f[IDD] >= T) or f[IMX] >= X
for X in (0.03,0.05,0.08):
    R[f"O-trail0.30 ATAU jual>{X}LP"] = orbig(1.5,0.30,X)
def orpress(A,T,S): return lambda f: (f[IPK] >= A and f[IDD] >= T) or (f[IPK] >= 1.2 and f[IR1] >= S and f[IDD] >= 0.05)
for S in (2.0,3.0,5.0):
    R[f"O-trail0.30 ATAU r1>{S}&dd5%"] = orpress(1.5,0.30,S)
# stop rugi bawah + trailing (koin yang tidak pernah 1,5x)
def floor(A,T,F): return lambda f: (f[IPK] >= A and f[IDD] >= T) or (f[IPK] < A and f[IV] <= F)
for F in (0.6,0.7,0.8):
    R[f"F-trail0.30 + stop {F}"] = floor(1.5,0.30,F)
# gabungan terbaik dugaan
R["G-adaptif+jualbesar+stop0.7"] = lambda f: ((f[IPK] >= 1.5 and f[IDD] >= (0.15 if f[IR3] >= 1.0 else 0.30))
                                              or f[IMX] >= 0.05 or (f[IPK] < 1.5 and f[IV] <= 0.7))
R["G2-trail0.30+jualbesar+stop0.7"] = lambda f: ((f[IPK] >= 1.5 and f[IDD] >= 0.30)
                                              or f[IMX] >= 0.05 or (f[IPK] < 1.5 and f[IV] <= 0.7))

if __name__ == "__main__":
    mode = sys.argv[1] if len(sys.argv) > 1 else "pilih"
    dsl = PILIH if mode == "pilih" else BUKTI
    print(f"### RONDE 2 {mode}: {dsl}")
    tabel(dsl, R)
    print("--- eksekusi PESIMIS (keluar 1 bar / 30 dtk kemudian) ---")
    tabel(dsl, {k: R[k] for k in ["REF-trail A1.5 dd0.30","A-adaptif A1.5 0.3/0.15 r3>1.0","G-adaptif+jualbesar+stop0.7","G2-trail0.30+jualbesar+stop0.7"]}, pess=True)
