# Agent 11 - (5c) AUC univariat fitur tekanan beli/jual SELAMA posisi terbuka, per periode (tanpa model, tanpa penyetelan).
import numpy as np, pandas as pd, os
from sklearn.metrics import roc_auc_score
os.chdir(os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..", ".."))
rows = []
for p in ["ds5d", "ds24", "m1", "m2"]:
    d = pd.read_csv(f"data/state_{p}.csv")
    d["sratio60"] = d.s60 / np.maximum(d.b60 + d.s60, 1); d["sratio300"] = d.s300 / np.maximum(d.b300 + d.s300, 1)
    d["su_bu300"] = d.su300 / np.maximum(d.bu300, 1)
    yb = ((d.f5 <= 0.7) | (d.rug10 == 1)).astype(int); yn = (d.fmax30 >= 1.5).astype(int)
    for nm, y in [("bahaya", yb), ("naik", yn)]:
        for f in ["net60_lp", "sratio60", "sratio300", "su_bu300", "maxsell60_lp", "sell_surge", "s60", "b60", "dd", "lpeak", "ret60", "lp_vs_entry"]:
            v = d[f].replace([np.inf, -np.inf], np.nan).fillna(-1).values
            rows.append(dict(per=p, label=nm, fitur=f, auc=roc_auc_score(y, v), n=len(d), rate=y.mean()))
U = pd.DataFrame(rows); U.to_csv("hasil/audit/kerja_11/b5_univariat.csv", index=False)
pd.set_option("display.width", 250)
print(U.pivot_table(index=["label", "fitur"], columns="per", values="auc").round(3))
print(U.groupby(["per", "label"]).rate.first().round(3))
