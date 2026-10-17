import pandas as pd, numpy as np
m=pd.read_csv("arena_lp.csv")
m["fam"]=np.where(m.ts!=1,"lain_ts"+m.ts.astype(str),
        np.where(m.w_main==46055,"ts1_narrow46k",np.where(m.full_range==1,"ts1_fullrange","ts1_lain")))
m.loc[~m.ts.isin([1,25,200]),"fam"]="lain_kecil"
m.loc[m.ts==25,"fam"]="ts25"; m.loc[m.ts==200,"fam"]="ts200"
g=m.groupby(["fam","ds"]).agg(n=("pool","size"),rug30=("rug30","mean"),ret=("ret","mean"),
   med=("ret","median"),win=("win","mean"),rok=("ret",lambda s:(s>3).mean()))
print(g.round(3).to_string())
print("\n== gabungan ==")
print(m.groupby("fam").agg(n=("pool","size"),rug30=("rug30","mean"),ret=("ret","mean"),med=("ret","median"),
   win=("win","mean"),rok=("ret",lambda s:(s>3).sum())).round(3).to_string())
t=pd.read_csv("t178_lp.csv")
t["fam"]=np.where(t.ts!=1,"ts"+t.ts.astype(int).astype(str),
        np.where(t.w_main==46055,"ts1_narrow46k",np.where(t.full_range==1,"ts1_fullrange","ts1_lain")))
print("\n== 178 trade nyata per keluarga ==")
print(t.groupby("fam").agg(n=("pool","size"),pnl=("pnl","sum"),ret=("ret","mean"),win=("ret",lambda s:(s>1).mean()),
   rug30=("rug30","mean"),akhirdata=("keluar",lambda s:(s=="akhir data").sum())).round(3).to_string())
print("\n== 'akhir data' per keluarga ==")
print(t[t.keluar=="akhir data"].groupby("fam").agg(n=("pool","size"),pnl=("pnl","sum")).to_string())
