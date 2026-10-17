# (a) uji berpasangan "perkecil posisi" pada DAFTAR BELI TERKUNCI  (b) sensitivitas ekor
import pandas as pd,numpy as np,json
rng=np.random.default_rng(21)
A=json.load(open("arena_base_p5.json"))
dump=pd.DataFrame(A["dump"])
pm=pd.read_csv("prug_multi.csv")
d=dump.merge(pm[["pool","p_rug1","p_rug3","p_rug5","p_rug10","p_rug30","dt"]],on="pool",how="left")
d["per"]=np.where(d.ds.isin(["m1","m2"]),"BARU","LAMA")
d["pnl"]=d.pos*(d.ret-1)
print("daftar beli terkunci: %d trade | pnl orde-1 $%.0f (akun akhir $%.0f)"%(len(d),d.pnl.sum(),A["hasil"]["eqAkhir"]))
print("\n== (a) PERKECIL POSISI: selisih untung, daftar koin DIKUNCI, bootstrap 95% ==")
rows=[]
for col,taus in [("p_rug1",[0.03,0.05,0.08]),("p_rug3",[0.10,0.15,0.20]),("p_rug5",[0.20,0.25,0.35]),
                 ("p_rug10",[0.35,0.45,0.55]),("p_rug30",[0.80,0.88,0.92])]:
    for tau in taus:
        for mul in [0.5,0.25]:
            f=(d[col]>=tau).fillna(False)
            dd=np.where(f,d.pos*(mul-1)*(d.ret-1),0.0)
            for per in ["LAMA","BARU"]:
                s=(d.per==per).values
                x=dd[s]
                bs=[x[rng.integers(0,len(x),len(x))].sum() for _ in range(2000)]
                rows.append(dict(skor=col,tau=tau,x=mul,per=per,kena=int(f[s].sum()),
                    selisih=round(x.sum(),0),ci="[%.0f,%.0f]"%tuple(np.percentile(bs,[2.5,97.5]))))
r=pd.DataFrame(rows)
print(r.pivot_table(index=["skor","tau","x"],columns="per",values="selisih").round(0).to_string())
print("\ndetail (kena / selisih / CI):")
print(r.to_string(index=False))
print("\n== (b) SENSITIVITAS EKOR: akun tanpa n trade terburuk / terbaik (orde-1 pnl) ==")
for per in ["BARU","LAMA","SEMUA"]:
    s=d if per=="SEMUA" else d[d.per==per]
    t=s.sort_values("pnl")
    tot=t.pnl.sum()
    line=f"{per:6s} total ${tot:8.0f}"
    for k in [1,3,5]: line+=f" | tanpa {k} terburuk ${t.pnl[k:].sum():8.0f}"
    for k in [1,3,5]: line+=f" | tanpa {k} terbaik ${t.pnl[:-k].sum():8.0f}"
    print(line)
print("\ntrade terburuk (10):")
print(d.nsmallest(10,"pnl")[["pool","ds","ret","pos","pnl","dt","p_rug3","p_rug10"]].round(3).to_string(index=False))
