# Agent 11 - (b) kualitas 178 trade per margin skor (skor - ambang saat itu) dan per periode. pnl sudah termasuk gas (m1/m2);
# u_ds5d/u_ds24 di arena TIDAK dikoreksi gas (arena.js:6 hanya m1,m2) -> dihitung ulang di ar_gas.
import json,pandas as pd,numpy as np, os
os.chdir(os.path.dirname(os.path.abspath(__file__)))
pd.set_option('display.width',250); pd.set_option('display.max_columns',30)
T=pd.DataFrame(json.load(open('../../uji_maju_final/trade_final178_lengkap.json')))
D=pd.DataFrame(json.load(open('dec_base.json'))); B=D[D.why=='beli'][['pool','thr','score','pos']]
T=T.merge(B,on='pool'); T['margin']=T.score-T.thr; T['rpos']=T.pnl/T.pos
G=pd.DataFrame(json.load(open('ar_gas.json'))['closed'])[['pool','pnl','pos']].rename(columns={'pnl':'pnl_gas','pos':'pos_gas'})
T=T.merge(G,on='pool',how='left'); T['rgas']=T.pnl_gas/T.pos_gas
T['mq']=pd.qcut(T.margin.rank(method='first'),4,labels=['M1tipis','M2','M3','M4tebal'])
agg=dict(n=('pnl','size'),margin_max=('margin','max'),pnl=('pnl','sum'),r_mean=('rpos','mean'),r_med=('rpos','median'),rgas_mean=('rgas','mean'),win=('rpos',lambda s:(s>0).mean()))
print(T.groupby('mq').agg(**agg).round(3))
print(T.groupby(['ds','mq']).agg(n=('pnl','size'),pnl=('pnl','sum'),rgas=('rgas','mean')).round(3).unstack(1))
print('\nret bersih per trade (gas nyata) per periode:'); print(T.groupby('ds').agg(n=('pnl','size'),pnl_gas=('pnl_gas','sum'),rgas_mean=('rgas','mean'),rgas_med=('rgas','median'),pos_med=('pos_gas','median'),gas_share=('pos_gas',lambda s:(0.21/s).median())).round(3))
T.to_csv('c1_rows.csv',index=False)
