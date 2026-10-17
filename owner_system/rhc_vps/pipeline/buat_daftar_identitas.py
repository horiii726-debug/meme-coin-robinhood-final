# Menyusun daftar pool prioritas untuk backfill identitas (Agent 17).
# Sumber: hasil/audit/kerja_12/label_puncak.csv (puncak harga), hasil/audit/kerja_15/t178_lp.csv (trade bot),
#         data/<ds>/pools.csv (alamat token). Tidak ada data yang ditimpa.
import csv, os, sys
ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
NATIVE = "0x0000000000000000000000000000000000000000"
DS = ["ags1", "ags4", "u_ds5d", "u_ds24", "m1", "m2"]

pools = {}          # (ds,pool) -> dict
for ds in DS:
    p = os.path.join(ROOT, "data", ds, "pools.csv")
    if not os.path.exists(p): continue
    with open(p) as f:
        for r in csv.DictReader(f):
            pid = r["pool_id"].lower()
            c0, c1 = r["c0"].lower(), r["c1"].lower()
            tok = c1 if c0 == NATIVE else (c0 if c1 == NATIVE else "")
            pools[(ds, pid)] = dict(ds=ds, pool=pid, init=int(r["init_block"]), token=tok,
                                    fee=r["fee"], hooks=r["hooks"].lower())

rows = {}
def tambah(ds, pid, grup, **kw):
    k = (ds, pid.lower())
    if k not in pools: return False
    if k not in rows:
        rows[k] = dict(pools[k]); rows[k]["grup"] = set(); rows[k]["pk_price"] = ""
        rows[k]["entry"] = ""; rows[k]["rug_blk"] = ""; rows[k]["ret"] = ""; rows[k]["pnl"] = ""
    rows[k]["grup"].add(grup)
    for a, b in kw.items():
        if b not in ("", None): rows[k][a] = b
    return True

# 1) roket: pk_price >= 10 dan >= 25
hilang = 0
with open(os.path.join(ROOT, "hasil/audit/kerja_12/label_puncak.csv")) as f:
    for r in csv.DictReader(f):
        pk = float(r["pk_price"])
        if pk >= 10:
            ok = tambah(r["ds"], r["pool"], "roket25" if pk >= 25 else "roket10",
                        pk_price=round(pk, 3), entry=int(float(r["entry"])))
            if pk >= 25 and ok: rows[(r["ds"], r["pool"].lower())]["grup"].add("roket10")
            if not ok: hilang += 1

# 2) trade bot: semua 178, tandai yang rug <= 3 menit (1800 blok sesudah entry)
with open(os.path.join(ROOT, "hasil/audit/kerja_15/t178_lp.csv")) as f:
    for r in csv.DictReader(f):
        entry = int(float(r["entry"])); rb = r["rug_blk"]
        grup = "beli"
        rugblk = ""
        if rb not in ("", "nan"):
            rugblk = int(float(rb))
            if rugblk - entry <= 1800: grup = "rug3"
        ok = tambah(r["ds"], r["pool"], grup, entry=entry, rug_blk=rugblk,
                    ret=r["ret"], pnl=r["pnl"])
        if ok and grup == "rug3": rows[(r["ds"], r["pool"].lower())]["grup"].add("beli")
        if not ok: hilang += 1

out = os.path.join(ROOT, "data", "identitas", "daftar.csv")
os.makedirs(os.path.dirname(out), exist_ok=True)
COLS = ["ds", "pool", "init", "token", "fee", "hooks", "grup", "pk_price", "entry", "rug_blk", "ret", "pnl"]
with open(out, "w", newline="") as f:
    w = csv.DictWriter(f, COLS, extrasaction="ignore")
    w.writeheader()
    for k in sorted(rows, key=lambda k: (rows[k]["ds"], rows[k]["init"])):
        r = dict(rows[k]); r["grup"] = "|".join(sorted(r["grup"]))
        w.writerow(r)
n = len(rows)
g = {}
for r in rows.values():
    for x in r["grup"]: g[x] = g.get(x, 0) + 1
print("pool total:", n, "| per grup:", g, "| tidak ketemu di pools.csv:", hilang)
print("tanpa alamat token:", sum(1 for r in rows.values() if not r["token"]))
print("->", out)
