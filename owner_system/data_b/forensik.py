# Forensik perjalanan tiap koin v4 dari swap on-chain: harga, aliran, likuiditas pada titik waktu setelah pool lahir.
# Waktu: 10 blok/detik. Titik (menit): 1,2,5,10,20,30,60,120,240,540. Harga relatif harga MASUK (init+630).
import json, sys, csv, math
NAT="0x0000000000000000000000000000000000000000"; HZ=324000
CK=[1,2,5,10,20,30,60,120,240,540]
out=open(f"forensik_{'_'.join(sys.argv[1:])}.jsonl","w")
def selesai(p,rows,U,q1):
    t=U[p]; init=t["init"]; e=t["entryBlk"]; eth=t["ethUsd"]; q=q1.get(p,True)
    pe=None; Le=None; snap={}; ci=0
    nb=ns=0; bu=su=0.0; txs=set(); run_max=0; mx=0; mx_blk=None; t2=t5=t11=None; dd_before=0.0; first_after=None
    big_buy=0; last_pr=None; last_L=None; last_lp=0.0; dd_at_peak=0.0
    for (b,a0,a1,sp,L,tx) in rows:
        if b>init+HZ: break
        pr=sp*sp if q else 1/(sp*sp)
        base=a0 if q else a1; quote=a1 if q else a0
        usd=abs(quote)/1e18*eth; buy=base>0
        while ci<len(CK) and b>init+CK[ci]*600:
            snap[CK[ci]]=dict(m=(last_pr/pe if (pe and last_pr) else None),nb=nb,ns=ns,bu=round(bu,2),su=round(su,2),ntx=len(txs),Lr=(last_L/Le if (Le and last_L) else None),lp=round(last_lp,0))
            ci+=1
        if buy: nb+=1; bu+=usd
        else: ns+=1; su+=usd
        txs.add(tx)
        last_pr=pr; last_L=L; last_lp=2*((L*sp) if q else (L/sp))/1e18*eth
        if b<=e: pe=pr; Le=L; continue
        if pe is None: pe=pr; Le=L
        m=pr/pe
        if m>run_max: run_max=m
        else: dd_before=max(dd_before,1-m/run_max) if run_max>0 else dd_before
        if m>mx: mx=m; mx_blk=b; dd_at_peak=dd_before
        mins=(b-init)/600
        if t2 is None and m>=2: t2=mins
        if t5 is None and m>=5: t5=mins
        if t11 is None and m>=11: t11=mins
    if pe is None: return
    while ci<len(CK):
        snap[CK[ci]]=dict(m=last_pr/pe,nb=nb,ns=ns,bu=round(bu,2),su=round(su,2),ntx=len(txs),Lr=(last_L/Le if Le else None),lp=round(last_lp,0)); ci+=1
    out.write(json.dumps(dict(ds=D,pool=p,mx=mx,t_peak=((mx_blk-init)/600 if mx_blk else None),t2=t2,t5=t5,t11=t11,
        dd_sebelum_puncak=(dd_at_peak if mx_blk else None),snap=snap))+"\n")
for D in sys.argv[1:]:
    U={}
    for l in open(f"{D}/trades.jsonl"):
        t=json.loads(l)
        if t["plan"]=="v4": U[t["pool"]]=t
    q1={r["pool_id"]:(r["c1"].lower()==NAT) for r in csv.DictReader(open(f"{D}/pools.csv")) if r["pool_id"] in U}
    cur=None; rows=[]; done=set(); bad=0
    with open(f"{D}/swaps_sorted.csv") as f:
        next(f)
        for line in f:
            p=line[:66]
            if p!=cur:
                if cur in U: selesai(cur,rows,U,q1); done.add(cur)
                if p in done: bad+=1
                cur=p; rows=[]
            if p not in U: continue
            c=line.split(","); sp=int(c[6])/2**96
            if sp<=0: continue
            rows.append((int(c[1]),float(c[4]),float(c[5]),sp,float(c[7]),c[3]))
        if cur in U: selesai(cur,rows,U,q1)
    print(D,len(U),"pool | urutan rusak:",bad,file=sys.stderr)
