# Model PENCARI ROKET: label = ret >= 2x (bukan sekadar untung). Kausal: hanya belajar dari trade yang sudah TUTUP.
import numpy as np, pandas as pd, json
from catboost import CatBoostClassifier
FE=json.load(open("C:/Users/horii/rhc-quant/live/filter_cat.json"))["feats"]
df=pd.read_csv("arena_scored.csv").sort_values("decide").reset_index(drop=True)
X=df[FE].fillna(-1).values; y=(df.ret.values>=2.0)
decide=df.decide.values; exitb=df["exit"].values
n=len(df); moon=np.full(n,np.nan); model=None; dilatih=0; nl=0
for i in range(n):
    siap=exitb<decide[i]; ns=int(siap.sum())
    if ns>=60 and (model is None or ns-dilatih>=100):
        idx=np.where(siap)[0]
        if y[idx].sum()>=5:
            model=CatBoostClassifier(iterations=200,learning_rate=0.05,depth=4,l2_leaf_reg=5.0,random_seed=0,verbose=0,
                                     allow_writing_files=False,auto_class_weights="Balanced")
            model.fit(X[idx],y[idx]); dilatih=ns; nl+=1
    if model is not None: moon[i]=model.predict_proba(X[i:i+1])[:,1][0]
df["moon"]=moon
df.to_csv("arena_scored.csv",index=False)
print("model roket dilatih ulang %dx | koin berskor %d/%d"%(nl,int((~np.isnan(moon)).sum()),n))
m2=df[(df.ds=="m2")&df.moon.notna()]
q=np.quantile(m2.moon,[0.5,0.8,0.9,0.95])
print("\nDATA BERSIH m2 (%d koin) - skor roket vs hasil nyata:"%len(m2))
print("kelompok            n    ret>=2x  ret>=3x  ret rata2  ret maks")
for nm,lo,hi in [("50% terbawah",-1,q[0]),("50-80%",q[0],q[1]),("80-90%",q[1],q[2]),("90-95%",q[2],q[3]),("5% TERATAS",q[3],2)]:
    s=m2[(m2.moon>lo)&(m2.moon<=hi)]
    print("%-16s %4d   %5.1f%%   %5.1f%%    %6.2f    %6.1f"%(nm,len(s),100*(s.ret>=2).mean(),100*(s.ret>=3).mean(),s.ret.mean(),s.ret.max()))
big=m2[m2.ret>=3].sort_values("ret",ascending=False)
print("\nkoin >3x di m2 - persentil skor ROKET vs skor FILTER lama:")
for _,r in big.iterrows():
    print("  %5.1fx | roket: lebih tinggi dari %3.0f%% koin | filter lama: %3.0f%%"%(r.ret,100*(m2.moon<r.moon).mean(),100*(m2.score<r.score).mean()))
