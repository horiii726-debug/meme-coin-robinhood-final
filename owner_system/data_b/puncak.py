# Puncak HARGA sebenarnya setelah masuk, langsung dari swap on-chain (bukan dari mesin).
# mult9 = harga tertinggi dalam 9 jam setelah masuk / harga masuk; multAll = sampai akhir data periode.
# multHold = selama posisi ditahan; multAfter = setelah kita keluar s/d 9 jam. Harga, bukan nilai jual (abaikan slippage) -> batas atas.
import json, sys, csv, pandas as pd
NAT="0x0000000000000000000000000000000000000000"; HZ=324000
out=[]
for d in sys.argv[1:]:
    U={}
    for l in open(f"{d}/trades.jsonl"):
        t=json.loads(l)
        if t["plan"]=="v4": U[t["pool"]]=t
    q1={}
    for r in csv.DictReader(open(f"{d}/pools.csv")):
        if r["pool_id"] in U: q1[r["pool_id"]]=(r["c1"].lower()==NAT)
    st={p:dict(pe=None,m9=0,ma=0,mh=0,mx=0,lastb=0) for p in U}
    with open(f"{d}/swaps_sorted.csv") as f:
        next(f)
        for line in f:
            p=line[:66]
            if p not in U: continue
            c=line.split(","); b=int(c[1]); sp=int(c[6])/2**96
            if sp<=0: continue
            pr=sp*sp if q1.get(p,True) else 1/(sp*sp)
            t=U[p]; s=st[p]; e=t["entryBlk"]
            if b<=e: s["pe"]=pr; continue
            if s["pe"] is None: s["pe"]=pr
            m=pr/s["pe"]; s["ma"]=max(s["ma"],m); s["lastb"]=max(s["lastb"],b)
            if b<=e+HZ:
                s["m9"]=max(s["m9"],m)
                if b<=t["exitBlk"]: s["mh"]=max(s["mh"],m)
                else: s["mx"]=max(s["mx"],m)
    for p,t in U.items():
        s=st[p]
        out.append(dict(ds=d,pool=p,ret=t["ret"],reason=t["reason"],tp1=t["tp1"],perfect=t.get("perfect"),
                        mult9=s["m9"],multAll=s["ma"],multHold=s["mh"],multAfter=s["mx"],jam_data=(s["lastb"]-t["entryBlk"])*0.1/3600))
    print(d,len(U),file=sys.stderr)
pd.DataFrame(out).to_csv(sys.argv[0].replace(".py","")+"_"+"_".join(sys.argv[1:])+".csv",index=False)
