# Hipotesis H1: data mentah fitur filter (swaps_m1.json, transfers.json) tidak berisi blok > init+600.
# Hipotesis H3b: file state_*.csv yang dipakai melatih model keluar W_i (termasuk horizon label +18000 blok)
#                selesai sebelum blok awal periode yang diuji dengan W_i.
import json, pandas as pd, numpy as np
ROOT = "../../.."
res = {}
for D in ["ags1", "ags4", "u_ds5d", "u_ds24", "m1", "m2"]:
    tr = [json.loads(l) for l in open(f"{ROOT}/data/{D}/trades.jsonl") if l.strip()]
    init = {t["pool"]: t["init"] for t in tr if t.get("plan") == "v4"}
    sw = json.load(open(f"{ROOT}/data/{D}/swaps_m1.json"))
    tf = json.load(open(f"{ROOT}/data/{D}/transfers.json"))
    sw_lebih = sum(1 for p, rows in sw.items() for r in rows if r[0] > init[p] + 600)
    sw_min = min((r[0] - init[p] for p, rows in sw.items() for r in rows), default=None)
    tf_lebih = sum(1 for p, v in tf.items() if p in init for r in v["tr"] if r[0] > init[p] + 600)
    tf_max = max((r[0] - init[p] for p, v in tf.items() if p in init for r in v["tr"]), default=None)
    res[D] = dict(swap_lewat_600=sw_lebih, swap_offset_min=sw_min, transfer_lewat_600=tf_lebih, transfer_offset_max=tf_max)
# model keluar walk-forward
P = [("ags1", 25872800, 26225599), ("ags4", 40834000, 41179599), ("ds5d", 55566162, 56218961),
     ("ds24", 59886162, 60750162), ("m1", 61866030, 63600000), ("m2", 64401245, 65698903)]
wf = {}
mx = {}
for nm, a, b in P:
    s = pd.read_csv(f"{ROOT}/data/state_{nm}.csv", usecols=["blk"])
    mx[nm] = int(s.blk.max()) + 18000   # blok terakhir yang disentuh label fmax30
for i in range(1, len(P)):
    note = json.load(open(f"{ROOT}/pipeline/wf_bahaya_W{i}.json"))["note"]
    dipakai = [nm for nm, _, _ in P[:i]]
    wf[f"W{i}->{P[i][0]}"] = dict(awal_uji=P[i][1], label_terakhir=max(mx[n] for n in dipakai),
                                  aman=max(mx[n] for n in dipakai) < P[i][1], note=note)
res["model_keluar"] = wf
print(json.dumps(res, indent=1))
json.dump(res, open("hasil_jendela.json", "w"), indent=1)
