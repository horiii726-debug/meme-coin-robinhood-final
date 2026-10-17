# Monte Carlo + Kelly (1/2, 1/4) — modal $100 — Figure 1-3 gaya quant.
import json, os, numpy as np
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
from matplotlib.ticker import FuncFormatter, LogLocator, NullFormatter

OUT = "C:/Users/horii/rhc-quant/figures"; os.makedirs(OUT, exist_ok=True)
D = json.load(open("plans_trades.json"))
PLANS = ["v2", "v3", "v4"]
LABEL = {"v2": "v2 · pegang penuh", "v3": "v3 · jual 85% di +20%", "v4": "v4 · jual 60% + model"}
TXS = {"v2": 2, "v3": 3, "v4": 3}
# palet referensi (tervalidasi all-pairs untuk 3 slot pertama)
COL = {"v2": "#4a94ec", "v3": "#e0683a", "v4": "#1fa674"}
SURF, INK, INK2, MUTED, GRID, AXIS = "#0f100e", "#ecebe6", "#a9a8a1", "#7c7b75", "#262723", "#4a4a45"
START, SIMS, H, BLOCK, GAS = 100.0, 10000, 1000, 20, 0.02
rng = np.random.default_rng(7)

plt.rcParams.update({
    "font.family": ["Segoe UI", "DejaVu Sans"], "font.size": 9, "text.color": INK,
    "axes.facecolor": SURF, "figure.facecolor": SURF, "axes.edgecolor": AXIS, "axes.labelcolor": INK2,
    "axes.titlesize": 10, "axes.titleweight": "semibold", "axes.titlecolor": INK, "axes.titlelocation": "left",
    "xtick.color": MUTED, "ytick.color": MUTED, "xtick.labelsize": 8, "ytick.labelsize": 8,
    "axes.grid": True, "grid.color": GRID, "grid.linewidth": 0.6, "axes.axisbelow": True,
    "text.parse_math": False, "axes.spines.top": False, "axes.spines.right": False, "legend.frameon": False, "legend.fontsize": 8,
})
def money(v, _=None):
    if v >= 1e9: return f"${v/1e9:.0f}B" if v/1e9 >= 10 else f"${v/1e9:.1f}B"
    if v >= 1e6: return f"${v/1e6:.0f}M" if v/1e6 >= 10 else f"${v/1e6:.1f}M"
    if v >= 1e3: return f"${v/1e3:.0f}K" if v/1e3 >= 10 else f"${v/1e3:.1f}K"
    return f"${v:.0f}" if v >= 1 else f"${v:.2f}"

def seq(p):
    t = sorted(D[p]["LAMA"], key=lambda x: x["exitBlk"]) + sorted(D[p]["BARU"], key=lambda x: x["exitBlk"])
    ret = np.array([max(x["ret"], 0.0) for x in t])
    size = np.array([x["size"] for x in t])
    gross = ret + GAS * TXS[p] / size               # nilai jual per $1 posisi, sebelum gas
    return ret, size, gross, len(D[p]["LAMA"])

def kelly(ret):
    fs = np.linspace(0.001, 0.99, 990)
    g = np.array([np.mean(np.log(np.maximum(1 + f * (ret - 1), 1e-12))) for f in fs])
    return fs[g.argmax()], g.max()

def step(eq, frac, gross, cap, txs):
    pos = np.minimum(np.maximum(frac * eq, np.minimum(1.0, eq)), cap)   # minimal $1 selama modal masih ada
    pos = np.where(eq >= 0.5, pos, 0.0)                                 # modal < $0,50 = bangkrut
    return np.maximum(eq + np.where(pos > 0, pos * (gross - 1) - GAS * txs, 0.0), 0.0)

def mc(p, frac):
    ret, size, gross, _ = seq(p); n = len(ret)
    starts = rng.integers(0, n, size=(SIMS, int(np.ceil(H / BLOCK))))
    idx = ((starts[:, :, None] + np.arange(BLOCK)) % n).reshape(SIMS, -1)[:, :H]
    eq = np.full(SIMS, START); peak = eq.copy(); mdd = np.zeros(SIMS); mn = eq.copy()
    pct = np.zeros((H + 1, 5)); pct[0] = START
    samples = np.zeros((H + 1, 30)); samples[0] = START
    for t in range(H):
        j = idx[:, t]
        eq = step(eq, frac, gross[j], size[j], TXS[p])
        peak = np.maximum(peak, eq); mdd = np.maximum(mdd, 1 - eq / np.maximum(peak, 1e-12)); mn = np.minimum(mn, eq)
        pct[t + 1] = np.percentile(eq, [5, 25, 50, 75, 95]); samples[t + 1] = eq[:30]
    return dict(final=eq, mdd=mdd, min=mn, pct=pct, samples=samples)

def hist_path(p, frac):
    ret, size, gross, nL = seq(p)
    eq = [START]; e = np.array([START])
    for t in range(len(ret)):
        e = step(e, frac, gross[t:t+1], size[t:t+1], TXS[p]); eq.append(e[0])
    eq = np.array(eq); dd = 1 - eq / np.maximum.accumulate(eq)
    return eq, dd, nL

# ---------------- hitung ----------------
K, R, HP = {}, {}, {}
for p in PLANS:
    fstar, g = kelly(seq(p)[0]); K[p] = fstar
    for name, m in [("1/2", 0.5), ("1/4", 0.25)]:
        R[(p, name)] = mc(p, fstar * m)
        HP[(p, name)] = hist_path(p, fstar * m)
    print(f"{p}: Kelly penuh f*={fstar:.3f} -> 1/2={fstar/2:.3f}, 1/4={fstar/4:.3f}")

# ---------------- FIGURE 1: Monte Carlo ----------------
fig = plt.figure(figsize=(15, 11.5))
gs = fig.add_gridspec(3, 3, width_ratios=[1.15, 1.15, 0.8], hspace=0.42, wspace=0.22, left=0.07, right=0.97, top=0.9, bottom=0.06)
fig.text(0.07, 0.965, "Figure 1 — Monte Carlo 10.000 simulasi · modal awal $100 · 1.000 trade", fontsize=14, weight="semibold", color=INK)
fig.text(0.07, 0.94, "Block bootstrap (potongan 20 trade berurutan) dari 813 trade backtest, jeda eksekusi 3 detik. Ukuran posisi = fraksi Kelly × modal, "
         "dibatasi likuiditas trade aslinya; gas $0,02/transaksi. Pita = persentil 5–95 dan 25–75; garis tebal = median.", fontsize=8.5, color=INK2)
x = np.arange(H + 1)
fan_axes = []
for r, p in enumerate(PLANS):
    c = COL[p]
    for ci, name in enumerate(["1/2", "1/4"]):
        ax = fig.add_subplot(gs[r, ci]); fan_axes.append(ax)
        s = R[(p, name)]; P = s["pct"]
        ax.fill_between(x, np.maximum(P[:, 0], 0.5), P[:, 4], color=c, alpha=0.13, lw=0)
        ax.fill_between(x, np.maximum(P[:, 1], 0.5), P[:, 3], color=c, alpha=0.28, lw=0)
        for k in range(s["samples"].shape[1]):
            ax.plot(x, np.maximum(s["samples"][:, k], 0.5), color=c, lw=0.5, alpha=0.22)
        ax.plot(x, np.maximum(P[:, 2], 0.5), color=c, lw=2.0)
        ax.axhline(START, color=MUTED, lw=0.8, ls=(0, (4, 3)))
        ax.set_yscale("log"); ax.yaxis.set_major_formatter(FuncFormatter(money)); ax.yaxis.set_minor_formatter(NullFormatter())
        ax.set_xlim(0, H)
        med, p5, p95 = np.median(s["final"]), np.percentile(s["final"], 5), np.percentile(s["final"], 95)
        ax.set_title(f"{LABEL[p]}  ·  {name} Kelly (f = {K[p]*(0.5 if name=='1/2' else 0.25):.1%})", color=INK)
        ax.annotate(f"median {money(med)}", xy=(H, max(P[-1, 2], 0.5)), xytext=(-4, 6), textcoords="offset points", ha="right", fontsize=8, color=INK, weight="semibold")
        ax.text(0.01, 0.97, f"untung di akhir: {100*(s['final']>START).mean():.1f}%\n5% terburuk: {money(p5)}  ·  5% terbaik: {money(p95)}",
                transform=ax.transAxes, va="top", fontsize=7.8, color=INK2)
        if r == 2: ax.set_xlabel("trade ke-")
        if ci == 0: ax.set_ylabel("modal (skala log)")
    # sebaran drawdown maksimum
    ax = fig.add_subplot(gs[r, 2])
    bins = np.linspace(0, 1, 41)
    for name, ls in [("1/2", "-"), ("1/4", (0, (3, 2)))]:
        md = R[(p, name)]["mdd"]
        h, _ = np.histogram(md, bins=bins, density=False)
        ax.step(bins[:-1] * 100, h / SIMS * 100, where="post", color=c, lw=2 if name == "1/2" else 1.6, ls=ls,
                label=f"{name} Kelly · median {np.median(md):.0%}, 5% terburuk {np.percentile(md,95):.0%}")
    ax.set_xlim(0, 100); ax.set_xlabel("drawdown maksimum (%)"); ax.set_ylabel("% simulasi")
    ax.set_ylim(0, ax.get_ylim()[1] * 1.45)
    ax.set_title("Sebaran drawdown maksimum", color=INK); ax.legend(loc="upper left", handlelength=2.2)
ymin = min(a.get_ylim()[0] for a in fan_axes); ymax = max(a.get_ylim()[1] for a in fan_axes)
for a in fan_axes: a.set_ylim(max(ymin, 1), ymax)            # skala sama agar adil dibandingkan
fig.savefig(f"{OUT}/figure1_montecarlo.png", dpi=150); plt.close(fig)

# ---------------- FIGURE 2: equity historis & underwater ----------------
fig, axs = plt.subplots(2, 2, figsize=(15, 9), gridspec_kw=dict(height_ratios=[1.6, 1], hspace=0.32, wspace=0.18, left=0.07, right=0.93, top=0.87, bottom=0.07), sharex=True)
fig.text(0.07, 0.955, "Figure 2 — Equity historis (urutan trade asli) · modal awal $100", fontsize=14, weight="semibold")
fig.text(0.07, 0.925, "Satu jalur nyata dari backtest: periode LAMA (175 trade) lalu BARU (638 trade). Atas: modal, skala log. Bawah: jarak dari puncak modal (underwater).",
         fontsize=8.5, color=INK2)
for ci, name in enumerate(["1/2", "1/4"]):
    ax, axd = axs[0, ci], axs[1, ci]
    ends = []
    for p in PLANS:
        eq, dd, nL = HP[(p, name)]
        ax.plot(np.arange(len(eq)), np.maximum(eq, 0.5), color=COL[p], lw=2, label=LABEL[p])
        axd.plot(np.arange(len(dd)), -dd * 100, color=COL[p], lw=1.4)
        ends.append((eq[-1], p))
    for a in (ax, axd):
        a.axvline(nL, color=AXIS, lw=0.9)
    ax.text(nL + 6, 0.02, "LAMA | BARU", transform=ax.get_xaxis_transform(), fontsize=7.5, color=MUTED)
    ax.axhline(START, color=MUTED, lw=0.8, ls=(0, (4, 3)))
    ax.set_yscale("log"); ax.yaxis.set_major_formatter(FuncFormatter(money)); ax.yaxis.set_minor_formatter(NullFormatter())
    ax.set_title(f"Modal — {name} Kelly"); ax.set_ylabel("modal (skala log)")
    # label langsung di ujung garis, dijaga tidak bertabrakan
    ends.sort(); prev = None
    for v, p in ends:
        yv = max(v, 0.5)
        if prev is not None and yv / prev < 1.6: yv = prev * 1.6
        ax.annotate(f"{p}  {money(v)}", xy=(len(HP[(p, name)][0]) - 1, max(v, 0.5)), xytext=(len(HP[(p, name)][0]) + 8, yv),
                    textcoords="data", fontsize=8, color=INK, weight="semibold", va="center",
                    arrowprops=dict(arrowstyle="-", color=COL[p], lw=0.8))
        prev = yv
    axd.set_title(f"Underwater — {name} Kelly"); axd.set_ylabel("dari puncak (%)"); axd.set_xlabel("trade ke-"); axd.set_ylim(-100, 2)
    ax.set_xlim(0, len(HP[("v2", name)][0]) + 1)
axs[0, 0].legend(loc="upper left")
fig.savefig(f"{OUT}/figure2_equity.png", dpi=150); plt.close(fig)

# ---------------- FIGURE 3: tabel ringkasan ----------------
rows = []
for p in PLANS:
    for name, m in [("1/2", 0.5), ("1/4", 0.25)]:
        s = R[(p, name)]; eq, dd, _ = HP[(p, name)]
        rows.append([LABEL[p], f"{name}", f"{K[p]:.1%}", f"{K[p]*m:.1%}",
                     f"{100*(s['final']>START).mean():.1f}%", money(np.median(s['final'])), money(np.percentile(s['final'],5)),
                     money(np.percentile(s['final'],95)), f"{np.median(s['mdd']):.0%}", f"{np.percentile(s['mdd'],95):.0%}",
                     f"{100*(s['min']<START*0.5).mean():.1f}%", f"{100*(s['min']<START*0.1).mean():.2f}%", money(eq[-1]), f"{dd.max():.0%}"])
hdr = ["rencana", "Kelly", "f* penuh", "f dipakai", "untung\ndi akhir", "modal\nmedian", "5%\nterburuk", "5%\nterbaik",
       "DD\nmedian", "DD 5%\nterburuk", "pernah\n<$50", "pernah\n<$10", "historis\nakhir", "historis\nDD maks"]
fig, ax = plt.subplots(figsize=(15, 3.9)); ax.axis("off")
fig.text(0.02, 0.93, "Figure 3 — Ringkasan · modal $100 · 1.000 trade · 10.000 simulasi", fontsize=14, weight="semibold")
tb = ax.table(cellText=rows, colLabels=hdr, loc="center", cellLoc="right", colLoc="right", bbox=[0, 0, 1, 0.82])
tb.auto_set_font_size(False); tb.set_fontsize(8.5)
for (i, j), cell in tb.get_celld().items():
    cell.set_edgecolor(GRID); cell.set_linewidth(0.6); cell.set_facecolor(SURF)
    if i == 0: cell.set_text_props(color=INK2, weight="semibold"); cell.set_height(cell.get_height() * 1.5)
    cell.set_width(0.16 if j == 0 else 0.84 / 13)
    if j == 0: cell.set_text_props(ha="left", color=INK, weight="semibold"); cell._loc = "left"
fig.savefig(f"{OUT}/figure3_ringkasan.png", dpi=150, bbox_inches="tight"); plt.close(fig)

json.dump({"kelly": K, "rows": rows, "hdr": [h.replace("\n", " ") for h in hdr]}, open(f"{OUT}/ringkasan.json", "w"), indent=1)
print("\n" + " | ".join(h.replace("\n", " ") for h in hdr))
for rr in rows: print(" | ".join(rr))
print(f"\nfigur tersimpan di {OUT}")
