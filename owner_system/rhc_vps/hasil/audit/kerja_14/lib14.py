# Agent 14 - pemuat deret bar + fitur KAUSAL (hanya data sampai bar sekarang)
import csv, json, os, math
HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = r"C:\Users\horii\rhc-quant\rhc_vps"
BAR = 300
BLKSEC = 0.1013
MNT = 2.0            # bar per menit (300 blok * 0,1013 s = 30,4 dtk)

def load(ds):
    """kembalikan {pool: dict deret rapat}"""
    lp = {}
    fp = os.path.join(HERE, f"lp_{ds}.csv")
    if os.path.exists(fp):
        with open(fp) as fh:
            rd = csv.DictReader(fh)
            for r in rd:
                lp.setdefault(r["pool"], []).append((int(r["k"]), float(r["add"]), float(r["rem"]), float(r["remfrac"])))
    raw = {}
    with open(os.path.join(HERE, f"bars_{ds}.csv")) as fh:
        rd = csv.DictReader(fh)
        for r in rd:
            raw.setdefault(r["pool"], []).append(r)
    out = {}
    for p, rs in raw.items():
        rs.sort(key=lambda r: int(r["k"]))
        n = int(rs[-1]["k"]) + 1
        if n < 1: continue
        v = [0.0]*n; vx = [0.0]*n; vn = [0.0]*n; nb=[0]*n; ns=[0]*n; bu=[0.0]*n; su=[0.0]*n
        L=[0.0]*n; mxs=[0.0]*n; nsw=[0]*n; gap=[0]*n; blast=[0]*n
        cur = None
        j = 0
        for k in range(n):
            if j < len(rs) and int(rs[j]["k"]) == k:
                r = rs[j]; j += 1
                v[k]=float(r["vlast"]); vx[k]=float(r["vmax"]); vn[k]=float(r["vmin"])
                nb[k]=int(r["nb"]); ns[k]=int(r["ns"]); bu[k]=float(r["bu"]); su[k]=float(r["su"])
                L[k]=float(r["lp"]); mxs[k]=float(r["mxs"]); nsw[k]=int(r["nsw"]); gap[k]=int(r["gapmax"])
                blast[k]=int(r["blast"]); cur = (v[k], vx[k], vn[k], L[k])
            else:
                if cur is None: v[k]=vx[k]=vn[k]=0.0; L[k]=0.0
                else: v[k]=vx[k]=vn[k]=cur[0]; L[k]=cur[3]
        # remfrac kumulatif per bar (LP ditarik)
        rf = [0.0]*n; rem=[0.0]*n
        cf = 0.0
        ev = lp.get(p, [])
        ei = 0
        for k in range(n):
            while ei < len(ev) and ev[ei][0] <= k:
                cf = ev[ei][3]; rem[k] += ev[ei][2]; ei += 1
            rf[k] = cf
        out[p] = dict(n=n, v=v, vx=vx, vn=vn, nb=nb, ns=ns, bu=bu, su=su, L=L, mxs=mxs,
                      nsw=nsw, gap=gap, blast=blast, rf=rf, rem=rem)
    return out

def win(a, k, w):
    lo = max(0, k-w+1)
    return sum(a[lo:k+1])

def feats(S, k):
    """fitur KAUSAL di bar k (hanya 0..k)"""
    v = S["v"]; n = S["n"]
    pk = max(S["vx"][:k+1])
    f = {}
    f["v"] = v[k]; f["pk"] = pk
    f["dd"] = 1 - v[k]/pk if pk > 0 else 0.0
    for nm, w in (("1", 2), ("3", 6), ("5", 10), ("10", 20)):
        b = win(S["bu"], k, w); s = win(S["su"], k, w)
        cb = win(S["nb"], k, w); cs = win(S["ns"], k, w)
        f["bu"+nm]=b; f["su"+nm]=s; f["nb"+nm]=cb; f["ns"+nm]=cs
        f["r"+nm] = s/max(b, 1.0)                    # rasio USD jual/beli
        f["rn"+nm] = cs/max(cb+cs, 1)                # pecahan swap jual
        f["net"+nm] = (b-s)/max(S["L"][k], 1.0)      # net flow / likuiditas
    f["mxs3"] = max(S["mxs"][max(0,k-5):k+1]) if k >= 0 else 0.0
    f["acc"] = win(S["nsw"], k, 2)/max(win(S["nsw"], k, 20)/10.0, 1e-9)
    # berapa bar berturut-turut tanpa PEMBELI
    d = 0
    for j in range(k, -1, -1):
        if S["nb"][j] == 0: d += 1
        else: break
    f["dry"] = d
    # berapa bar tanpa swap sama sekali
    d2 = 0
    for j in range(k, -1, -1):
        if S["nsw"][j] == 0: d2 += 1
        else: break
    f["quiet"] = d2
    f["rf"] = S["rf"][k]
    f["lpdrop"] = S["L"][k]/max(S["L"][0], 1.0)
    return f
