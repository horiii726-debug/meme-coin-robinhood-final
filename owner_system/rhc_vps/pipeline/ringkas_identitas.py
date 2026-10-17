"""Ringkasan identitas per pool dari hasil backfill_id.js (Agent 17).

Masukan  : data/identitas/{liq,swap,tr,nft}/<pool>.csv  + data/identitas/daftar.csv
Keluaran : data/identitas/ringkas_pool.csv    (1 baris per pool)
           data/identitas/lp_pemilik.csv      (1 baris per pool x pemilik posisi LP)
           data/identitas/penjual.csv         (1 baris per pool x penjual nyata, 20 terbesar)

Aturan: hanya data on-chain nyata. Kolom yang tidak bisa dihitung ditulis KOSONG
(bukan 0), artinya "tidak ada data". Tidak ada model, tidak ada klaim strategi.

Cara alamat NYATA ditentukan (didokumentasikan, bukan tebakan):
  * `sender` pada Swap = KONTRAK ROUTER, bukan pedagang. Pedagang nyata dicari dari
    Transfer token di tx yang sama: alamat terakhir yang menerima token (beli) atau
    alamat pertama yang mengirim token (jual), di luar daftar infrastruktur
    (PoolManager, semua router yang terlihat, semua position manager, alamat nol).
  * `sender` pada ModifyLiquidity = KONTRAK PositionManager. Pemilik nyata posisi =
    pemegang NFT ERC-721 dengan tokenId = `salt` di kontrak itu (berkas nft/).
    Kalau salt = 0 (posisi dipegang kontrak itu sendiri) -> pemilik = sender.
"""
import csv, json, os, sys
from collections import defaultdict

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
IDD = os.environ.get("OUT", os.path.join(ROOT, "data", "identitas"))
NATIVE = "0x0000000000000000000000000000000000000000"
PM = "0x8366a39cc670b4001a1121b8f6a443a643e40951"
BLOK_PER_MENIT = 600.0          # blok 0,1 detik
DS = ["ags1", "ags4", "u_ds5d", "u_ds24", "m1", "m2"]


def baca(p):
    if not os.path.exists(p):
        return []
    with open(p, newline="") as f:
        return list(csv.DictReader(f))


# --- metadata pool (urutan currency0/currency1 menentukan mana token, mana quote) ---
meta = {}
for ds in DS:
    p = os.path.join(ROOT, "data", ds, "pools.csv")
    if not os.path.exists(p):
        continue
    for r in baca(p):
        meta[r["pool_id"].lower()] = dict(c0=r["c0"].lower(), c1=r["c1"].lower(), ds=ds,
                                          init=int(r["init_block"]))

daftar = {r["pool"].lower(): r for r in baca(os.path.join(IDD, "daftar.csv"))}


def pemilik_pada(nft_idx, manager, token_id, blk, li):
    """Pemegang NFT posisi pada saat (blk, li); None kalau tidak ada jejak."""
    lst = nft_idx.get((manager, token_id))
    if not lst:
        return None
    own = None
    for (b, l, fr, to) in lst:
        if (b, l) <= (blk, li):
            own = to
        else:
            break
    return own if own is not None else lst[0][3]   # sebelum mint -> pakai pemilik pertama


def ringkas_pool(pool):
    m = meta.get(pool)
    if not m:
        return None
    liq = baca(os.path.join(IDD, "liq", pool + ".csv"))
    sw = baca(os.path.join(IDD, "swap", pool + ".csv"))
    tr = baca(os.path.join(IDD, "tr", pool + ".csv"))
    nft = baca(os.path.join(IDD, "nft", pool + ".csv"))
    if not liq and not sw:
        return None
    init = m["init"]
    q_is_c1 = (m["c1"] == NATIVE)          # True: token = currency0, quote = currency1

    # ---------- indeks NFT posisi ----------
    nft_idx = defaultdict(list)
    for r in nft:
        nft_idx[(r["manager"], r["token_id"])].append(
            (int(r["block"]), int(r["log_idx"]), r["from"], r["to"]))
    for k in nft_idx:
        nft_idx[k].sort()

    # ---------- sisi likuiditas ----------
    infra = {PM, NATIVE}
    tambah = defaultdict(int)     # pemilik -> likuiditas ditambah
    tarik = defaultdict(int)      # pemilik -> likuiditas ditarik (positif)
    pos_set = set()
    cum = 0
    puncak = 0
    rug_blk = ""
    tambah_pertama = ""
    tarik_terakhir = ""
    pemilik_akhir = {}
    for r in liq:
        blk, li = int(r["block"]), int(r["log_idx"])
        d = int(r["liq_delta"])
        sender, salt = r["sender"], r["salt"]
        infra.add(sender)
        pos_set.add((sender, salt))
        own = pemilik_pada(nft_idx, sender, salt, blk, li)
        if own is None:
            own = sender if int(salt, 16) == 0 else "manager:" + sender
        if d > 0:
            tambah[own] += d
            if tambah_pertama == "":
                tambah_pertama = blk
        elif d < 0:
            tarik[own] += -d
            tarik_terakhir = blk
        cum += d
        if cum > puncak:
            puncak = cum
        if puncak > 0 and rug_blk == "" and cum <= 0.2 * puncak:
            rug_blk = blk
    for (man, tid), lst in nft_idx.items():
        pemilik_akhir[(man, tid)] = lst[-1][3]
    # posisi terbesar (menurut likuiditas yang ditambahkan) + siapa pemegangnya SEKARANG
    besar = {}
    for r in liq:
        d = int(r["liq_delta"])
        if d > 0:
            besar[(r["sender"], r["salt"])] = besar.get((r["sender"], r["salt"]), 0) + d
    pos_top = max(besar, key=besar.get) if besar else None
    pemilik_akhir_top = pemilik_akhir.get(pos_top, "") if pos_top else ""
    if pos_top and not pemilik_akhir_top and int(pos_top[1], 16) == 0:
        pemilik_akhir_top = pos_top[0]

    tot_tambah = sum(tambah.values())
    tot_tarik = sum(tarik.values())
    pemilik_lp = sorted(tambah.items(), key=lambda kv: -kv[1])
    n_pemilik = len(set(list(tambah) + list(tarik)))
    top1_frac = (pemilik_lp[0][1] / tot_tambah) if tot_tambah else ""
    # porsi likuiditas yang ditarik oleh alamat yang juga menambah
    tarik_oleh_penambah = sum(v for k, v in tarik.items() if k in tambah)
    frac_tarik_sama = (tarik_oleh_penambah / tot_tarik) if tot_tarik else ""
    # NFT posisi yang pindah tangan / dibakar sesudah mint
    n_pindah = sum(max(0, len(v) - 1) for v in nft_idx.values())
    n_bakar = sum(1 for v in nft_idx.values() if v[-1][3] == NATIVE)

    # ---------- sisi swap: pedagang nyata ----------
    for r in sw:
        infra.add(r["sender"])
    tr_by_tx = defaultdict(list)
    for r in tr:
        tr_by_tx[r["tx_hash"]].append((int(r["block"]), int(r["log_idx"]), r["from"], r["to"], int(r["value"])))
    for k in tr_by_tx:
        tr_by_tx[k].sort()

    def pedagang(txh, beli):
        lst = tr_by_tx.get(txh)
        if not lst:
            return ""
        if beli:                                  # token keluar pool -> penerima terakhir di luar infra
            for (_b, _l, fr, to, _v) in reversed(lst):
                if to not in infra:
                    return to
        else:                                     # token masuk pool -> pengirim pertama di luar infra
            for (_b, _l, fr, to, _v) in lst:
                if fr not in infra:
                    return fr
        return ""

    beli_urut, jual_urut = [], []
    jual_usd = defaultdict(float)     # penjual -> volume quote (wei)
    harga = []
    for r in sw:
        a0, a1 = int(r["a0"]), int(r["a1"])
        tok = a0 if q_is_c1 else a1
        quo = a1 if q_is_c1 else a0
        if tok == 0 or quo == 0:
            continue
        blk, li = int(r["block"]), int(r["log_idx"])
        harga.append((blk, li, abs(quo) / abs(tok)))
        beli = tok > 0
        who = pedagang(r["tx_hash"], beli)
        if not who:
            continue
        if beli:
            beli_urut.append((blk, li, who, abs(quo)))
        else:
            jual_urut.append((blk, li, who, abs(quo)))
            jual_usd[who] += abs(quo)

    n_router = len({r["sender"] for r in sw})
    n_pembeli = len({x[2] for x in beli_urut})
    n_penjual = len({x[2] for x in jual_urut})
    tot_jual = sum(jual_usd.values())
    pembeli1 = beli_urut[0][2] if beli_urut else ""
    # apakah pembeli pertama menjual duluan?
    jual_pertama_per_alamat = {}
    for (blk, li, who, v) in jual_urut:
        jual_pertama_per_alamat.setdefault(who, (blk, li))
    urut_penjual = sorted(jual_pertama_per_alamat.items(), key=lambda kv: kv[1])
    if pembeli1 and pembeli1 in jual_pertama_per_alamat:
        peringkat1 = [k for k, _ in urut_penjual].index(pembeli1) + 1
        p1_jual_duluan = 1 if peringkat1 == 1 else 0
        p1_jual_blk = jual_pertama_per_alamat[pembeli1][0]
    else:
        peringkat1, p1_jual_duluan, p1_jual_blk = "", 0 if jual_urut else "", ""

    # fase turun: setelah harga puncak
    puncak_blk = ""
    jual_turun = defaultdict(float)
    if harga:
        hmax = max(harga, key=lambda x: x[2])
        puncak_blk = hmax[0]
        for (blk, li, who, v) in jual_urut:
            if (blk, li) >= (hmax[0], hmax[1]):
                jual_turun[who] += v
    tot_turun = sum(jual_turun.values())
    top_turun = sorted(jual_turun.items(), key=lambda kv: -kv[1])
    penjual_turun1 = top_turun[0][0] if top_turun else ""
    frac_turun1 = (top_turun[0][1] / tot_turun) if tot_turun else ""
    top_jual = sorted(jual_usd.items(), key=lambda kv: -kv[1])
    frac_jual1 = (top_jual[0][1] / tot_jual) if tot_jual else ""

    d = daftar.get(pool, {})
    baris = dict(
        pool=pool, ds=m["ds"], grup=d.get("grup", ""), init=init,
        pk_price=d.get("pk_price", ""), entry=d.get("entry", ""), ret=d.get("ret", ""), pnl=d.get("pnl", ""),
        n_mod=len(liq), n_swap=len(sw), n_transfer=len(tr), n_nft=len(nft),
        n_posisi=len(pos_set), n_pemilik_lp=n_pemilik,
        lp_top1_porsi=round(top1_frac, 4) if top1_frac != "" else "",
        lp_pemilik_top1=pemilik_lp[0][0] if pemilik_lp else "",
        lp_tambah_total=tot_tambah, lp_tarik_total=tot_tarik,
        lp_tarik_oleh_penambah=round(frac_tarik_sama, 4) if frac_tarik_sama != "" else "",
        lp_penambah_eq_penarik=(1 if (frac_tarik_sama != "" and frac_tarik_sama >= 0.99) else (0 if frac_tarik_sama != "" else "")),
        lp_pemilik_akhir_top1=pemilik_akhir_top,
        lp_nft_pindah=n_pindah, lp_nft_dibakar=n_bakar,
        lp_tambah_pertama_blk=tambah_pertama, lp_tarik_terakhir_blk=tarik_terakhir,
        lp_rug_blk=rug_blk,
        lp_rug_menit=round((rug_blk - init) / BLOK_PER_MENIT, 2) if rug_blk != "" else "",
        n_router=n_router, n_pembeli_nyata=n_pembeli, n_penjual_nyata=n_penjual,
        pembeli_pertama=pembeli1, pembeli1_peringkat_jual=peringkat1,
        pembeli1_jual_duluan=p1_jual_duluan, pembeli1_jual_blk=p1_jual_blk,
        harga_puncak_blk=puncak_blk,
        penjual_terbesar_saat_turun=penjual_turun1,
        porsi_jual_turun_top1=round(frac_turun1, 4) if frac_turun1 != "" else "",
        porsi_jual_total_top1=round(frac_jual1, 4) if frac_jual1 != "" else "",
    )
    det_lp = [dict(pool=pool, pemilik=k, ditambah=tambah.get(k, 0), ditarik=tarik.get(k, 0),
                   porsi_tambah=round(tambah.get(k, 0) / tot_tambah, 4) if tot_tambah else "")
              for k in sorted(set(list(tambah) + list(tarik)), key=lambda k: -tambah.get(k, 0))]
    det_jual = [dict(pool=pool, penjual=k, jual_quote_wei=int(v),
                     porsi_jual=round(v / tot_jual, 4) if tot_jual else "",
                     jual_saat_turun_wei=int(jual_turun.get(k, 0)),
                     blk_jual_pertama=jual_pertama_per_alamat.get(k, ("", ""))[0])
                for k, v in top_jual[:20]]
    return baris, det_lp, det_jual


def main():
    pools = sorted(f[:-4] for f in os.listdir(os.path.join(IDD, "liq")) if f.endswith(".csv"))
    rows, lps, jls = [], [], []
    for p in pools:
        try:
            r = ringkas_pool(p)
        except Exception as e:
            print("GAGAL", p[:12], e, file=sys.stderr)
            continue
        if r:
            rows.append(r[0]); lps += r[1]; jls += r[2]
    if not rows:
        print("tidak ada pool")
        return
    with open(os.path.join(IDD, "ringkas_pool.csv"), "w", newline="") as f:
        w = csv.DictWriter(f, list(rows[0].keys())); w.writeheader(); w.writerows(rows)
    with open(os.path.join(IDD, "lp_pemilik.csv"), "w", newline="") as f:
        w = csv.DictWriter(f, ["pool", "pemilik", "ditambah", "ditarik", "porsi_tambah"]); w.writeheader(); w.writerows(lps)
    with open(os.path.join(IDD, "penjual.csv"), "w", newline="") as f:
        w = csv.DictWriter(f, ["pool", "penjual", "jual_quote_wei", "porsi_jual", "jual_saat_turun_wei", "blk_jual_pertama"]); w.writeheader(); w.writerows(jls)
    print("pool diringkas:", len(rows), "| baris pemilik LP:", len(lps), "| baris penjual:", len(jls))
    print("->", os.path.join(IDD, "ringkas_pool.csv"))


if __name__ == "__main__":
    main()
