# Agent 13 - model "setup A+": 8 fitur mikro dipilih DI PERIODE LAMA, dibuktikan di m1+m2.
import pandas as pd, numpy as np, json, sys, scipy.stats as ss
from sklearn.linear_model import LogisticRegression
rng = np.random.default_rng(13)
j = pd.read_csv('gab13.csv'); j['lama'] = j.ds.isin(['ags1','ags4','u_ds5d','u_ds24'])
m = pd.read_csv('mikro.csv')
new = [c for c in m.columns if c not in ('ds','pool','me_n_pos','me_conc','mt_first_sec')]
L = j[j.lama].reset_index(drop=True); B = j[~j.lama].reset_index(drop=True)

def auc(y, s):
    ok = ~np.isnan(s); y = np.asarray(y)[ok]; s = s[ok]
    n1 = int(y.sum()); n0 = len(y)-n1
    if n1 < 3 or n0 < 3: return np.nan
    r = pd.Series(s).rank().values
    return (r[y==1].sum()-n1*(n1+1)/2)/(n1*n0)

# ---- seleksi HANYA dari periode lama ----
sc = []
for f in new:
    if L[f].isna().mean() > 0.25: continue
    a5 = auc((L.pk_price>=5).values.astype(int), L[f].values.astype(float))
    a10 = auc((L.pk_price>=10).values.astype(int), L[f].values.astype(float))
    if np.isnan(a5) or np.isnan(a10): continue
    sc.append((f, (abs(a5-.5)+abs(a10-.5))/2))
sc.sort(key=lambda x: -x[1])
pick = []
for f, s in sc:
    if len(pick) >= 8: break
    ok = True
    for g in pick:
        v1 = L[f].values.astype(float); v2 = L[g].values.astype(float)
        mm = ~(np.isnan(v1)|np.isnan(v2))
        if mm.sum() > 20 and abs(ss.spearmanr(v1[mm], v2[mm]).statistic) > 0.80: ok = False; break
    if ok: pick.append(f)
print('FITUR TERPILIH (dari periode lama):', pick)

def prep(df, cols):
    X = df[cols].astype(float).copy()
    for c in cols: X[c] = X[c].rank(pct=True).fillna(0.5)
    return X.values

SETS = {'A+mikro': pick, 'lp_saja': ['lp_m1'], 'mikro+lp': pick+['lp_m1'],
        'bot_lama': ['n_swap','n_buyers','lp_m1','buy_usd','kyle_lambda','top5','hhi','flow_lp']}
res = {}
for nm, cols in SETS.items():
    Xl = prep(L, cols); Xb = prep(B, cols)
    for tr_th in [5]:
        y = (L.pk_price >= tr_th).values.astype(int)
        mdl = LogisticRegression(C=0.5, max_iter=2000).fit(Xl, y)
        p = mdl.predict_proba(Xb)[:,1]
        res[nm] = p
        line = '%-10s latih>=%dx |' % (nm, tr_th)
        for th in [5,10,25]:
            line += ' AUC%dx %.3f' % (th, auc((B.pk_price>=th).values.astype(int), p))
        # kontrol label diacak
        ya = rng.permutation(y)
        pa = LogisticRegression(C=0.5, max_iter=2000).fit(Xl, ya).predict_proba(Xb)[:,1]
        line += ' | KONTROL acak AUC10x %.3f' % auc((B.pk_price>=10).values.astype(int), pa)
        print(line)

B2 = B.copy()
for nm, p in res.items(): B2['p_'+nm] = p
B2.to_csv('bukti_skor.csv', index=False)

# ---- presisi di puncak skor ----
print('\n=== PRESISI di periode bukti (m1+m2, n=%d) ===' % len(B))
base = {th: float((B.pk_price>=th).mean()) for th in [5,10,25]}
print('dasar (semua koin): >=5x %.1f%%  >=10x %.1f%%  >=25x %.1f%%  | rug(pk_val<0.5) %.1f%%  ret rata2 %.3f  ret median %.3f'
      % (base[5]*100, base[10]*100, base[25]*100, (B.pk_val<0.5).mean()*100, B.ret.mean(), B.ret.median()))
rows=[]
for nm in res:
    for q in [0.01,0.02,0.05]:
        k = max(3,int(len(B)*q)); s = B2.nlargest(k,'p_'+nm)
        rows.append(dict(model=nm, top='%d%%'%(q*100), n=k,
            p5=round((s.pk_price>=5).mean()*100,1), p10=round((s.pk_price>=10).mean()*100,1),
            p25=round((s.pk_price>=25).mean()*100,1), rug=round((s.pk_val<0.5).mean()*100,1),
            ret_mean=round(s.ret.mean(),3), ret_med=round(s.ret.median(),3), pkval_med=round(s.pk_val.median(),2)))
d=pd.DataFrame(rows); print(d.to_string(index=False)); d.to_csv('presisi_model.csv',index=False)
