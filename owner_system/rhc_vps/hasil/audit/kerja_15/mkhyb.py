import pandas as pd, json, os, sys
tau=float(sys.argv[1]); dly=sys.argv[2]; nm=sys.argv[3]
pr=pd.read_csv("prug_rug3.csv")
flag=set(pr[pr.p_rug>=tau].pool)
for p in ["ags1","ags4","ds5d","ds24","m1","m2"]:
    b={}; d={}
    for v,tgt in [("base",b),(dly,d)]:
        f="out/%s_%s.jsonl"%(p,v)
        for l in open(f,encoding="utf8"):
            l=l.strip()
            if not l: continue
            t=json.loads(l)
            tgt.setdefault(t["plan"],{})[t["pool"]]=l
    with open("out/%s_%s.jsonl"%(p,nm),"w",encoding="utf8") as o:
        for plan,pool_map in b.items():
            for pool,line in pool_map.items():
                if pool in flag:
                    alt=d.get(plan,{}).get(pool)
                    if alt: o.write(alt+"\n")
                else: o.write(line+"\n")
        for plan,pool_map in d.items():
            for pool,line in pool_map.items():
                if pool in flag and pool not in b.get(plan,{}): o.write(line+"\n")
print(nm,"ditandai",len(flag))
