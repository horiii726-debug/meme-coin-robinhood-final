import pandas as pd, numpy as np, sys
rng=np.random.default_rng(13)
g=pd.read_csv(sys.argv[1] if len(sys.argv)>1 else r'../kerja_12/gabung.csv').copy()
g['lama']=g.ds.isin(['ags1','ags4','u_ds5d','u_ds24'])
skip={'ds','pool','init','decide','entry','exit','ret','win','jual_m1','pk_price','pk_val','pk_blk','pkv_blk','hz_penuh','dev'}
feats=[c for c in g.columns if c not in skip and pd.api.types.is_numeric_dtype(g[c])]
def auc(y,s):
    m=~np.isnan(s)
    y=y[m]; s=s[m]
    if y.sum()<3 or (~y.astype(bool)).sum()<3: return np.nan,0
    r=pd.Series(s).rank().values
    n1=y.sum(); n0=len(y)-n1
    return (r[y==1].sum()-n1*(n1+1)/2)/(n1*n0), int(n1)
rows=[]
for th in [10,25]:
    for f in feats:
        a_l,n_l=auc((g.pk_price[g.lama]>=th).values.astype(int), g[f][g.lama].values.astype(float))
        a_b,n_b=auc((g.pk_price[~g.lama]>=th).values.astype(int), g[f][~g.lama].values.astype(float))
        # permutasi di periode bukti utk p-value satu-sisi dua-arah
        if not np.isnan(a_b):
            y=(g.pk_price[~g.lama]>=th).values.astype(int); s=g[f][~g.lama].values.astype(float)
            m=~np.isnan(s); y2=y[m]; s2=s[m]
            r=pd.Series(s2).rank().values
            n1=int(y2.sum()); n0=len(y2)-n1
            idx=np.argsort(np.argsort(rng.random((4000,len(y2))),axis=1),axis=1)
            sel=idx<n1
            null=((r*sel).sum(1)-n1*(n1+1)/2)/(n1*n0)
            p=float(np.mean(np.abs(null-0.5)>=abs(a_b-0.5)))
        else: p=np.nan
        rows.append(dict(th=th,feat=f,auc_lama=a_l,auc_bukti=a_b,n_lama=n_l,n_bukti=n_b,p_bukti=p,
                         sama_arah=int(not np.isnan(a_l) and not np.isnan(a_b) and (a_l-0.5)*(a_b-0.5)>0)))
d=pd.DataFrame(rows)
d['kuat']=np.minimum(abs(d.auc_lama-0.5),abs(d.auc_bukti-0.5))*d.sama_arah
d.sort_values(['th','kuat'],ascending=[True,False]).to_csv('karakter_auc.csv',index=False)
for th in [10,25]:
    print('=== label >=%dx ==='%th)
    print(d[d.th==th].sort_values('kuat',ascending=False).head(14)[['feat','auc_lama','auc_bukti','p_bukti','sama_arah']].to_string(index=False))
