# Compounding penuh: semua rencana x Kelly 1/2, 1/4 x periode (LAMA, BARU, gabungan)
# x (dengan batas likuiditas trade asli | tanpa batas = compounding murni, tidak realistis).
import json, os, numpy as np
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
from matplotlib.ticker import FuncFormatter, NullFormatter, LogLocator
from matplotlib.lines import Line2D

OUT = "C:/Users/horii/rhc-quant/figures"; os.makedirs(OUT, exist_ok=True)
D = json.load(open("plans_trades.json"))
PLANS = ["v2", "v3", "v4"]
LABEL = {"v2": "v2 · pegang penuh", "v3": "v3 · jual 85% di +20%", "v4": "v4 · jual 60% + model"}
TXS = {"v2": 2, "v3": 3, "v4": 3}
COL = {"v2": "#4a94ec", "v3": "#e0683a", "v4": "#1fa674"}
SURF, INK, INK2, MUTED, GRID, AXIS = "#0f100e", "#ecebe6", "#a9a8a1", "#7c7b75", "#262723", "#4a4a45"
START, SIMS, H, BLOCK, GAS = 100.0, 10000, 1000, 20, 0.02
PERIODS = {"LAMA": ["LAMA"], "BARU": ["BARU"], "GABUNGAN": ["LAMA", "BARU"]}
KF = {"1/2": 0.5, "1/4": 0.25}
rng = np.random.default_rng(11)

plt.rcParams.update({
    "font.family": ["Segoe UI", "DejaVu Sans"], "font.size": 9, "text.color": INK, "text.parse_math": False,
    "axes.facecolor": SURF, "figure.facecolor": SURF, "axes.edgecolor": AXIS, "axes.labelcolor": INK2,
    "axes.titlesize": 10, "axes.titleweight": "bold", "axes.titlecolor": INK, "axes.titlelocation": "left",
    "xtick.color": MUTED, "ytick.color": MUTED, "xtick.labelsize": 8, "ytick.labelsize": 8,
    "axes.grid": True, "grid.color": GRID, "grid.linewidth": 0.6, "axes.axisbelow": True,
    "axes.spines.top": False, "axes.spines.right": False, "legend.frameon": False, "legend.fontsize": 8,
})

def money(v, _=None):
    if v <= 0: return "$0"
    for lim, suf in [(1e15, "Q"), (1e12, "T"), (1e9, "B"), (1e6, "M"), (1e3, "K")]:
        if v >= lim:
            x = v / lim
            if x >= 1000: return f"${v:.0e}".replace("e+", "e")
            return f"${x:.0f}{suf}" if x >= 10 else f"${x:.1f}{suf}"
    return f"${v:.0f}" if v >= 1 else f"${v:.2f}"
def pct(v): return f"{100*(v/START-1):+,.0f}%".replace(",", ".")

def seq(p, periods):
    t = []
    for P in periods: t += sorted(D[p][P], key=lambda x: x["exitBlk"])
    ret = np.array([max(x["ret"], 0.0) for x in t]); size = np.array([x["size"] for x in t])
    return ret, size, ret + GAS * TXS[p] / size

def kelly(ret):
    fs = np.linspace(0.001, 0.99, 990)
    return fs[np.argmax([np.mean(np.log(np.maximum(1 + f * (ret - 1), 1e-12))) for f in fs])]
K = {p: kelly(seq(p, ["LAMA", "BARU"])[0]) for p in PLANS}      # f* dari gabungan, dipakai di semua periode

def step(eq, frac, gross, cap, txs):
    pos = np.maximum(frac * eq, np.minimum(1.0, eq))
    if cap is not None: pos = np.minimum(pos, cap)
    pos = np.where(eq >= 0.5, pos, 0.0)
    return np.maximum(eq + np.where(pos > 0, pos * (gross - 1) - GAS * txs, 0.0), 0.0)

def mc(p, periods, frac, capped):
    ret, size, gross = seq(p, periods); n = len(ret)
    starts = rng.integers(0, n, size=(SIMS, int(np.ceil(H / BLOCK))))
    idx = ((starts[:, :, None] + np.arange(BLOCK)) % n).reshape(SIMS, -1)[:, :H]
    eq = np.full(SIMS, START); pk = eq.copy(); mdd = np.zeros(SIMS)
    P = np.zeros((H + 1, 5)); P[0] = START; S = np.zeros((H + 1, 25)); S[0] = START
    for t in range(H):
        j = idx[:, t]
        eq = step(eq, frac, gross[j], size[j] if capped else None, TXS[p])
        pk = np.maximum(pk, eq); mdd = np.maximum(mdd, 1 - eq / np.maximum(pk, 1e-12))
        P[t + 1] = np.percentile(eq, [5, 25, 50, 75, 95]); S[t + 1] = eq[:25]
    return dict(final=eq, mdd=mdd, pct=P, samples=S)

def hist(p, periods, frac, capped):
    ret, size, gross = seq(p, periods)
    e = np.array([START]); out = [START]
    for t in range(len(ret)):
        e = step(e, frac, gross[t:t+1], size[t:t+1] if capped else None, TXS[p]); out.append(e[0])
    out = np.array(out); return out, (1 - out / np.maximum.accumulate(out)).max()

R, HI = {}, {}
for p in PLANS:
    for kn, m in KF.items():
        for per, pl in PERIODS.items():
            for cap in (True, False):
                R[(p, kn, per, cap)] = mc(p, pl, K[p] * m, cap)
                HI[(p, kn, per, cap)] = hist(p, pl, K[p] * m, cap)
        print(p, kn, "selesai")

def logax(ax):
    ax.set_yscale("log"); ax.yaxis.set_major_locator(LogLocator(base=10, numticks=12))
    ax.yaxis.set_major_formatter(FuncFormatter(money)); ax.yaxis.set_minor_formatter(NullFormatter())

# ---------- FIGURE 4: Monte Carlo compounding murni vs dengan batas (gabungan) ----------
fig = plt.figure(figsize=(15, 11.5))
gs = fig.add_gridspec(3, 2, hspace=0.42, wspace=0.16, left=0.07, right=0.97, top=0.88, bottom=0.06)
fig.text(0.07, 0.965, "Figure 4 — Monte Carlo compounding · modal $100 · 1.000 trade · periode gabungan", fontsize=14, weight="bold")
fig.text(0.07, 0.94, "Warna penuh = compounding MURNI (posisi = fraksi Kelly × modal, tanpa batas). Abu-abu = compounding DENGAN batas likuiditas (maks ±$200 / 1% LP per trade).\n"
         "Compounding murni tidak realistis: posisi ribuan dolar di pool kecil akan kena slippage jauh lebih besar dari backtest.", fontsize=8.5, color=INK2, va="top")
x = np.arange(H + 1); axes = []
for r, p in enumerate(PLANS):
    for ci, kn in enumerate(KF):
        ax = fig.add_subplot(gs[r, ci]); axes.append(ax); c = COL[p]
        g = R[(p, kn, "GABUNGAN", True)]["pct"]
        ax.fill_between(x, np.maximum(g[:, 0], 1), g[:, 4], color=MUTED, alpha=0.14, lw=0)
        ax.plot(x, np.maximum(g[:, 2], 1), color=MUTED, lw=1.6, ls=(0, (4, 2)))
        s = R[(p, kn, "GABUNGAN", False)]; P = s["pct"]
        ax.fill_between(x, np.maximum(P[:, 0], 1), P[:, 4], color=c, alpha=0.13, lw=0)
        ax.fill_between(x, np.maximum(P[:, 1], 1), P[:, 3], color=c, alpha=0.28, lw=0)
        for k in range(s["samples"].shape[1]): ax.plot(x, np.maximum(s["samples"][:, k], 1), color=c, lw=0.5, alpha=0.2)
        ax.plot(x, np.maximum(P[:, 2], 1), color=c, lw=2)
        ax.axhline(START, color=MUTED, lw=0.8, ls=(0, (4, 3)))
        logax(ax); ax.set_xlim(0, H)
        mU, mC = np.median(s["final"]), np.median(R[(p, kn, "GABUNGAN", True)]["final"])
        ax.set_title(f"{LABEL[p]}  ·  {kn} Kelly (f = {K[p]*KF[kn]:.1%})")
        ax.annotate(f"murni: median {money(mU)}", xy=(H, P[-1, 2]), xytext=(-4, 6), textcoords="offset points", ha="right", fontsize=8, weight="bold", color=INK)
        ax.annotate(f"dengan batas: {money(mC)}", xy=(H, g[-1, 2]), xytext=(-4, -12), textcoords="offset points", ha="right", fontsize=8, color=INK2)
        ax.text(0.01, 0.97, f"murni: untung {100*(s['final']>START).mean():.1f}% · 5% terburuk {money(np.percentile(s['final'],5))} · DD median {np.median(s['mdd']):.0%}",
                transform=ax.transAxes, va="top", fontsize=7.8, color=INK2)
        if r == 2: ax.set_xlabel("trade ke-")
        if ci == 0: ax.set_ylabel("modal (skala log)")
lo = min(a.get_ylim()[0] for a in axes); hi_ = max(a.get_ylim()[1] for a in axes)
for a in axes: a.set_ylim(max(lo, 10), hi_)
fig.legend(handles=[Line2D([], [], color=INK2, lw=2, label="compounding murni (warna rencana)"),
                    Line2D([], [], color=MUTED, lw=1.6, ls=(0, (4, 2)), label="dengan batas likuiditas")],
           loc="upper right", bbox_to_anchor=(0.97, 0.965), ncol=2)
fig.savefig(f"{OUT}/figure4_compounding_mc.png", dpi=150); plt.close(fig)

# ---------- FIGURE 5: equity historis compounding per periode ----------
fig, axs = plt.subplots(2, 3, figsize=(16, 10), gridspec_kw=dict(hspace=0.3, wspace=0.34, left=0.06, right=0.93, top=0.84, bottom=0.07))
fig.text(0.06, 0.955, "Figure 5 — Equity historis compounding · urutan trade asli · modal $100 per periode", fontsize=14, weight="bold")
fig.text(0.06, 0.925, "Garis penuh = 1/4 Kelly, putus-putus = 1/2 Kelly. Atas: dengan batas likuiditas (realistis). Bawah: compounding murni tanpa batas (tidak realistis). Label = modal akhir 1/4 Kelly.",
         fontsize=8.5, color=INK2)
for ri, cap in enumerate((True, False)):
    for ci, per in enumerate(PERIODS):
        ax = axs[ri, ci]; ends = []
        for p in PLANS:
            for kn, ls in [("1/4", "-"), ("1/2", (0, (4, 2)))]:
                eq, _ = HI[(p, kn, per, cap)]
                ax.plot(np.arange(len(eq)), np.maximum(eq, 1), color=COL[p], lw=2 if kn == "1/4" else 1.3, ls=ls, alpha=1 if kn == "1/4" else 0.75)
            eq, _ = HI[(p, "1/4", per, cap)]; ends.append((max(eq[-1], 1), p, len(eq) - 1))
        ax.axhline(START, color=MUTED, lw=0.8, ls=(0, (4, 3))); logax(ax)
        if per == "GABUNGAN": ax.axvline(len(D["v2"]["LAMA"]), color=AXIS, lw=0.9)
        ax.set_title(f"{per} · {'dengan batas likuiditas' if cap else 'compounding murni'}")
        ax.set_xlim(0, ends[0][2] * 1.0 + 1)
        ends.sort(); prev = None
        lo, hi_ = np.log10(ax.get_ylim()); gap = (hi_ - lo) * 0.07
        for v, p, n in ends:
            yl = np.log10(v)
            if prev is not None and yl - prev < gap: yl = prev + gap
            ax.annotate(f"{p} {money(v)}", xy=(n, v), xytext=(n * 1.02 + 2, 10 ** yl), textcoords="data", fontsize=8, weight="bold",
                        va="center", color=INK, annotation_clip=False, arrowprops=dict(arrowstyle="-", color=COL[p], lw=0.8))
            prev = yl
        if ci == 0: ax.set_ylabel("modal (skala log)")
        if ri == 1: ax.set_xlabel("trade ke-")
fig.legend(handles=[Line2D([], [], color=COL[p], lw=2, label=LABEL[p]) for p in PLANS] +
                   [Line2D([], [], color=INK2, lw=2, label="1/4 Kelly"), Line2D([], [], color=INK2, lw=1.3, ls=(0, (4, 2)), label="1/2 Kelly")],
           loc="upper left", bbox_to_anchor=(0.055, 0.915), ncol=5)
fig.savefig(f"{OUT}/figure5_compounding_equity.png", dpi=150); plt.close(fig)

# ---------- ringkasan ----------
rows = []
for p in PLANS:
    for kn in KF:
        row = {"rencana": LABEL[p], "kelly": kn, "f": K[p] * KF[kn]}
        for per in PERIODS:
            for cap in (True, False):
                tag = f"{per}_{'batas' if cap else 'murni'}"
                s = R[(p, kn, per, cap)]; eq, dd = HI[(p, kn, per, cap)]
                row[f"mc_{tag}"] = float(np.median(s["final"])); row[f"mc_p5_{tag}"] = float(np.percentile(s["final"], 5))
                row[f"mc_dd_{tag}"] = float(np.median(s["mdd"])); row[f"hist_{tag}"] = float(eq[-1]); row[f"hist_dd_{tag}"] = float(dd)
                row[f"n_{per}"] = len(eq) - 1
        rows.append(row)
json.dump({"kelly": K, "rows": rows}, open(f"{OUT}/ringkasan_compounding.json", "w"), indent=1)
for row in rows:
    print(f"\n{row['rencana']} {row['kelly']} (f={row['f']:.1%})")
    for per in PERIODS:
        for cap in ("batas", "murni"):
            t = f"{per}_{cap}"
            print(f"  {per:9s} {cap:6s} MC median {money(row['mc_'+t]):>8s} ({pct(row['mc_'+t])})  p5 {money(row['mc_p5_'+t]):>8s}  DDmed {row['mc_dd_'+t]:.0%} | "
                  f"historis ({row['n_'+per]} trade) {money(row['hist_'+t]):>8s} ({pct(row['hist_'+t])}) DDmaks {row['hist_dd_'+t]:.0%}")
