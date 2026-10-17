# MONTE CARLO 10.000 simulasi — v2 vs v3 vs v4.
# Block bootstrap (potongan trade berurutan) supaya rentetan rugi & rezim pasar ikut terbawa.
import json, numpy as np

D = json.load(open("plans_trades.json"))
PLANS = ["v2", "v3", "v4"]
NAMES = {"v2": "v2 pegang penuh", "v3": "v3 jual 85% di +20%", "v4": "v4 jual 60% + model"}
SIMS, BLOCK, START, FRAC = 10000, 20, 10000.0, 0.02
rng = np.random.default_rng(42)

def seq(plan, periods):
    out = []
    for P in periods:
        t = sorted(D[plan][P], key=lambda x: x["exitBlk"])
        out += [x["ret"] for x in t]
    return np.array(out)

def block_sample(r, horizon, sims):
    n = len(r); nb = int(np.ceil(horizon / BLOCK))
    starts = rng.integers(0, n, size=(sims, nb))
    idx = (starts[:, :, None] + np.arange(BLOCK)[None, None, :]) % n     # potongan melingkar
    return r[idx.reshape(sims, -1)[:, :horizon]]

def simulate(r, horizon):
    res = {k: [] for k in ["final", "maxdd", "streak", "ruin50", "ruin70", "fixed_final", "fixed_min"]}
    CH = 1000
    for c in range(0, SIMS, CH):
        R = block_sample(r, horizon, min(CH, SIMS - c))
        g = np.log1p(FRAC * (R - 1.0))                      # ukuran 2% dari modal berjalan
        cum = np.cumsum(g, axis=1)
        eq = START * np.exp(cum)
        runmax = np.maximum.accumulate(np.concatenate([np.zeros((cum.shape[0], 1)), cum], axis=1), axis=1)[:, 1:]
        dd = 1 - np.exp(cum - runmax)
        res["final"].append(eq[:, -1]); res["maxdd"].append(dd.max(axis=1))
        res["ruin50"].append((eq.min(axis=1) < START * 0.5)); res["ruin70"].append((eq.min(axis=1) < START * 0.3))
        st = np.zeros(R.shape[0]); best = np.zeros(R.shape[0])
        for j in range(R.shape[1]):
            st = np.where(R[:, j] < 1.0, st + 1, 0); best = np.maximum(best, st)
        res["streak"].append(best)
        fx = START + np.cumsum(200.0 * (R - 1.0), axis=1)     # ukuran tetap $200
        res["fixed_final"].append(fx[:, -1]); res["fixed_min"].append(fx.min(axis=1))
    return {k: np.concatenate(v) for k, v in res.items()}

def report(label, periods, horizon):
    print("\n" + "=" * 118)
    print(f"{label} — {horizon} trade, {SIMS:,} simulasi, modal awal ${START:,.0f}, ukuran 2% modal/trade".replace(",", "."))
    print("=" * 118)
    print(f"{'rencana':24s}{'untung di akhir':>16s}{'modal median':>14s}{'terburuk 5%':>13s}{'terbaik 5%':>13s}"
          f"{'DD median':>11s}{'DD buruk 5%':>13s}{'DD>50%':>9s}{'modal<30%':>11s}{'rugi beruntun':>15s}")
    out = {}
    for p in PLANS:
        r = seq(p, periods)
        s = simulate(r, horizon)
        out[p] = s
        print(f"{NAMES[p]:24s}{100*(s['final'] > START).mean():15.1f}%"
              f"{np.median(s['final']):14,.0f}{np.percentile(s['final'], 5):13,.0f}{np.percentile(s['final'], 95):13,.0f}"
              f"{100*np.median(s['maxdd']):10.0f}%{100*np.percentile(s['maxdd'], 95):12.0f}%"
              f"{100*s['ruin50'].mean():8.1f}%{100*s['ruin70'].mean():10.1f}%"
              f"{np.median(s['streak']):8.0f} / {np.percentile(s['streak'], 95):.0f}".replace(",", "."))
    print(f"\n  ukuran TETAP $200/trade:")
    for p in PLANS:
        s = out[p]
        print(f"  {NAMES[p]:22s} untung {100*(s['fixed_final'] > START).mean():5.1f}% | PnL median ${np.median(s['fixed_final'])-START:>9,.0f}"
              f" | terburuk 5% ${np.percentile(s['fixed_final'], 5)-START:>9,.0f} | modal pernah habis {100*(s['fixed_min'] <= 0).mean():.1f}%".replace(",", "."))
    return out

# statistik dasar per rencana
print("STATISTIK PER TRADE (gabungan dua periode)")
for p in PLANS:
    r = seq(p, ["LAMA", "BARU"])
    g = np.log1p(FRAC * (r - 1))
    print(f"  {NAMES[p]:24s} n={len(r)}  win {100*(r > 1).mean():.0f}%  rata2 {100*(r.mean()-1):+.0f}%  median {100*(np.median(r)-1):+.0f}%"
          f"  pertumbuhan geometrik/trade {100*(np.exp(g.mean())-1):+.3f}%")

report("GABUNGAN LAMA+BARU", ["LAMA", "BARU"], 1000)
report("GABUNGAN LAMA+BARU (jangka panjang)", ["LAMA", "BARU"], 5000)
report("HANYA PERIODE LAMA", ["LAMA"], 1000)
report("HANYA PERIODE BARU", ["BARU"], 1000)

# i.i.d. (trade diacak satu-satu) sebagai pembanding: menunjukkan seberapa besar risiko yang tersembunyi
BLOCK = 1
report("PEMBANDING: acak satu-satu (meremehkan rentetan rugi)", ["LAMA", "BARU"], 1000)
