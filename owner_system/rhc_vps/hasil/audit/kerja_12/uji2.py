# Uji kausal: 10 keluarga sidik jari -> label roket pk_val (puncak nilai posisi nyata setelah masuk).
# PILIH/latih hanya di periode lama. BUKTI di m1 lalu m2. Kontrol label diacak.
import numpy as np, pandas as pd, json, os, sys
from catboost import CatBoostClassifier
np.seterr(all="ignore")
K = r"C:\Users\horii\rhc-quant\rhc_vps\hasil\audit\kerja_12"
sys.path.insert(0, K)
from uji import FAM, OLD, auc, muat

BLKDAY = 86400 / 0.1013
TH = int(os.environ.get("TH", "10"))

def cb(X, y, seed=0):
    m = CatBoostClassifier(iterations=200, learning_rate=0.05, depth=3, l2_leaf_reg=6.0,
                           random_seed=seed, verbose=0, allow_writing_files=False,
                           thread_count=1, auto_class_weights="Balanced")
    m.fit(X, y)
    return m

def presisi(df, s, frac, labels=(10, 5, 3, 2)):
    ok = np.isfinite(s)
    n = max(1, int(round(frac * ok.sum())))
    idx = np.argsort(-np.where(ok, s, -np.inf))[:n]
    sub = df.iloc[idx]
    hari = (df.decide.max() - df.decide.min()) / BLKDAY
    out = {"n": n, "per_hari": n / max(hari, 1e-9)}
    for t in labels:
        out["p%d" % t] = float((sub.pk_val >= t).mean())
    out["rug"] = float((sub.ret < 0.5).mean())
    out["ret_mean"] = float(sub.ret.mean())
    out["ret_med"] = float(sub.ret.median())
    out["pkval_mean"] = float(sub.pk_val.mean())
    return out

if __name__ == "__main__":
    df = muat()
    lama = df.ds.isin(["u_ds5d", "u_ds24", "ags1", "ags4"]).values
    m1 = (df.ds == "m1").values; m2 = (df.ds == "m2").values
    y = (df.pk_val >= TH).values
    print("=" * 70)
    print("LABEL pk_val >= %d | lama %d/%d | m1 %d/%d | m2 %d/%d" %
          (TH, y[lama].sum(), lama.sum(), y[m1].sum(), m1.sum(), y[m2].sum(), m2.sum()))
    print("=" * 70)

    # ---- 1. univariat per keluarga: pilih fitur & arah HANYA di periode lama
    print("\n## Univariat (fitur terbaik tiap keluarga, dipilih di periode LAMA)")
    print("%-18s %-20s %7s %7s %7s" % ("keluarga", "fitur", "AUC-pilih", "AUC-m1", "AUC-m2"))
    best_uni = {}
    for fam, cols in FAM.items():
        cand = []
        for c in cols:
            a = auc(y[lama], df[c].values[lama])
            if np.isfinite(a): cand.append((abs(a - 0.5), c, a))
        if not cand:
            print("%-18s %-20s   tidak ada data" % (fam, "-")); continue
        cand.sort(reverse=True)
        _, c, a = cand[0]
        sgn = 1 if a >= 0.5 else -1
        a1 = auc(y[m1], sgn * df[c].values[m1]); a2 = auc(y[m2], sgn * df[c].values[m2])
        ap = a if sgn > 0 else 1 - a
        best_uni[fam] = (c, sgn, ap, a1, a2)
        print("%-18s %-20s %7.3f %7.3f %7.3f%s" % (fam, c + ("" if sgn > 0 else " (-)"), ap, a1, a2, ""))

    # ---- 2. model per keluarga, latih di LAMA, uji di m1/m2
    print("\n## Model per keluarga (latih LAMA -> uji m1/m2), + kontrol label diacak")
    print("%-18s %7s %7s %7s %9s" % ("keluarga", "AUC-m1", "AUC-m2", "AUC-gab", "acak-m1"))
    rng = np.random.default_rng(0)
    skor_fam = {}
    for fam, cols in FAM.items():
        X = df[cols].fillna(-1).values
        if len(set(y[lama])) < 2: continue
        m = cb(X[lama], y[lama])
        s = m.predict_proba(X)[:, 1]
        skor_fam[fam] = s
        ysh = y[m1].copy(); rng.shuffle(ysh)
        print("%-18s %7.3f %7.3f %7.3f %9.3f" % (fam, auc(y[m1], s[m1]), auc(y[m2], s[m2]),
              auc(y[m1 | m2], s[m1 | m2]), auc(ysh, s[m1])))

    # ---- 3. model gabungan
    print("\n## Model gabungan")
    combos = {
        "LAMA34 (fitur bot sekarang)": OLD,
        "BARU (10 keluarga)": [c for cs in FAM.values() for c in cs],
        "LAMA34 + BARU": OLD + [c for cs in FAM.values() for c in cs],
    }
    skor = {}
    for nm, cols in combos.items():
        X = df[cols].fillna(-1).values
        m = cb(X[lama], y[lama])
        s = m.predict_proba(X)[:, 1]
        skor[nm] = s
        ysh = y[m1 | m2].copy(); rng.shuffle(ysh)
        print("%-28s AUC m1 %.3f | m2 %.3f | gab %.3f | acak %.3f" %
              (nm, auc(y[m1], s[m1]), auc(y[m2], s[m2]), auc(y[m1 | m2], s[m1 | m2]), auc(ysh, s[m1 | m2])))
    # skor filter lama yang dipakai bot
    sc = pd.read_csv(os.path.join(r"C:\Users\horii\rhc-quant\rhc_vps\data", "arena_scored.csv"))[["pool", "score"]]
    dd = df.merge(sc, on="pool", how="left")
    print("%-28s AUC m1 %.3f | m2 %.3f  (skor filter ML yang dipakai bot)" %
          ("SKOR-BOT", auc(y[m1], dd.score.values[m1]), auc(y[m2], dd.score.values[m2])))

    # ---- 4. presisi di ambang ketat (SETUP A+)
    print("\n## Presisi ambang ketat (ambil top x% skor), BUKTI m1 & m2")
    for nm in ["LAMA34 (fitur bot sekarang)", "BARU (10 keluarga)", "LAMA34 + BARU"]:
        s = skor[nm]
        for lbl, msk in [("m1", m1), ("m2", m2)]:
            d2 = df[msk].reset_index(drop=True); s2 = s[msk]
            baseline = {t: float((d2.pk_val >= t).mean()) for t in (10, 5, 3, 2)}
            print("\n%s | %s (n=%d, dasar >=10x %.1f%% >=5x %.1f%% >=3x %.1f%%)" %
                  (nm, lbl, len(d2), 100 * baseline[10], 100 * baseline[5], 100 * baseline[3]))
            print("  top%%   n  /hari   >=10x   >=5x   >=3x   >=2x    rug   ret_rata  ret_med  puncak_rata")
            for fr in (0.01, 0.02, 0.05, 0.10):
                r = presisi(d2, s2, fr)
                print("  %4.0f%% %3d %5.1f  %5.1f%% %5.1f%% %5.1f%% %5.1f%%  %5.1f%%   %6.2f   %6.2f   %6.2f" %
                      (100 * fr, r["n"], r["per_hari"], 100 * r["p10"], 100 * r["p5"], 100 * r["p3"],
                       100 * r["p2"], 100 * r["rug"], r["ret_mean"], r["ret_med"], r["pkval_mean"]))

    # simpan skor untuk jalur kedua
    out = df[["ds", "pool", "decide", "ret", "pk_val", "pk_price"]].copy()
    for nm, s in skor.items(): out[nm.split()[0]] = s
    out.to_csv(os.path.join(K, "skor_roket_th%d.csv" % TH), index=False)
    print("\n-> skor_roket_th%d.csv" % TH)
