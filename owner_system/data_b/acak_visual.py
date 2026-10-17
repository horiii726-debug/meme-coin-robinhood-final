# Analisis + visual UJI JENDELA ACAK (bot Rust, model beku). Semua angka dari simulasi on-chain; rantai acak = PROYEKSI.
import json, os, subprocess, random, re
import numpy as np
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt

os.chdir(os.path.dirname(os.path.abspath(__file__)))
BIN = "C:/Users/horii/rhc-quant/rust/rhc-live/target/release/rhc-live.exe"
A07 = {"TUTUP_SAAT_RUG": "1", "TRAIL_PUNCAK": "0.4", "DUMP_FRAC": "0.12", "MAX_POS": "5"}
J = json.load(open("acak_jendela.json"))
J.append({"nama": "okt1", "dari": 77491976, "sampai": 78519175, "jenis": "ujian murni (sesudah masa latihan)"})
J = [j for j in J if os.path.exists(os.path.join(j["nama"], "transfers.json"))]
J.sort(key=lambda j: j["dari"])
WARNA = ["#4C9BE8", "#E3A33B", "#3FB68B", "#C774E8", "#E5484D", "#2EC4B6", "#F4D35E", "#9AA5B1"]


def sim(j, out, akun_in=None, akun_out=None, cfg=A07, dev=True):
    env = dict(os.environ, **cfg)
    a = [BIN, "sim", j["nama"], str(j["dari"]), str(j["sampai"]), out]
    if dev and j["nama"].startswith(("acak_A", "okt")) and akun_in is None:
        a += ["--devpre", "arena_feats.csv"]
    if akun_in:
        a += ["--akun-in", akun_in]
    if akun_out:
        a += ["--akun-out", akun_out]
    r = subprocess.run(a, env=env, capture_output=True, text=True).stdout
    m = re.search(r"beli (\d+) \| tutup (\d+) \| win ([\d.]+)% \| PF ([\d.inf]+) \| akun \$([\d.]+) -> \$([\d.]+) \| DD maks ([\d.]+)%", r)
    return dict(beli=int(m[1]), win=float(m[3]), pf=m[4], awal=float(m[5]), akhir=float(m[6]), dd=float(m[7])) if m else None


def kurva(out, awal):
    T = sorted((json.loads(l) for l in open(out)), key=lambda t: t["keluar"])
    x = [0.0] + [(t["keluar"]) for t in T]
    y = [awal] + list(awal + np.cumsum([t["kembali"] - t["pos"] for t in T]))
    return x, y


hasil = {}
for j in J:
    for nm, cfg in [("a07", A07), ("resmi", {"MAX_POS": "10"})]:
        o = os.path.join(j["nama"], f"vis_{nm}.jsonl")
        hasil[(j["nama"], nm)] = sim(j, o, cfg=cfg)
print("=== TIAP JENDELA, mulai $100 (bot Rust, model beku) ===")
for j in J:
    a, r = hasil[(j["nama"], "a07")], hasil[(j["nama"], "resmi")]
    print(f'{j["nama"]:8s} {j["jenis"][:22]:22s} | AUDIT07: {a["beli"]:3d} trade win {a["win"]:4.0f}% PF {a["pf"]:>5s} $100 -> ${a["akhir"]:,.2f} DD {a["dd"]:.1f}% | resmi: ${r["akhir"]:,.2f} DD {r["dd"]:.1f}%')

# rantai kronologis (seperti live: akun berlanjut)
def rantai(urut, tag):
    akun, xs, ys, off, batas = None, [], [], 0.0, []
    for k, j in enumerate(urut):
        o = os.path.join(j["nama"], f"rantai_{tag}_{k}.jsonl")
        ao = os.path.join(j["nama"], f"rantai_{tag}_{k}_akun.json")
        r = sim(j, o, akun_in=akun, akun_out=ao, dev=(k == 0))
        x, y = kurva(o, r["awal"])
        x = np.array(x, float)
        x = np.where(x == 0, j["dari"], x)
        x = (x - j["dari"]) / 36000.0 + off  # jam (0,1 dtk/blok)
        xs += list(x)
        ys += y
        off = x.max() if len(x) else off
        batas.append((off, j["nama"]))
        akun = ao
    return np.array(xs), np.array(ys), batas, r["akhir"]


xk, yk, bk, akhir_k = rantai(J, "kron")
print(f"\nRANTAI KRONOLOGIS (seperti live, akun berlanjut): $100 -> ${akhir_k:,.2f}")
rng = random.Random(7)
acak = []
for i in range(20):
    u = J[:]
    rng.shuffle(u)
    acak.append(rantai(u, f"acak{i}"))
fin = np.array([a[3] for a in acak])
print(f"20 RANTAI URUTAN ACAK [PROYEKSI]: median ${np.median(fin):,.0f} | terburuk ${fin.min():,.0f} | terbaik ${fin.max():,.0f} | rugi (<$100) {np.mean(fin < 100) * 100:.0f}%")

# ---------- visual ----------
plt.rcParams.update({"figure.facecolor": "#0B0F14", "axes.facecolor": "#11171E", "axes.edgecolor": "#1E2833", "axes.labelcolor": "#D5DDE5",
                     "xtick.color": "#7F8B97", "ytick.color": "#7F8B97", "text.color": "#D5DDE5", "grid.color": "#1E2833", "font.size": 10, "text.parse_math": False})
fig, ax = plt.subplots(2, 2, figsize=(15, 10))
# 1) hasil per jendela
n = [j["nama"] for j in J]
a = [hasil[(k, "a07")]["akhir"] for k in n]
r = [hasil[(k, "resmi")]["akhir"] for k in n]
xx = np.arange(len(n))
ax[0, 0].bar(xx - 0.2, a, 0.38, color="#3FB68B", label="AUDIT07 (dipakai VPS)")
ax[0, 0].bar(xx + 0.2, r, 0.38, color="#4C9BE8", label="setelan resmi")
ax[0, 0].axhline(100, color="#E5484D", lw=1, ls="--")
ax[0, 0].set_xticks(xx, [k.replace("acak_", "") for k in n])
ax[0, 0].set_title("Tiap jendela acak: $100 -> akhir (mulai dari nol, model beku)")
ax[0, 0].legend(frameon=False)
ax[0, 0].grid(axis="y")
# 2) kurva tiap jendela
for i, j in enumerate(J):
    x, y = kurva(os.path.join(j["nama"], "vis_a07.jsonl"), 100.0)
    x = (np.array(x, float) - j["dari"]) / 36000.0
    x[0] = 0
    ax[0, 1].plot(x, y, color=WARNA[i % len(WARNA)], lw=1.8, label=j["nama"].replace("acak_", ""))
ax[0, 1].axhline(100, color="#E5484D", lw=1, ls="--")
ax[0, 1].set_title("Equity tiap jendela (AUDIT07), jam sejak jendela mulai")
ax[0, 1].legend(frameon=False, ncol=2)
ax[0, 1].grid()
# 3) rantai kronologis
ax[1, 0].plot(xk, yk, color="#E3A33B", lw=2)
for b, nm in bk:
    ax[1, 0].axvline(b, color="#1E2833", lw=1)
    ax[1, 0].text(b, yk.max() * 0.98, nm.replace("acak_", ""), rotation=90, va="top", ha="right", color="#7F8B97", fontsize=8)
ax[1, 0].set_yscale("log")
ax[1, 0].set_title(f"Seperti live: semua jendela berurutan waktu, akun berlanjut ($100 -> ${akhir_k:,.0f})")
ax[1, 0].grid()
# 4) rantai urutan acak
for i, (x, y, _, _) in enumerate(acak):
    ax[1, 1].plot(x, y, color=WARNA[i % len(WARNA)], lw=1, alpha=0.75)
ax[1, 1].set_yscale("log")
ax[1, 1].set_title(f"PROYEKSI: 20 urutan acak jendela (median ${np.median(fin):,.0f}, terburuk ${fin.min():,.0f})")
ax[1, 1].grid()
for a_ in ax.flat:
    a_.set_xlabel("jam" if a_ is not ax[0, 0] else "")
fig.suptitle("Uji jendela acak — bot Rust (kode live), data on-chain Robinhood Chain", fontsize=13)
fig.tight_layout()
fig.savefig("acak_visual.png", dpi=110)
print("visual: acak_visual.png")
