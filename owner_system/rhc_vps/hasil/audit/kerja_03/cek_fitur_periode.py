# Hipotesis H4: kalau 34 fitur dipilih dengan melihat label m1/m2, fitur "tambahan" (holder/graf/impact)
# akan jauh lebih kuat di m1+m2 daripada di periode awal. Ukur |AUC-0,5| univariat per kelompok periode.
import json, numpy as np, pandas as pd
from sklearn.metrics import roc_auc_score
ROOT = "../../.."
FE = json.load(open(f"{ROOT}/bot/filter_cat.json"))["feats"]
df = pd.read_csv(f"{ROOT}/data/arena_feats.csv")
awal = df.ds.isin(["ags1", "ags4", "u_ds5d", "u_ds24"]); akhir = df.ds.isin(["m1", "m2"])
rows = []
for f in FE:
    x = df[f].fillna(-1)
    a1 = roc_auc_score(df.win[awal], x[awal]); a2 = roc_auc_score(df.win[akhir], x[akhir])
    rows.append((f, round(a1, 3), round(a2, 3), round(abs(a1 - .5), 3), round(abs(a2 - .5), 3)))
t = pd.DataFrame(rows, columns=["fitur", "auc_awal", "auc_m1m2", "kuat_awal", "kuat_m1m2"])
t["tanda_sama"] = np.sign(t.auc_awal - .5) == np.sign(t.auc_m1m2 - .5)
print(t.to_string(index=False))
print("n awal", int(awal.sum()), "n m1m2", int(akhir.sum()))
print("rata2 kekuatan awal %.3f | m1m2 %.3f | tanda sama %d/%d" % (t.kuat_awal.mean(), t.kuat_m1m2.mean(), t.tanda_sama.sum(), len(t)))
t.to_csv("fitur_per_periode.csv", index=False)
