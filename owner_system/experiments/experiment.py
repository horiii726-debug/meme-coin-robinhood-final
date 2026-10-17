# EKSPERIMEN: apakah fitur aljabar linear membuat v4 jauh lebih baik?
# Semua fitur hanya dari data <= menit ke-1 (init+600 blok). Label koin sebelumnya hanya dipakai
# kalau trade-nya sudah SELESAI sebelum blok keputusan koin sekarang (tanpa kebocoran).
import json, math, numpy as np, pandas as pd
from sklearn.ensemble import HistGradientBoostingClassifier

NATIVE = "0x0000000000000000000000000000000000000000"
PM = "0x8366a39cc670b4001a1121b8f6a443a643e40951"
ZERO = NATIVE
Q96 = 2 ** 96; ETH = 2539.49; HZ = 216000
rng = np.random.default_rng(7)

trades = [json.loads(l) for f in ["v4_L.jsonl", "v4_B.jsonl"] for l in open(f) if l.strip()]
trades = [t for t in trades if t["plan"] == "v4"]
pools = {}
for l in open("ds6d/pools.csv").read().strip().split("\n")[1:]:
    p = l.strip().split(","); pools[p[0].lower()] = p
SW = json.load(open("la/swaps_m1.json")); TR = json.load(open("la/transfers.json"))
trades.sort(key=lambda t: t["init"])

def basic_and_la(t):
    p = pools[t["pool"]]; c0, c1 = p[1].lower(), p[2].lower(); q1 = c1 == NATIVE
    sw = sorted(SW.get(t["pool"], []), key=lambda x: (x[0], x[1]))
    f = {"fee": int(p[3]), "hook": int(p[5].lower() != NATIVE)}
    if sw:
        sp = np.array([float(int(x[5])) / Q96 for x in sw]); L = np.array([float(int(x[6])) for x in sw])
        a0 = np.array([float(int(x[3])) for x in sw]); a1 = np.array([float(int(x[4])) for x in sw])
        base, quote = (a0, a1) if q1 else (a1, a0)
        buy = base > 0; usd = np.abs(quote) / 1e18 * ETH; signed = np.where(buy, usd, -usd)
        price = sp ** 2 if q1 else 1 / sp ** 2
        lp = 2 * ((L * sp) if q1 else (L / sp)) / 1e18 * ETH
        lp = np.where(np.isfinite(lp), lp, np.nan)
        f.update(n_swap=len(sw), n_buy=int(buy.sum()), n_sell=int((~buy).sum()), buy_usd=usd[buy].sum(), sell_usd=usd[~buy].sum(),
                 lp_m1=np.nanmax(lp[-1:]) if len(lp) else np.nan, ret_m1=price[-1] / price[0] if price[0] > 0 else np.nan,
                 flow_lp=(usd[buy].sum() - usd[~buy].sum()) / max(np.nanmax(lp[-1:]), 1))
        # --- PRICE IMPACT VECTOR: dlogp = lambda * volume bertanda (kuadrat terkecil) ---
        dlp = np.diff(np.log(price)) if len(price) > 1 else np.array([])
        v = signed[1:] if len(signed) > 1 else np.array([])
        ok = np.isfinite(dlp) & np.isfinite(v)
        dlp, v = dlp[ok], v[ok]
        if len(v) >= 3 and (v @ v) > 0:
            lam = (v @ dlp) / (v @ v); res = dlp - lam * v
            f["kyle_lambda"] = lam * 100; f["impact_r2"] = 1 - (res @ res) / max(dlp @ dlp, 1e-18)
            f["impact_cos"] = (v @ dlp) / (np.linalg.norm(v) * np.linalg.norm(dlp) + 1e-18)
            f["impact_norm"] = np.linalg.norm(dlp)
            vb, vs = v > 0, v < 0
            f["lam_buy"] = (v[vb] @ dlp[vb]) / (v[vb] @ v[vb]) * 100 if vb.sum() >= 2 else np.nan
            f["lam_sell"] = (v[vs] @ dlp[vs]) / (v[vs] @ v[vs]) * 100 if vs.sum() >= 2 else np.nan
        # --- LIQUIDITY-WEIGHTED MOMENTUM ---
        if len(dlp) >= 1:
            w = lp[1:][ok] if len(lp) > 1 else np.array([])
            w = np.where(np.isfinite(w), w, 0)
            f["lw_mom"] = (dlp @ w) / max(w.sum(), 1e-9) if len(w) else np.nan
            f["lw_mom_log"] = math.log(max(f["ret_m1"], 1e-9)) * math.log10(max(f["lp_m1"], 10))
    # --- HOLDER DISTRIBUTION MATRIX & TRANSACTION GRAPH ---
    tr = [x for x in TR.get(t["pool"], {}).get("tr", []) if x[0] <= t["init"] + 600]
    bal, edges = {}, {}
    for blk, li, fr, to, amt in sorted(tr, key=lambda x: (x[0], x[1])):
        a = float(int(amt))
        if fr != ZERO: bal[fr] = bal.get(fr, 0) - a
        if to != ZERO: bal[to] = bal.get(to, 0) + a
        if fr != ZERO and to != ZERO and fr != to:
            k = tuple(sorted((fr, to))); edges[k] = edges.get(k, 0) + 1
    holders = {k: v for k, v in bal.items() if v > 0 and k not in (PM, ZERO)}
    if holders:
        b = np.sort(np.array(list(holders.values())))[::-1]; s = b / b.sum()
        f.update(n_holders=len(b), top1=s[0], top5=s[:5].sum(), hhi=(s ** 2).sum(), entropy=-(s * np.log(s)).sum(),
                 gini=1 - 2 * np.sum(np.cumsum(np.sort(s))) / len(s) + 1 / len(s), l2_l1=np.linalg.norm(b) / b.sum())
        tot = sum(v for v in bal.values() if v > 0)
        f["pool_share"] = max(bal.get(PM, 0), 0) / tot if tot > 0 else np.nan
    buyers = set(to for blk, li, fr, to, amt in tr if fr == PM and to not in (PM, ZERO))
    sellers = set(fr for blk, li, fr, to, amt in tr if to == PM and fr not in (PM, ZERO))
    f["n_buyers"] = len(buyers); f["n_sellers"] = len(sellers)
    nodes = sorted({n for e in edges for n in e})
    if len(nodes) >= 3:
        idx = {n: i for i, n in enumerate(nodes)}; A = np.zeros((len(nodes), len(nodes)))
        for (u, w_), c in edges.items(): A[idx[u], idx[w_]] = A[idx[w_], idx[u]] = c
        vals, vecs = np.linalg.eigh(A); ev = np.abs(vecs[:, -1]); ev = ev / (ev.max() + 1e-12)
        deg = A.sum(1); non_pm = [i for n, i in idx.items() if n != PM]
        f.update(g_nodes=len(nodes), g_edges=len(edges), g_density=len(edges) / (len(nodes) * (len(nodes) - 1) / 2),
                 g_lambda1=vals[-1], g_eig_max_nonpool=ev[non_pm].max() if non_pm else np.nan,
                 g_deg_central=((deg.max() - deg).sum() / max((len(nodes) - 1) * (len(nodes) - 2), 1)),
                 g_p2p_frac=sum(c for (u, w_), c in edges.items() if PM not in (u, w_)) / max(sum(edges.values()), 1))
    return f, buyers

rows, buyer_sets = [], []
for t in trades:
    f, buyers = basic_and_la(t); rows.append(f); buyer_sets.append(buyers)
df = pd.DataFrame(rows)

# --- WALLET SIMILARITY MATRIX & SMART MONEY FLOW (kausal) ---
dec = np.array([t["init"] + 600 for t in trades]); ext = np.array([t["exitBlk"] for t in trades])
win = np.array([t["pnl"] > 0 for t in trades]); ret = np.array([t["ret"] for t in trades])
sim_w, sim_l, sim_max, repeat, smart_n, dumb_n, smart_net = [], [], [], [], [], [], []
for i, t in enumerate(trades):
    known = [j for j in range(i) if ext[j] < dec[i]]      # hasilnya sudah diketahui saat keputusan
    seen = [j for j in range(i) if dec[j] < dec[i]]
    B = buyer_sets[i]
    def cos(j):
        C = buyer_sets[j]; return len(B & C) / math.sqrt(len(B) * len(C)) if B and C else 0.0
    sims_known = np.array([cos(j) for j in known]) if known else np.array([])
    wk = np.array([win[j] for j in known]) if known else np.array([], dtype=bool)
    sim_w.append(sims_known[wk].mean() if wk.sum() else 0.0); sim_l.append(sims_known[~wk].mean() if (~wk).sum() else 0.0)
    sim_max.append(max([cos(j) for j in seen], default=0.0))
    prev_wallets = set().union(*[buyer_sets[j] for j in seen]) if seen else set()
    repeat.append(len(B & prev_wallets) / len(B) if B else 0.0)
    smart = set().union(*[buyer_sets[j] for j in known if ret[j] >= 1.5]) if known else set()
    dumb = set().union(*[buyer_sets[j] for j in known if ret[j] <= 0.7]) if known else set()
    smart_n.append(len(B & smart)); dumb_n.append(len(B & dumb)); smart_net.append((len(B & smart) - len(B & dumb)) / max(len(B), 1))
df["wsm_sim_win_minus_loss"] = np.array(sim_w) - np.array(sim_l); df["wsm_sim_max"] = sim_max; df["wsm_repeat_wallets"] = repeat
df["smf_smart_buyers"] = smart_n; df["smf_dumb_buyers"] = dumb_n; df["smf_net"] = smart_net

BASIC = ["fee", "hook", "n_swap", "n_buy", "n_sell", "buy_usd", "sell_usd", "lp_m1", "ret_m1", "flow_lp"]
LA = [c for c in df.columns if c not in BASIC]
X_all = df.replace([np.inf, -np.inf], np.nan)
print(f"trade {len(df)} | fitur dasar {len(BASIC)} | fitur aljabar linear {len(LA)}: {', '.join(LA)}")

def model(): return HistGradientBoostingClassifier(max_iter=150, learning_rate=0.05, max_depth=3, min_samples_leaf=20, l2_regularization=5.0, random_state=0)

START, STEP, SKIP_Q = 250, 50, 0.30
def walk_forward(cols):
    keep = np.ones(len(df), bool); score = np.full(len(df), np.nan)
    for s in range(START, len(df), STEP):
        te = np.arange(s, min(s + STEP, len(df)))
        tr_idx = np.array([j for j in range(s) if ext[j] < dec[s]])   # label sudah diketahui
        if tr_idx.sum() == 0 or win[tr_idx].all() or (~win[tr_idx]).all(): continue
        m = model().fit(X_all.iloc[tr_idx][cols], win[tr_idx])
        thr = np.quantile(m.predict_proba(X_all.iloc[tr_idx][cols])[:, 1], SKIP_Q)
        p = m.predict_proba(X_all.iloc[te][cols])[:, 1]; score[te] = p; keep[te] = p >= thr
    return keep, score

TEST = np.arange(len(df)) >= START
def stats(mask):
    T = [trades[i] for i in np.where(mask & TEST)[0]]
    pn = np.array([t["pnl"] for t in T]); gp, gl = pn[pn > 0].sum(), -pn[pn < 0].sum()
    return dict(n=len(T), win=100 * (pn > 0).mean(), pf=gp / gl if gl else np.inf, pnl=pn.sum(), no_top=pn.sum() - max(pn.max(), 0), ret=100 * (np.mean([t["ret"] for t in T]) - 1))

def account(mask, frac=0.073, start=100.0):
    ev = []
    for i in np.where(mask & TEST)[0]:
        t = trades[i]; rel = t["init"] + HZ if t["reason"] in ("batas 6 jam", "tanpa swap setelah masuk") else t["exitBlk"]
        ev += [(t["entryBlk"], 1, i), (max(rel, t["exitBlk"]), 0, i)]
    ev.sort(); cash, locked, pos = start, 0.0, {}
    for blk, typ, i in ev:
        t = trades[i]; txs = 3 if t["tp1"] else 2
        if typ == 1:
            p = min(frac * (cash + locked), t["size"], cash - 0.02 * txs)
            if p >= 1: cash -= p; locked += p; pos[i] = p
        elif i in pos:
            p = pos.pop(i); locked -= p; cash += max(0, p * (t["ret"] + 0.02 * txs / t["size"]) - 0.02 * txs)
    return cash + locked

base = np.ones(len(df), bool)
kA, sA = walk_forward(BASIC); kB, sB = walk_forward(BASIC + LA); kC, sC = walk_forward(LA)
from sklearn.metrics import roc_auc_score
res = {}
for name, mask, sc in [("v4 sekarang (tanpa filter)", base, None), ("v4 + filter fitur dasar", kA, sA), ("v4 + filter dasar + aljabar linear", kB, sB), ("v4 + filter aljabar linear saja", kC, sC)]:
    st = stats(mask); st["akun100"] = account(mask)
    st["auc"] = roc_auc_score(win[TEST], sc[TEST]) if sc is not None else None
    res[name] = st
# kontrol: filter ACAK yang membuang jumlah trade yang sama
nB = int((~kB & TEST).sum()); rand_pnl, rand_acc, rand_pf = [], [], []
test_idx = np.where(TEST)[0]
for _ in range(300):
    m = base.copy(); m[rng.choice(test_idx, nB, replace=False)] = False
    s = stats(m); rand_pnl.append(s["pnl"]); rand_pf.append(s["pf"]); rand_acc.append(account(m))
res["_acak"] = dict(pnl_median=float(np.median(rand_pnl)), pf_median=float(np.median(rand_pf)), akun100_median=float(np.median(rand_acc)),
                   p_pnl_B=float((np.array(rand_pnl) >= res["v4 + filter dasar + aljabar linear"]["pnl"]).mean()),
                   p_akun_B=float((np.array(rand_acc) >= res["v4 + filter dasar + aljabar linear"]["akun100"]).mean()))
# fitur yang paling berpengaruh (permutasi, di data uji)
from sklearn.inspection import permutation_importance
tr_idx = np.where(~TEST)[0]; te_idx = np.where(TEST)[0]
mB = model().fit(X_all.iloc[tr_idx][BASIC + LA], win[tr_idx])
pi = permutation_importance(mB, X_all.iloc[te_idx][BASIC + LA], win[te_idx], n_repeats=10, random_state=0, scoring="roc_auc")
res["_penting"] = sorted(zip(BASIC + LA, pi.importances_mean.round(4)), key=lambda x: -x[1])[:10]
json.dump(res, open("la/result.json", "w"), indent=1, default=float)
print(f"\nUJI WALK-FORWARD: {int(TEST.sum())} trade terakhir (model hanya belajar dari trade yang sudah selesai sebelumnya)")
for k, v in res.items():
    if k.startswith("_"): continue
    print(f"{k:38s} n={v['n']:3d} win={v['win']:.1f}% PF={v['pf']:.2f} PnL=${v['pnl']:.0f} tanpaTop=${v['no_top']:.0f} rata={v['ret']:.1f}% akun$100=${v['akun100']:.0f} AUC={'-' if v['auc'] is None else round(v['auc'],3)}")
print("filter ACAK (buang jumlah sama):", res["_acak"])
print("fitur terpenting:", res["_penting"])
