# Agent 13 - model + KONTROL label diacak yang benar (200 acakan) + selang kepercayaan bootstrap.
import pandas as pd, numpy as np, scipy.stats as ss
from sklearn.linear_model import LogisticRegression
rng = np.random.default_rng(13)
j = pd.read_csv('gab13.csv'); j['lama'] = j.ds.isin(['ags1','ags4','u_ds5d','u_ds24'])
m = pd.read_csv('mikro.csv')
new = [c for c in m.columns if c not in ('ds','pool','me_n_pos','me_conc','mt_first_sec')]
L = j[j.lama].reset_index(drop=True); B = j[~j.lama].reset_index(drop=True)
def auc(y,s):
    ok=~np.isnan(s); y=np.asarray(y)[ok]; s=s[ok]
    n1=int(y.sum()); n0=len(y)-n1
    if n1<3 or n0<3: return np.nan
    r=pd.Series(s).rank().values
    return (r[y==1].sum()-n1*(n1+1)/2)/(n1*n0)

print('--- arah lp_m1 per periode & ambang (AUC; >0.5 = pool BESAR lebih roket) ---')
for th in [3,5,10,25]:
    print('  >=%2dx  lama %.3f (n=%d)   bukti %.3f (n=%d)' % (th,
        auc((L.pk_price>=th).values.astype(int), L.lp_m1.values.astype(float)), int((L.pk_price>=th).sum()),
        auc((B.pk_price>=th).values.astype(int), B.lp_m1.values.astype(float)), int((B.pk_price>=th).sum())))

sc=[]
for f in new:
    if L[f].isna().mean()>0.25: continue
    a5=auc((L.pk_price>=5).values.astype(int),L[f].values.astype(float))
    a10=auc((L.pk_price>=10).values.astype(int),L[f].values.astype(float))
    if np.isnan(a5) or np.isnan(a10): continue
    sc.append((f,(abs(a5-.5)+abs(a10-.5))/2))
sc.sort(key=lambda x:-x[1]); pick=[]
for f,s in sc:
    if len(pick)>=8: break
    ok=True
    for g in pick:
        v1=L[f].values.astype(float); v2=L[g].values.astype(float); mm=~(np.isnan(v1)|np.isnan(v2))
        if mm.sum()>20 and abs(ss.spearmanr(v1[mm],v2[mm]).statistic)>0.80: ok=False; break
    if ok: pick.append(f)
print('\nFITUR A+ (dipilih di periode lama):',pick)

def prep(df,cols):
    X=df[cols].astype(float).copy()
    for c in cols: X[c]=X[c].rank(pct=True).fillna(0.5)
    return X.values
SETS={'A+mikro':pick,'lp_saja':['lp_m1'],'mikro+lp':pick+['lp_m1'],
      'bot_lama':['n_swap','n_buyers','lp_m1','buy_usd','kyle_lambda','top5','hhi','flow_lp']}
print('\n%-9s %-7s | %-22s | %-22s' % ('model','latih','AUC bukti (10x/25x)','KONTROL acak 10x med[2.5-97.5%]'))
out={}
for nm,cols in SETS.items():
    Xl=prep(L,cols); Xb=prep(B,cols)
    for tr in [5,10]:
        y=(L.pk_price>=tr).values.astype(int)
        p=LogisticRegression(C=0.5,max_iter=2000).fit(Xl,y).predict_proba(Xb)[:,1]
        out['%s_t%d'%(nm,tr)]=p
        a10=auc((B.pk_price>=10).values.astype(int),p); a25=auc((B.pk_price>=25).values.astype(int),p)
        ctl=[]
        for _ in range(200):
            ya=rng.permutation(y)
            pa=LogisticRegression(C=0.5,max_iter=2000).fit(Xl,ya).predict_proba(Xb)[:,1]
            ctl.append(auc((B.pk_price>=10).values.astype(int),pa))
        ctl=np.array(ctl)
        print('%-9s >=%2dx   |  %.3f / %.3f        |  %.3f [%.3f-%.3f]'%(nm,tr,a10,a25,np.median(ctl),np.percentile(ctl,2.5),np.percentile(ctl,97.5)))
B2=B.copy()
for k,v in out.items(): B2['p_'+k]=v
B2.to_csv('bukti_skor.csv',index=False)

print('\n=== PRESISI puncak skor, periode bukti n=%d (dasar: >=10x %.1f%%, >=25x %.1f%%) ==='%(
    len(B),(B.pk_price>=10).mean()*100,(B.pk_price>=25).mean()*100))
rows=[]
for k in out:
    for q in [0.01,0.02,0.05]:
        n=max(3,int(len(B)*q)); s=B2.nlargest(n,'p_'+k)
        k10=int((s.pk_price>=10).sum()); k25=int((s.pk_price>=25).sum())
        lo,hi=ss.beta.ppf([0.025,0.975],k10+0.5,n-k10+0.5)
        rows.append(dict(model=k,top='%d%%'%(q*100),n=n,n10=k10,pres10='%.1f%% [%.1f-%.1f]'%(100*k10/n,100*lo,100*hi),
                         n25=k25,rug=round((s.pk_val<0.5).mean()*100,1),ret_mean=round(s.ret.mean(),3),pkval_med=round(s.pk_val.median(),2)))
d=pd.DataFrame(rows); print(d.to_string(index=False)); d.to_csv('presisi_model.csv',index=False)
