import json, numpy as np, pandas as pd
T = pd.DataFrame(json.load(open("trade_final178.json")))
F = pd.read_csv("arena_feats.csv")[["pool","fee","lp_m1","n_swap"]]
d = T.merge(F, on="pool", how="left")
d["fee_pct"] = d.fee/1e6*100                      # fee tier pool (1e6 = 100%)
# Cadangan quote di pool = lpUsd/2 (likuiditas virtual v4). Beli x menggeser harga: rugi ~ x/Rq = 2x/lp
d["slip_beli"] = 2*d.pos/d.lp*100
d["slip_jual"] = 2*d.pos/d.lp*100                 # sisi jual serupa saat keluar
d["gas_pct"]   = d.gasTot/d.pos*100
d["fee_total"] = d.fee_pct*2                      # fee dibayar saat beli DAN jual
d["biaya_total"] = d.slip_beli + d.slip_jual + d.fee_total + d.gas_pct
q = lambda c,p: np.percentile(d[c].dropna(), p)
print("BIAYA DI TITIK ENTRY (178 trade nyata)\n")
print(f"{'':28} {'median':>9} {'rata2':>9} {'terburuk':>9}")
for nm,c in [("Slippage beli","slip_beli"),("Slippage jual","slip_jual"),("Fee pool (beli+jual)","fee_total"),
             ("Gas (% posisi)","gas_pct"),("TOTAL biaya bolak-balik","biaya_total")]:
    print(f"{nm:28} {q(c,50):8.2f}% {d[c].mean():8.2f}% {q(c,95):8.2f}%")
print()
print(f"posisi median ${d.pos.median():,.2f} | likuiditas pool median ${d.lp.median():,.0f} | posisi = {100*(d.pos/d.lp).median():.2f}% likuiditas")
print(f"ukuran yang disimulasikan mesin: median ${d['size'].median():,.0f} (mesin pakai min($200, 1% LP))")
beda = d[d.pos > d['size']*1.05]
print(f"posisi akun LEBIH BESAR dari yang disimulasikan mesin: {len(beda)} dari {len(d)} trade")
if len(beda):
    ekstra=(200*(beda.pos-beda["size"])/beda.lp).median()
    print(f"  -> dampak harga tambahan yang belum dihitung mesin: median {ekstra:.2f}% per trade (sudah dipotong lewat haircut arena)")
print()
print(f"untung kotor rata-rata per trade : {100*(d.ret.mean()-1):+.1f}%")
print(f"biaya bolak-balik rata-rata      : -{d.biaya_total.mean():.1f}%")
print(f"sisa bersih                      : {100*(d.ret.mean()-1)-d.biaya_total.mean():+.1f}%")
print()
print("FEE TIER pool yang dibeli:")
for f,g in d.groupby("fee"):
    print(f"  {f/1e4:.2f}% : {len(g):3d} trade | untung rata2 {100*(g.ret.mean()-1):+6.1f}% | slippage beli {g.slip_beli.mean():.2f}%")
