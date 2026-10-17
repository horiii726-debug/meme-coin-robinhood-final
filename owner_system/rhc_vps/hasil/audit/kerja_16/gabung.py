# Gabungkan baris arena: (A) masuk menit-1 dgn skor ML, (B) jalur kedua 1,5x dari replay mesin nyata.
import pandas as pd, numpy as np, sys
A=sys.argv[1]      # arena_scored.csv (menit-1, ada kolom score)
B=sys.argv[2]      # scored_r15.csv (jalur kedua)
OUT=sys.argv[3]
a=pd.read_csv(A); b=pd.read_csv(B)
for c in ["gasfix","sizefix","jalur"]:
    if c not in a.columns: a[c]=""
b=b.copy(); b["pool"]=b.pool+"M"
keep=[c for c in a.columns if c in b.columns]
out=pd.concat([a,b[keep]],ignore_index=True,sort=False).sort_values("decide")
out.to_csv(OUT,index=False)
print(f"{len(a)} baris menit-1 + {len(b)} baris jalur kedua = {len(out)}")
b[["pool"]].assign(x=1).to_csv(OUT.replace(".csv","_x.csv"),index=False)
