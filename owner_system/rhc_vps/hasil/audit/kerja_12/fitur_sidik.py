# Agent 12 - "Sidik Jari Koin Naik"
# Bangun 10 keluarga fitur HANYA dari swap + transfer + liq menit-1 (blok <= init+600).
# Tidak menyentuh file proyek. Output: feat12_<ds>.csv (kecil).
import json, csv, os, sys, math
from collections import defaultdict

ROOT = r"C:\Users\horii\rhc-quant\rhc_vps"
DATA = os.path.join(ROOT, "data")
OUT = os.path.join(ROOT, "hasil", "audit", "kerja_12")
NATIVE = "0x" + "0" * 40
PM = "0x8366a39cc670b4001a1121b8f6a443a643e40951"
Q96 = 2.0 ** 96
WIN = 600            # jendela keputusan
BLKSEC = 0.1013      # detik per blok (dari pipeline)
T = 200              # sepertiga jendela

def safe_div(a, b):
    return a / b if b else float("nan")

def ols_slope(y):
    n = len(y)
    if n < 3: return float("nan")
    mx = (n - 1) / 2.0
    my = sum(y) / n
    sxx = sum((i - mx) ** 2 for i in range(n))
    sxy = sum((i - mx) * (y[i] - my) for i in range(n))
    return safe_div(sxy, sxx)

def maxdd_and_recovery(price):
    """kedalaman pullback terdalam dari puncak berjalan + waktu pulih (index)"""
    if len(price) < 3: return float("nan"), float("nan"), float("nan")
    peak = price[0]; peak_i = 0
    worst = 0.0; worst_i = 0; worst_peak_i = 0; worst_peak = price[0]
    for i, p in enumerate(price):
        if p > peak: peak = p; peak_i = i
        dd = 1 - p / peak if peak > 0 else 0
        if dd > worst:
            worst = dd; worst_i = i; worst_peak_i = peak_i; worst_peak = peak
    rec = float("nan")
    for j in range(worst_i, len(price)):
        if price[j] >= worst_peak:
            rec = j - worst_i; break
    return worst, rec, worst_peak

def fitur_pool(meta, sw, tr, liqrows, dev, ethUsd):
    init = meta["init"]; q1 = meta["c1"] == NATIVE
    f = {}
    sw = sorted(sw, key=lambda x: (x[0], x[1]))
    tr = sorted(tr, key=lambda x: (x[0], x[1]))

    # ---------- deret dasar dari swap ----------
    blk = [x[0] for x in sw]
    rel = [b - init for b in blk]
    a0 = [float(x[2]) for x in sw]; a1 = [float(x[3]) for x in sw]
    sp = [float(x[4]) / Q96 for x in sw]
    L = [float(x[5]) for x in sw]
    base = a0 if q1 else a1
    quote = a1 if q1 else a0
    buy = [b > 0 for b in base]
    usd = [abs(q) / 1e18 * ethUsd for q in quote]
    price = [(s * s) if q1 else (1.0 / (s * s)) if s > 0 else float("nan") for s in sp]

    def third(i):  # 0,1,2
        r = rel[i]
        return 0 if r < T else (1 if r < 2 * T else 2)

    ns = [0, 0, 0]; nb = [0, 0, 0]; vu = [0.0, 0.0, 0.0]; vb = [0.0, 0.0, 0.0]
    for i in range(len(sw)):
        k = third(i)
        if k > 2: continue
        ns[k] += 1
        if buy[i]: nb[k] += 1; vb[k] += usd[i]
        vu[k] += usd[i]

    # ---------- F1 buyer acceleration (dari transfer PM->wallet, identitas pembeli nyata) ----------
    buys = [(t[0] - init, t[2], t[3]) for t in tr if t[2] == PM and t[3] not in (PM, NATIVE)]
    sells = [(t[0] - init, t[2]) for t in tr if t[3] == PM and t[2] not in (PM, NATIVE)]
    bt = [0, 0, 0]
    first_seen = {}
    for r, _, to in buys:
        k = 0 if r < T else (1 if r < 2 * T else 2)
        if k <= 2:
            bt[k] += 1
            if to not in first_seen: first_seen[to] = r
    sec = T * BLKSEC
    f["ba_rate1"] = bt[0] / sec; f["ba_rate3"] = bt[2] / sec
    f["ba_d1"] = (bt[2] - bt[0]) / sec            # turunan pertama (beda laju)
    f["ba_d2"] = (bt[2] - 2 * bt[1] + bt[0]) / sec  # turunan kedua
    f["ba_ratio"] = safe_div(bt[2] + 1.0, bt[0] + 1.0)
    # kemiringan laju pembeli per bin 60 blok
    bins = [0] * 10
    for r, _, _ in buys:
        if 0 <= r < WIN: bins[min(9, r // 60)] += 1
    f["ba_slope"] = ols_slope(bins)
    f["ba_slope_n"] = safe_div(f["ba_slope"], (sum(bins) / 10.0) if sum(bins) else float("nan"))

    # ---------- F2 transaction burst ----------
    gaps = [rel[i] - rel[i - 1] for i in range(1, len(rel))]
    g1 = [rel[i] - rel[i - 1] for i in range(1, len(rel)) if rel[i] < T]
    g3 = [rel[i] - rel[i - 1] for i in range(1, len(rel)) if rel[i] >= 2 * T]
    m1g = (sum(g1) / len(g1)) if g1 else float("nan")
    m3g = (sum(g3) / len(g3)) if g3 else float("nan")
    f["gap_mean1"] = m1g; f["gap_mean3"] = m3g
    f["burst_idx"] = safe_div(m1g, m3g) if (m3g and m3g == m3g and m3g > 0) else float("nan")
    if gaps:
        mg = sum(gaps) / len(gaps)
        sd = math.sqrt(sum((x - mg) ** 2 for x in gaps) / len(gaps))
        f["gap_cv"] = safe_div(sd, mg)
    else:
        f["gap_cv"] = float("nan")
    # kerapatan maksimum dalam jendela geser 50 blok
    best = 0
    for i in range(len(rel)):
        j = i
        while j < len(rel) and rel[j] - rel[i] < 50: j += 1
        best = max(best, j - i)
    f["burst_max50"] = best
    f["burst_max50_frac"] = safe_div(best, len(sw)) if sw else float("nan")
    f["tx_ratio"] = (ns[2] + 1.0) / (ns[0] + 1.0)

    # ---------- F3 volume acceleration ----------
    f["vol_ratio"] = (vu[2] + 1.0) / (vu[0] + 1.0)
    f["vol_accel"] = safe_div(vu[2] - 2 * vu[1] + vu[0], sum(vu) + 1.0)
    f["buyvol_ratio"] = (vb[2] + 1.0) / (vb[0] + 1.0)
    f["buyvol_accel"] = safe_div(vb[2] - 2 * vb[1] + vb[0], sum(vb) + 1.0)
    vbins = [0.0] * 10
    for i in range(len(sw)):
        if 0 <= rel[i] < WIN: vbins[min(9, rel[i] // 60)] += usd[i]
    f["vol_slope_n"] = safe_div(ols_slope(vbins), (sum(vbins) / 10.0) if sum(vbins) else float("nan"))

    # ---------- F4 liquidity growth (dari liq.csv, mint/burn nyata) ----------
    lr = sorted(liqrows, key=lambda x: (x[0], x[1]))
    if lr:
        first = lr[0][2]
        add = sum(d for _, _, d in lr[1:] if d > 0)
        rem = sum(-d for _, _, d in lr[1:] if d < 0)
        late = sum(d for b, _, d in lr[1:] if b - init >= 2 * T)
        f["lp_first"] = first
        f["lp_add_frac"] = safe_div(add, abs(first)) if first else float("nan")
        f["lp_rem_frac"] = safe_div(rem, abs(first)) if first else float("nan")
        f["lp_net_frac"] = safe_div(add - rem, abs(first)) if first else float("nan")
        f["lp_late_frac"] = safe_div(late, abs(first)) if first else float("nan")
        f["lp_n_add"] = sum(1 for _, _, d in lr[1:] if d > 0)
        f["lp_n_rem"] = sum(1 for _, _, d in lr[1:] if d < 0)
    else:
        for k in ["lp_first", "lp_add_frac", "lp_rem_frac", "lp_net_frac", "lp_late_frac", "lp_n_add", "lp_n_rem"]:
            f[k] = float("nan")
    f["L_growth"] = safe_div(L[-1], L[0]) if L and L[0] else float("nan")

    # ---------- F5 holder acceleration ----------
    bal = defaultdict(float); hcount = []
    ptr = 0
    for k in (1, 2, 3):
        lim = k * T
        while ptr < len(tr) and (tr[ptr][0] - init) < lim:
            _, _, fr, to, amt = tr[ptr]
            a = float(amt)
            if fr != NATIVE: bal[fr] -= a
            if to != NATIVE: bal[to] += a
            ptr += 1
        hcount.append(sum(1 for k2, v in bal.items() if v > 0 and k2 not in (PM, NATIVE)))
    h1, h2, h3 = hcount
    f["hold_t1"] = h1; f["hold_t3"] = h3
    f["hold_d1"] = (h3 - h2) - (h2 - h1)
    f["hold_accel"] = h3 - 2 * h2 + h1
    f["hold_ratio"] = safe_div(h3 - h2 + 1.0, h2 - h1 + 1.0)
    f["hold_growth"] = (h3 + 1.0) / (h1 + 1.0)

    # ---------- F6 wallet independence ----------
    buyers = set(to for _, _, to in buys)
    f["n_buy_tx"] = len(buys)
    f["buyer_uniq_frac"] = safe_div(len(buyers), len(buys)) if buys else float("nan")
    # komponen terhubung antar-pembeli lewat transfer p2p (bukan lewat pool)
    par = {}
    def find(x):
        while par.get(x, x) != x: par[x] = par.get(par[x], par[x]); x = par[x]
        return x
    def uni(a, b):
        ra, rb = find(a), find(b)
        if ra != rb: par[ra] = rb
    for b in buyers: par[b] = b
    edges_p2p = 0
    for _, _, fr, to, _ in tr:
        if fr in (PM, NATIVE) or to in (PM, NATIVE) or fr == to: continue
        edges_p2p += 1
        if fr in par and to in par: uni(fr, to)
    comp = defaultdict(int)
    for b in buyers: comp[find(b)] += 1
    f["clus_max_frac"] = safe_div(max(comp.values()), len(buyers)) if buyers else float("nan")
    f["indep_frac"] = safe_div(sum(1 for v in comp.values() if v == 1), len(buyers)) if buyers else float("nan")
    f["n_clusters"] = len(comp)
    f["p2p_edges"] = edges_p2p

    # ---------- F7 second-wave buyers ----------
    new_t = [0, 0, 0]; buy_t = [0, 0, 0]
    seen = set()
    for r, _, to in buys:
        k = 0 if r < T else (1 if r < 2 * T else 2)
        if k > 2: continue
        buy_t[k] += 1
        if to not in seen: seen.add(to); new_t[k] += 1
    f["new_t3_frac"] = safe_div(new_t[2], buy_t[2]) if buy_t[2] else float("nan")
    f["wave2"] = safe_div(new_t[2] + 1.0, new_t[0] + 1.0)
    f["wave_late"] = safe_div(new_t[1] + new_t[2], len(buyers)) if buyers else float("nan")
    f["repeat_frac"] = safe_div(len(buys) - len(buyers), len(buys)) if buys else float("nan")
    f["new_buyers_t3"] = new_t[2]

    # ---------- F8 price trajectory ----------
    if len(price) >= 4 and all(p == p for p in price):
        pmax = max(price); pl = price[-1]
        dd, rec, _ = maxdd_and_recovery(price)
        f["traj_dd"] = dd
        f["traj_recov"] = rec
        f["traj_pulih"] = 1.0 if (rec == rec) else 0.0
        f["traj_last_over_peak"] = safe_div(pl, pmax)
        ups = sum(1 for i in range(1, len(price)) if price[i] > price[i - 1])
        f["traj_up_frac"] = ups / (len(price) - 1)
        # pola: pump -> pullback dangkal (5-35%) -> pulih -> breakout
        f["traj_pola"] = 1.0 if (dd == dd and 0.05 <= dd <= 0.35 and rec == rec and pl >= pmax * 0.98) else 0.0
        mid = len(price) // 2
        f["traj_late_ret"] = safe_div(price[-1], price[mid])
        f["traj_early_ret"] = safe_div(price[mid], price[0])
        f["traj_convex"] = safe_div(math.log(max(f["traj_late_ret"], 1e-9)), max(abs(math.log(max(f["traj_early_ret"], 1e-9))), 1e-9))
    else:
        for k in ["traj_dd", "traj_recov", "traj_pulih", "traj_last_over_peak", "traj_up_frac",
                  "traj_pola", "traj_late_ret", "traj_early_ret", "traj_convex"]:
            f[k] = float("nan")

    # ---------- F9 wallet cluster / funding ----------
    # graf pendanaan: wallet yang menerima token dari sumber non-pool yang sama
    src = defaultdict(set)
    for _, _, fr, to, _ in tr:
        if fr in (PM, NATIVE) or to in (PM, NATIVE): continue
        if to in buyers: src[fr].add(to)
    f["fund_src_max"] = max((len(v) for v in src.values()), default=0)
    f["fund_frac"] = safe_div(len(set().union(*src.values())) if src else 0, len(buyers)) if buyers else float("nan")
    # waktu masuk berbarengan
    perblk = defaultdict(set)
    for r, _, to in buys: perblk[r].add(to)
    f["sync_max"] = max((len(v) for v in perblk.values()), default=0)
    f["sync_frac"] = safe_div(sum(len(v) for v in perblk.values() if len(v) > 1), len(buyers)) if buyers else float("nan")
    fs = sorted(first_seen.values())
    if len(fs) >= 3:
        d = [fs[i] - fs[i - 1] for i in range(1, len(fs))]
        f["entry_gap_med"] = sorted(d)[len(d) // 2]
        f["entry_within5"] = sum(1 for x in d if x <= 5) / len(d)
    else:
        f["entry_gap_med"] = float("nan"); f["entry_within5"] = float("nan")

    # ---------- F10 dev behavior ----------
    if dev:
        dout = [(t[0] - init, t[3], float(t[4])) for t in tr if t[2] == dev]
        din = [(t[0] - init, float(t[4])) for t in tr if t[3] == dev]
        tot_pos = sum(v for v in bal.values() if v > 0)
        f["dev_share"] = safe_div(max(bal.get(dev, 0.0), 0.0), tot_pos) if tot_pos else float("nan")
        f["dev_n_out"] = len(dout)
        f["dev_to_pool"] = sum(a for _, to, a in dout if to == PM)
        f["dev_sold"] = 1.0 if any(to == PM for _, to, _ in dout) else 0.0
        f["dev_out_frac"] = safe_div(sum(a for _, _, a in dout), sum(a for _, a in din)) if din else float("nan")
        f["dev_first_out"] = (min(r for r, _, _ in dout) if dout else WIN) / float(WIN)
        f["dev_to_other"] = sum(a for _, to, a in dout if to not in (PM, NATIVE))
        f["dev_ada"] = 1.0
    else:
        for k in ["dev_share", "dev_n_out", "dev_to_pool", "dev_sold", "dev_out_frac", "dev_first_out", "dev_to_other"]:
            f[k] = float("nan")
        f["dev_ada"] = 0.0
    return f


def proses(ds):
    d = os.path.join(DATA, ds)
    sw = json.load(open(os.path.join(d, "swaps_m1.json")))
    tf = json.load(open(os.path.join(d, "transfers.json")))
    cr = {}
    p = os.path.join(d, "dev_creator.json")
    if os.path.exists(p): cr = json.load(open(p))
    pools = {}
    with open(os.path.join(d, "pools.csv")) as fh:
        rd = csv.reader(fh); next(rd)
        for r in rd:
            pools[r[0].lower()] = {"c0": r[1].lower(), "c1": r[2].lower(), "fee": int(r[3]),
                                   "hooks": r[5].lower(), "init": int(r[6])}
    # ethUsd per pool dari trades.jsonl
    eth = {}
    with open(os.path.join(d, "trades.jsonl")) as fh:
        for line in fh:
            t = json.loads(line)
            if t.get("plan") == "v4": eth[t["pool"]] = t["ethUsd"]
    # liq.csv streaming, hanya blok <= init+600
    liq = defaultdict(list)
    with open(os.path.join(d, "liq.csv")) as fh:
        rd = csv.reader(fh); next(rd)
        for r in rd:
            pid = r[0].lower()
            m = pools.get(pid)
            if not m: continue
            b = int(r[1])
            if b > m["init"] + WIN: continue
            liq[pid].append((b, int(r[2]), float(r[5])))

    rows = []
    for pid, s in sw.items():
        m = pools.get(pid)
        if not m or pid not in eth: continue
        t = tf.get(pid, {}).get("tr", [])
        t = [[x[0], x[1], x[2].lower(), x[3].lower(), x[4]] for x in t]
        dev = (cr.get(pid) or {}).get("dev")
        if dev: dev = dev.lower()
        f = fitur_pool(m, s, t, liq.get(pid, []), dev, eth[pid])
        f["pool"] = pid; f["ds"] = ds
        rows.append(f)
    return rows


if __name__ == "__main__":
    allrows = []
    for ds in sys.argv[1:]:
        r = proses(ds)
        print(ds, len(r), "koin", file=sys.stderr)
        allrows += r
    keys = [k for k in allrows[0].keys() if k not in ("pool", "ds")]
    out = os.path.join(OUT, "feat12.csv")
    mode = "a" if os.path.exists(out) and os.environ.get("APPEND") else "w"
    with open(out, mode, newline="") as fh:
        w = csv.writer(fh)
        if mode == "w": w.writerow(["ds", "pool"] + keys)
        for r in allrows:
            w.writerow([r["ds"], r["pool"]] + [("" if (isinstance(r[k], float) and r[k] != r[k]) else r[k]) for k in keys])
    print("tulis", out, len(allrows), file=sys.stderr)
