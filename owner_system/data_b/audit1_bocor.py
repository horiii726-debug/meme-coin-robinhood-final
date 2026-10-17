# AUDIT 1: UJI KEBOCORAN. Kalau label diacak, model TIDAK BOLEH bisa menebak.
# AUC harus ~0,50. Kalau jauh di atas itu, ada kebocoran di pipeline (fitur mengandung masa depan).
import numpy as np, pandas as pd, json
from catboost import CatBoostClassifier
from sklearn.metrics import roc_auc_score
FE=json.load(open("C:/Users/horii/rhc-quant/live/filter_cat.json"))["feats"]
df=pd.read_csv("arena_feats.csv").sort_values("decide").reset_index(drop=True)
X=df[FE].fillna(-1).values; y=df.win.values.astype(bool)
n=len(df); cut=int(0.6*n)
def uji(yy,nama):
    m=CatBoostClassifier(iterations=200,learning_rate=0.05,depth=4,l2_leaf_reg=5.0,random_seed=0,verbose=0,allow_writing_files=False)
    m.fit(X[:cut],yy[:cut])
    p=m.predict_proba(X[cut:])[:,1]
    return roc_auc_score(yy[cut:],p)
print("AUC label ASLI          : %.3f"%uji(y,"asli"))
rs=np.random.RandomState(0)
aucs=[uji(rs.permutation(y),"acak") for _ in range(5)]
print("AUC label DIACAK (5x)   : %s"%", ".join("%.3f"%a for a in aucs))
print("rata2 acak              : %.3f  <- harus ~0,50"%np.mean(aucs))
print()
# fitur mana yang paling berpengaruh? kalau ada fitur "aneh" yang dominan, curiga bocor
m=CatBoostClassifier(iterations=200,learning_rate=0.05,depth=4,l2_leaf_reg=5.0,random_seed=0,verbose=0,allow_writing_files=False)
m.fit(X[:cut],y[:cut])
imp=sorted(zip(FE,m.feature_importances_),key=lambda x:-x[1])[:8]
print("8 fitur paling berpengaruh:")
for f,v in imp: print("   %-16s %.1f%%"%(f,v))
