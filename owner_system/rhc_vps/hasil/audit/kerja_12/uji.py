# Uji kausal 10 keluarga sidik jari roket.
# PILIH di periode lama (u_ds5d, u_ds24, ags*), BUKTIKAN di m1, m2.
import numpy as np, pandas as pd, json, os, sys
np.seterr(all="ignore")
K = r"C:\Users\horii\rhc-quant\rhc_vps\hasil\audit\kerja_12"
D = r"C:\Users\horii\rhc-quant\rhc_vps\data"

FAM = {
 "F1 buyer accel":   ["ba_rate1","ba_rate3","ba_d1","ba_d2","ba_ratio","ba_slope","ba_slope_n"],
 "F2 tx burst":      ["gap_mean1","gap_mean3","burst_idx","gap_cv","burst_max50","burst_max50_frac","tx_ratio"],
 "F3 vol accel":     ["vol_ratio","vol_accel","buyvol_ratio","buyvol_accel","vol_slope_n"],
 "F4 liq growth":    ["lp_first","lp_add_frac","lp_rem_frac","lp_net_frac","lp_late_frac","lp_n_add","lp_n_rem","L_growth"],
 "F5 holder accel":  ["hold_t1","hold_t3","hold_d1","hold_accel","hold_ratio","hold_growth"],
 "F6 wallet indep":  ["n_buy_tx","buyer_uniq_frac","clus_max_frac","indep_frac","n_clusters","p2p_edges"],
 "F7 second wave":   ["new_t3_frac","wave2","wave_late","repeat_frac","new_buyers_t3"],
 "F8 price traj":    ["traj_dd","traj_recov","traj_pulih","traj_last_over_peak","traj_up_frac","traj_pola","traj_late_ret","traj_early_ret","traj_convex"],
 "F9 cluster/fund":  ["fund_src_max","fund_frac","sync_max","sync_frac","entry_gap_med","entry_within5"],
 "F10 dev behavior": ["dev_share","dev_n_out","dev_to_pool","dev_sold","dev_out_frac","dev_first_out","dev_to_other","dev_ada"],
}
OLD = json.load(open(os.path.join(r"C:\Users\horii\rhc-quant\rhc_vps\bot","filter_cat.json")))["feats"]

def auc(y, s):
    y = np.asarray(y, bool); s = np.asarray(s, float)
    ok = np.isfinite(s)
    y = y[ok]; s = s[ok]
    if y.sum() == 0 or (~y).sum() == 0: return np.nan
    r = pd.Series(s).rank().values
    n1 = y.sum(); n0 = (~y).sum()
    return (r[y].sum() - n1 * (n1 + 1) / 2) / (n1 * n0)

def muat():
    a = pd.read_csv(os.path.join(D, "arena_feats.csv"))
    f = pd.read_csv(os.path.join(K, "feat12.csv"))
    l = pd.read_csv(os.path.join(K, "label_puncak.csv"))
    df = a.merge(f.drop(columns=["ds"]), on="pool", how="inner").merge(
         l[["pool","pk_price","pk_val","pk_blk","pkv_blk","hz_penuh"]], on="pool", how="inner")
    df = df.sort_values("decide").reset_index(drop=True)
    return df

if __name__ == "__main__":
    df = muat()
    NEW = [c for fs in FAM.values() for c in fs]
    lama = df.ds.isin(["u_ds5d","u_ds24","ags1","ags4"])
    baru = df.ds.isin(["m1","m2"])
    print("koin gabung:", len(df), "| pilih(lama)", int(lama.sum()), "| bukti(m1,m2)", int(baru.sum()))
    print(df.groupby("ds").agg(n=("pool","size"), init_min=("init","min"), init_max=("init","max")))
    for t in [2,3,5,10]:
        print(f"label pk_val>={t}: lama {int((df.pk_val[lama]>=t).sum())} | m1 {int((df.pk_val[df.ds=='m1']>=t).sum())} | m2 {int((df.pk_val[df.ds=='m2']>=t).sum())}")
    df.to_csv(os.path.join(K,"gabung.csv"), index=False)
    print("-> gabung.csv", df.shape)
