# arena_scored_okt_<VAR>.csv = arena_scored_okt.csv (skor model live beku) dgn label dari okt1/trades_<VAR>.jsonl
import pandas as pd, json, sys
var=sys.argv[1]; df=pd.read_csv("arena_scored_okt.csv"); lab={}
for l in open(f"okt1/trades_{var}.jsonl"):
    t=json.loads(l)
    if t["plan"]=="v4": lab[t["pool"]]=(t["entryBlk"],t["exitBlk"],t["ret"])
miss=0
for i,r in df.iterrows():
    if r.pool not in lab: miss+=1; continue
    e,x,rt=lab[r.pool]; df.at[i,"entry"]=e; df.at[i,"exit"]=x; df.at[i,"ret"]=rt; df.at[i,"win"]=int(rt>1)
df.to_csv(f"arena_scored_okt_{var}.csv",index=False); print("okt",var,"baris",len(df),"tanpa label",miss)
