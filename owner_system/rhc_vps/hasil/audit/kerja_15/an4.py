import pandas as pd, numpy as np, json
t=pd.DataFrame(json.load(open("../../uji_maju_final/trade_final178.json")))
tl=pd.DataFrame(json.load(open("../../uji_maju_final/trade_final178_lengkap.json")))
t=t.merge(tl[["pool","keluar","pnl","jam","peak","tp1"]],on="pool",how="left")
lp=pd.read_csv("arena_lp.csv")[["pool","ts","w_main","narrow","add_lg","first_add_dt","rug30","rug10","rug_any","rug_blk","init","sym_off","full_range","fee_y","hook_y","lo_main","hi_main"]]
t=t.merge(lp,on="pool",how="left")
print("178 trade, ketemu LP:",t.ts.notna().sum())
print("\n== hasil per tick_spacing ==")
g=t.groupby("ts").agg(n=("pool","size"),pnl=("pnl","sum"),ret=("ret","mean"),win=("ret",lambda s:(s>1).mean()),
   rug30=("rug30","mean"),pos=("pos","mean"),roket=("ret",lambda s:(s>3).sum()))
print(g.round(3))
print("\n== alasan keluar x ts ==")
print(pd.crosstab(t.keluar,t.ts,values=t.pnl,aggfunc="sum").round(0).fillna(""))
print(pd.crosstab(t.keluar,t.ts))
print("\n== 27 trade 'akhir data' ==")
a=t[t.keluar=="akhir data"]
print(a.groupby("ts").agg(n=("pool","size"),pnl=("pnl","sum"),ret=("ret","mean"),rug30=("rug30","mean"),rug10=("rug10","mean")).round(3))
print("\nts==1: n=%d pnl=$%.0f | ts!=1: n=%d pnl=$%.0f"%((t.ts==1).sum(),t[t.ts==1].pnl.sum(),(t.ts!=1).sum(),t[t.ts!=1].pnl.sum()))
t.to_csv("t178_lp.csv",index=False)
