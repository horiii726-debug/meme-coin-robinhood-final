import numpy as np, pandas as pd, json
from catboost import CatBoostClassifier
FE=json.load(open("C:/Users/horii/rhc-quant/live/filter_cat.json"))["feats"]
df=pd.read_csv("features_b.csv").sort_values("init").reset_index(drop=True)
X=df[FE].fillna(-1).values; y=df.win.values.astype(bool)
oof=np.full(len(df),np.nan)
# kausal: model dilatih HANYA dari trade yang sudah selesai sebelum potongan itu
cuts=np.linspace(0.35,1.0,8)
for i in range(7):
    a=int(cuts[i]*len(df)); b=int(cuts[i+1]*len(df))
    m=CatBoostClassifier(iterations=200,learning_rate=0.05,depth=4,l2_leaf_reg=5.0,random_seed=0,verbose=0,allow_writing_files=False)
    m.fit(X[:a],y[:a]); oof[a:b]=m.predict_proba(X[a:b])[:,1]
df["score"]=oof
df.to_csv("scores_oof.csv",index=False)
m=~np.isnan(oof)
print("skor kausal untuk",m.sum(),"dari",len(df),"trade")
