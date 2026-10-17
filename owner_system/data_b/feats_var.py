# arena_feats_<VAR>.csv = arena_feats.csv dgn label (entry/exit/ret/win) dari trades_<VAR>.jsonl. Fitur masuk tidak berubah.
import pandas as pd, json, sys
var=sys.argv[1]; df=pd.read_csv("arena_feats.csv")
lab={}
for d in df.ds.unique():
    for l in open(f"{d}/trades_{var}.jsonl"):
        t=json.loads(l)
        if t["plan"]=="v4": lab[(d,t["pool"])]=(t["entryBlk"],t["exitBlk"],t["ret"],t["reason"])
miss=0
for i,r in df.iterrows():
    k=(r.ds,r.pool)
    if k not in lab: miss+=1; continue
    e,x,rt,_=lab[k]; df.at[i,"entry"]=e; df.at[i,"exit"]=x; df.at[i,"ret"]=rt; df.at[i,"win"]=int(rt>1)
df.to_csv(f"arena_feats_{var}.csv",index=False)
print(var,"baris",len(df),"tanpa label",miss)
