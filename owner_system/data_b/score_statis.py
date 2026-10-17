# Model DILATIH SEKALI di awal, lalu tidak pernah belajar lagi. Untuk dibandingkan dgn model yang terus belajar.
import numpy as np, pandas as pd, json
from catboost import CatBoostClassifier
FE=json.load(open("C:/Users/horii/rhc-quant/live/filter_cat.json"))["feats"]
df=pd.read_csv("arena_feats.csv").sort_values("decide").reset_index(drop=True)
X=df[FE].fillna(-1).values; y=df.win.values.astype(bool)
decide=df.decide.values; exitb=df["exit"].values
# titik latih = saat 300 trade pertama sudah tutup (sama seperti model adaptif mulai matang)
urut=np.sort(exitb); batas=urut[299]
idx=np.where(exitb<batas)[0]
m=CatBoostClassifier(iterations=200,learning_rate=0.05,depth=4,l2_leaf_reg=5.0,random_seed=0,verbose=0,allow_writing_files=False)
m.fit(X[idx],y[idx])
score=np.where(decide>batas, m.predict_proba(X)[:,1], np.nan)
df["score"]=score
df.to_csv("arena_scored_statis.csv",index=False)
print("model statis dilatih dari %d trade, lalu BEKU. Koin berskor: %d"%(len(idx),int((~np.isnan(score)).sum())))
