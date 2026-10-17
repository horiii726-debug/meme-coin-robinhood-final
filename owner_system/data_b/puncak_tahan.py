# Puncak yang BISA dijual: S_W = max_i min{harga di [t_i, t_i+W]} -> harga yang bertahan minimal W.
# W = 30 dtk (300 blok) dan 5 mnt (3000 blok). Juga jumlah swap pada >= 50% puncak sesaat.
import json, sys, csv
from collections import deque
NAT="0x0000000000000000000000000000000000000000"; HZ=324000
out=open(f"tahan_{'_'.join(sys.argv[1:])}.csv","w"); out.write("ds,pool,mx,s30,s300,n_dekat_puncak,dur_atas_half_min\n")
def smax(bl,pr,W):
    best=0; dq=deque(); k=0; n=len(bl)
    for i in range(n):
        while k<n and bl[k]<=bl[i]+W:
            while dq and pr[dq[-1]]>=pr[k]: dq.pop()
            dq.append(k); k+=1
        while dq[0]<i: dq.popleft()
        best=max(best,pr[dq[0]])
    return best
def selesai(p,rows,U,q1):
    t=U[p]; e=t["entryBlk"]; init=t["init"]; q=q1.get(p,True); pe=None; bl=[]; pr=[]
    for (b,sp) in rows:
        if b>init+HZ: break
        x=sp*sp if q else 1/(sp*sp)
        if b<=e: pe=x; continue
        if pe is None: pe=x
        bl.append(b); pr.append(x/pe)
    if not pr: out.write(f"{D},{p},0,0,0,0,0\n"); return
    mx=max(pr); half=0.5*mx
    dur=0.0
    for i in range(len(pr)):
        if pr[i]>=half:
            nxt=bl[i+1] if i+1<len(bl) else min(init+HZ,bl[i]+600)
            dur+=(nxt-bl[i])/600
    out.write(f"{D},{p},{mx:.4f},{smax(bl,pr,300):.4f},{smax(bl,pr,3000):.4f},{sum(1 for x in pr if x>=half)},{dur:.2f}\n")
for D in sys.argv[1:]:
    U={}
    for l in open(f"{D}/trades.jsonl"):
        t=json.loads(l)
        if t["plan"]=="v4": U[t["pool"]]=t
    q1={r["pool_id"]:(r["c1"].lower()==NAT) for r in csv.DictReader(open(f"{D}/pools.csv")) if r["pool_id"] in U}
    cur=None; rows=[]
    with open(f"{D}/swaps_sorted.csv") as f:
        next(f)
        for line in f:
            p=line[:66]
            if p!=cur:
                if cur in U: selesai(cur,rows,U,q1)
                cur=p; rows=[]
            if p not in U: continue
            c=line.split(","); sp=int(c[6])/2**96
            if sp>0: rows.append((int(c[1]),sp))
        if cur in U: selesai(cur,rows,U,q1)
    print(D,file=sys.stderr)
