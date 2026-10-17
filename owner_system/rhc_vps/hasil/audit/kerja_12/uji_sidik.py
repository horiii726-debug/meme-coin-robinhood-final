# Uji kausal 10 keluarga fitur: PILIH di periode lama (ags1,ags4,u_ds5d,u_ds24) -> BUKTI di m1,m2.
import pandas as pd, numpy as np, json, os, sys
from sklearn.metrics import roc_auc_score
from catboost import CatBoostClassifier
from scipy.stats import spearmanr

ROOT = r"C:\Users\horii\rhc-quant\rhc_vps"
K = os.path.join(ROOT, "hasil", "audit", "kerja_12")
OLD = json.load(open(os.path.join(ROOT, "bot", "filter_cat.json")))["feats"]

FAM = {
 "F1 buyer accel":      ["ba_rate1","ba_rate3","ba_d1","ba_d2","ba_ratio","ba_slope","ba_slope_n"],
 "F2 tx burst":         ["gap_mean1","gap_mean3","burst_idx","gap_cv","burst_max50","burst_max50_frac","tx_ratio"],
 "F3 volume accel":     ["vol_ratio","vol_accel","buyvol_ratio","buyvol_accel","vol_slope_n"],
 "F4 liquidity growth": ["lp_first","lp_add_frac","lp_rem_frac","lp_net_frac","lp_late_frac","lp_n_add","lp_n_rem","L_growth"],
 "F5 holder accel":     ["hold_t1","hold_t3","hold_d1","hold_accel","hold_ratio","hold_growth"],
 "F6 wallet indep":     ["n_buy_tx","buyer_uniq_frac","clus_max_frac","indep_frac","n_clusters","p2p_edges"],
 "F7 second wave":      ["new_t3_frac","wave2","wave_late","repeat_frac","new_buyers_t3"],
 "F8 price traj":       ["traj_dd","traj_recov","traj_pulih","traj_last_over_peak","traj_up_frac","traj_pola","traj_late_ret","traj_early_ret","traj_convex"],
 "F9 cluster/funding":  ["fund_src_max","fund_frac","sync_max","sync_frac","entry_gap_med","entry_within5"],
 "F10 dev behavior":    ["dev_share","dev_n_out","dev_to_pool","dev_sold","dev_out_frac","dev_first_out","dev_to_other","dev_ada"],
}
NEW = [c for v in FAM.values() for c in v]

a = pd.read_csv(os.path.join(ROOT, "data", "arena_feats.csv"))
f = pd.read_csv(os.path.join(K, "feat12.csv"))
df = a.merge(f, on=["ds", "pool"], how="left").sort_values("decide").reset_index(drop=True)
LAMA = df.ds.isin(["ags1", "ags4", "u_ds5d", "u_ds24"])
S = {"PILIH(lama)": LAMA, "BUKTI m1": df.ds == "m1", "BUKTI m2": df.ds == "m2"}
THR = float(os.environ.get("THR", 2.0))
y = (df.ret.values >= THR)

print("=== label ret>=%.0f ===" % THR)
for k, m in S.items():
    print("  %-12s n=%4d roket=%3d (%.1f%%)" % (k, m.sum(), y[m.values].sum(), 100 * y[m.values].mean()))

def model(cols, tr_mask, seed=0):
    X = df.loc[tr_mask, cols].astype(float).fillna(-1).values
    yy = y[tr_mask.values]
    if len(set(yy)) < 2: return None
    m = CatBoostClassifier(iterations=300, learning_rate=0.05, depth=4, l2_leaf_reg=5.0,
                           random_seed=seed, verbose=0, allow_writing_files=False,
                           thread_count=1, auto_class_weights="Balanced")
    m.fit(X, yy)
    return m

def auc_of(m, cols, mask):
    if m is None: return float("nan")
    X = df.loc[mask, cols].astype(float).fillna(-1).values
    yy = y[mask.values]
    if len(set(yy)) < 2: return float("nan")
    return roc_auc_score(yy, m.predict_proba(X)[:, 1])

# ---------- 1. AUC satu-fitur: arah dipilih di LAMA, dibuktikan di m1/m2 ----------
print("\n=== AUC satu-fitur (arah dipilih di periode lama) ===")
print("%-22s %8s %8s %8s   %s" % ("fitur", "lama", "m1", "m2", "korelasi|rho| maks vs fitur lama"))
rows = []
old_vals = df[OLD].astype(float)
for fam, cols in FAM.items():
    for c in cols:
        v = df[c].astype(float)
        if v.notna().sum() < 100 or v.nunique() < 3: continue
        try:
            al = roc_auc_score(y[LAMA.values], v[LAMA].fillna(v[LAMA].median()).values)
        except Exception:
            continue
        sign = 1.0 if al >= 0.5 else -1.0
        out = {"fam": fam, "f": c, "lama": max(al, 1 - al)}
        for nm, msk in [("m1", S["BUKTI m1"]), ("m2", S["BUKTI m2"])]:
            vv = v[msk].fillna(v[msk].median()).values
            try:
                out[nm] = roc_auc_score(y[msk.values], sign * vv)
            except Exception:
                out[nm] = float("nan")
        # redundansi terhadap 33 fitur lama
        best, bn = 0.0, ""
        vf = v.fillna(v.median())
        for oc in (OLD if not os.environ.get('SKIPRHO') else []):
            ov = old_vals[oc].fillna(old_vals[oc].median())
            if ov.nunique() < 3: continue
            r = abs(spearmanr(vf, ov, nan_policy="omit").statistic)
            if r == r and r > best: best, bn = r, oc
        out["rho"] = best; out["rho_f"] = bn
        rows.append(out)
        print("%-22s %8.3f %8.3f %8.3f   %.2f (%s)" % (c, out["lama"], out["m1"], out["m2"], best, bn))
sf = pd.DataFrame(rows)
sf.to_csv(os.path.join(K, "auc_satu_fitur_thr%g.csv" % THR), index=False)

# ---------- 2. model per keluarga + tambahan di atas fitur lama ----------
print("\n=== model per keluarga (latih di LAMA saja) ===")
base = model(OLD, LAMA)
b1, b2 = auc_of(base, OLD, S["BUKTI m1"]), auc_of(base, OLD, S["BUKTI m2"])
print("  DASAR 33 fitur lama          m1 %.3f  m2 %.3f" % (b1, b2))
res = []
for fam, cols in FAM.items():
    m = model(cols, LAMA)
    a1, a2 = auc_of(m, cols, S["BUKTI m1"]), auc_of(m, cols, S["BUKTI m2"])
    mc = model(OLD + cols, LAMA)
    c1, c2 = auc_of(mc, OLD + cols, S["BUKTI m1"]), auc_of(mc, OLD + cols, S["BUKTI m2"])
    res.append(dict(fam=fam, solo_m1=a1, solo_m2=a2, plus_m1=c1, plus_m2=c2, d_m1=c1 - b1, d_m2=c2 - b2))
    print("  %-22s solo m1 %.3f m2 %.3f | +lama m1 %.3f (%+.3f) m2 %.3f (%+.3f)" % (fam, a1, a2, c1, c1 - b1, c2, c2 - b2))
pd.DataFrame(res).to_csv(os.path.join(K, "auc_keluarga_thr%g.csv" % THR), index=False)

# ---------- 3. kontrol label acak ----------
rng = np.random.default_rng(7)
ysh = y.copy(); rng.shuffle(ysh)
ytrue = y.copy()
y = ysh
mk = model(OLD + NEW, LAMA)
print("\n=== KONTROL label diacak: AUC m1 %.3f  m2 %.3f (harus ~0.50) ===" %
      (auc_of(mk, OLD + NEW, S["BUKTI m1"]), auc_of(mk, OLD + NEW, S["BUKTI m2"])))
y = ytrue

# ---------- 4. model gabungan semua fitur baru ----------
print("\n=== gabungan ===")
for nm, cols in [("semua baru", NEW), ("lama+baru", OLD + NEW), ("lama", OLD)]:
    m = model(cols, LAMA)
    print("  %-12s m1 %.3f  m2 %.3f" % (nm, auc_of(m, cols, S["BUKTI m1"]), auc_of(m, cols, S["BUKTI m2"])))
