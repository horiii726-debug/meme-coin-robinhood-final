# Agent 13 - aturan "sidik jari" sederhana: ambang dipilih DI PERIODE LAMA, dibuktikan di m1+m2.
import pandas as pd, numpy as np, itertools, scipy.stats as ss
j=pd.read_csv('gab13.csv'); j['lama']=j.ds.isin(['ags1','ags4','u_ds5d','u_ds24'])
L=j[j.lama]; B=j[~j.lama]

print('=== PROFIL KOIN EKSTREM vs SISANYA (semua 2558 koin, angka nyata) ===')
cols=['lp_m1','n_swap','n_buyers','n_sell','mz_med_buy','mz_tot_buy','mf_dom_buyer','mf_repeat_frac',
      'mt_first_gap','mt_gap_med','mi_buy','me_tick_per_usd','md_pool_bought','me_full','mg_sell_n','mg_first_sell']
grp={'>=25x (n=%d)'%int((j.pk_price>=25).sum()):j[j.pk_price>=25],
     '10-25x (n=%d)'%int(((j.pk_price>=10)&(j.pk_price<25)).sum()):j[(j.pk_price>=10)&(j.pk_price<25)],
     '3-10x (n=%d)'%int(((j.pk_price>=3)&(j.pk_price<10)).sum()):j[(j.pk_price>=3)&(j.pk_price<10)],
     '<3x (n=%d)'%int((j.pk_price<3).sum()):j[j.pk_price<3]}
t=pd.DataFrame({k:v[cols].median() for k,v in grp.items()})
print(t.round(4).to_string())
print('\nuji Mann-Whitney >=25x vs <3x (p, tanpa koreksi banyak-uji):')
for c in cols:
    a=j[j.pk_price>=25][c].dropna(); b=j[j.pk_price<3][c].dropna()
    if len(a)>4 and len(b)>4:
        p=ss.mannwhitneyu(a,b).pvalue
        print('  %-17s p=%.4f %s'%(c,p,'*' if p<0.05/len(cols) else ''))

# ---- cari aturan sederhana di LAMA, uji di BUKTI ----
print('\n=== CARI ATURAN DI PERIODE LAMA, BUKTIKAN DI m1+m2 ===')
lpq=[np.nanpercentile(L.lp_m1,q) for q in [10,20,30,50]]
nsq=[np.nanpercentile(L.n_swap,q) for q in [20,30,50,70]]
nbq=[np.nanpercentile(L.n_buyers,q) for q in [20,30,50,70]]
best=None
for lp,ns,nb in itertools.product(lpq,nsq,nbq):
    mL=(L.lp_m1<lp)&(L.n_swap<ns)&(L.n_buyers<nb)
    if mL.sum()<15: continue
    lift=(L.pk_price[mL]>=10).mean()/max((L.pk_price>=10).mean(),1e-9)
    if best is None or lift>best[0]: best=(lift,lp,ns,nb,int(mL.sum()))
lift,lp,ns,nb,nL=best
print('aturan terpilih di LAMA: lp_m1<$%.0f DAN n_swap<%.0f DAN n_buyers<%.0f  (kena %d/%d koin, lift %.2fx)'%(lp,ns,nb,nL,len(L),lift))
for nm,D in [('LAMA (pilih)',L),('BUKTI m1+m2',B)]:
    m=(D.lp_m1<lp)&(D.n_swap<ns)&(D.n_buyers<nb)
    n=int(m.sum())
    if n==0: print('  %s: 0 koin'); continue
    k10=int((D.pk_price[m]>=10).sum()); k25=int((D.pk_price[m]>=25).sum())
    lo,hi=ss.beta.ppf([0.025,0.975],k10+0.5,n-k10+0.5)
    lo25,hi25=ss.beta.ppf([0.025,0.975],k25+0.5,n-k25+0.5)
    print('  %-12s kena %4d koin (%.1f%% dari semua) | >=10x %d (%.1f%% [%.1f-%.1f], dasar %.1f%%) | >=25x %d (%.1f%% [%.1f-%.1f], dasar %.1f%%) | rug %.1f%% | ret rata2 %.3f median %.3f'
          %(nm,n,100*n/len(D),k10,100*k10/n,100*lo,100*hi,100*(D.pk_price>=10).mean(),
            k25,100*k25/n,100*lo25,100*hi25,100*(D.pk_price>=25).mean(),
            100*(D.pk_val[m]<0.5).mean(),D.ret[m].mean(),D.ret[m].median()))
    print('               cakupan: dari %d koin >=10x di periode ini, tertangkap %d (%.0f%%)'
          %(int((D.pk_price>=10).sum()),k10,100*k10/max(int((D.pk_price>=10).sum()),1)))
B2=B.copy(); B2['aturan']=((B.lp_m1<lp)&(B.n_swap<ns)&(B.n_buyers<nb)).astype(int)
B2.to_csv('bukti_aturan.csv',index=False)
print('\nambang dipakai: LP=%.2f NSWAP=%.2f NBUY=%.2f'%(lp,ns,nb))
