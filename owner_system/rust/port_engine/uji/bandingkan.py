"""Pembanding trades.jsonl JS vs Rust, field per field.

Pakai: python bandingkan.py <acuan_js.jsonl> <hasil_rust.jsonl> [label]

Aturan (sesuai tugas):
- jumlah baris dan urutan baris harus sama;
- urutan & nama field harus sama;
- field diskrit (plan, pool, init, entryBlk, exitBlk, reason, tp1, tp1Blk, txs, fails) harus PERSIS sama;
- field float boleh beda paling banyak 1e-9 relatif (dilaporkan juga selisih maksimum nyata);
- dilaporkan juga berapa baris yang identik byte-demi-byte.
Exit code 0 = lolos, 1 = gagal.
"""
import json
import sys

DISKRIT = {"plan", "pool", "init", "entryBlk", "exitBlk", "reason", "tp1", "tp1Blk", "txs", "fails"}
TOL = 1e-9


def muat(path):
    with open(path, "r", encoding="utf-8") as f:
        raw = [ln.rstrip("\n") for ln in f if ln.strip()]
    return raw, [json.loads(ln) for ln in raw]


def rel(a, b):
    if a == b:
        return 0.0
    d = abs(a - b)
    s = max(abs(a), abs(b))
    return d / s if s > 0 else d


def main():
    a_path, b_path = sys.argv[1], sys.argv[2]
    label = sys.argv[3] if len(sys.argv) > 3 else ""
    ra, ja = muat(a_path)
    rb, jb = muat(b_path)
    masalah = []
    if len(ja) != len(jb):
        masalah.append(f"jumlah baris beda: JS {len(ja)} vs Rust {len(jb)}")
    n = min(len(ja), len(jb))
    byte_sama = sum(1 for i in range(n) if ra[i] == rb[i])
    maks = {}
    n_field = 0
    baris_ok = 0
    for i in range(n):
        x, y = ja[i], jb[i]
        ok = True
        if list(x.keys()) != list(y.keys()):
            masalah.append(f"baris {i+1}: urutan/nama field beda {list(x.keys())} vs {list(y.keys())}")
            ok = False
        for k in x.keys():
            if k not in y:
                continue
            n_field += 1
            va, vb = x[k], y[k]
            if k in DISKRIT or isinstance(va, (str, bool)) or va is None or vb is None:
                if va != vb or type(va) != type(vb) and not (isinstance(va, (int, float)) and isinstance(vb, (int, float))):
                    masalah.append(f"baris {i+1} ({x.get('plan')} {x.get('pool','')[:12]}): field DISKRIT {k} beda: JS {va!r} vs Rust {vb!r}")
                    ok = False
                continue
            r = rel(float(va), float(vb))
            if r > maks.get(k, 0.0):
                maks[k] = r
            if r > TOL:
                masalah.append(f"baris {i+1} ({x.get('plan')} {x.get('pool','')[:12]}): field {k} beda rel {r:.3e}: JS {va!r} vs Rust {vb!r}")
                ok = False
        if ok:
            baris_ok += 1
    maks_all = max(maks.values()) if maks else 0.0
    print(f"[{label}] baris JS={len(ja)} Rust={len(jb)} | baris sama (toleransi) {baris_ok}/{n} | "
          f"identik byte {byte_sama}/{n} | field dibandingkan {n_field} | selisih rel maks {maks_all:.3e}")
    if maks:
        print("  selisih rel maks per field: " + ", ".join(f"{k}={v:.2e}" for k, v in sorted(maks.items())))
    for m in masalah[:30]:
        print("  BEDA:", m)
    if len(masalah) > 30:
        print(f"  ... dan {len(masalah) - 30} perbedaan lain")
    lolos = not masalah
    print(f"  HASIL: {'LOLOS' if lolos else 'GAGAL'}")
    sys.exit(0 if lolos else 1)


if __name__ == "__main__":
    main()
