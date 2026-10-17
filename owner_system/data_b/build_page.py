import json, base64
OUT = "C:/Users/horii/AppData/Local/Temp/claude/C--Users-horii/d3c68c69-721e-4a96-9ee3-703ba452c3f6/scratchpad/rhc_hasil.html"
IMG = lambda n: "data:image/png;base64," + base64.b64encode(open(f"viz/{n}.png", "rb").read()).decode()
T = json.load(open("trade_final178_lengkap.json"))
MC = {s: json.load(open(f"mc_pro_{s}.json")) for s in ["terbaik", "realistis", "terburuk"]}
MAP = {"model bahaya": "Model bahaya", "akhir data": "Batas 9 jam", "dump >=5% LP": "Dump likuiditas",
       "stop -40%": "Stop −40%", "tanda pucuk": "Tanda pucuk", "beli gagal": "Beli gagal",
       "tanpa swap setelah masuk": "Pool mati"}
PER = {"u_ds5d": "±5 Sep", "u_ds24": "±10 Sep", "m1": "13–15 Sep", "m2": "16–17 Sep"}


def usd(v):
    return ("−" if v < 0 else "") + f"${abs(v):,.0f}"


rows = []
for t in T:
    cls = "up" if t["pnl"] > 0 else "dn"
    tanda = "+" if t["pnl"] > 0 else ""
    rows.append(
        f'<tr><td>{t["no"]}</td><td>{PER.get(t["ds"], t["ds"])}</td><td class="mono">{t["pool"][:10]}…</td>'
        f'<td>{t["skor"]:.3f}</td><td>${t["posisi"]:,.2f}</td><td>{t["jam"]:.1f} j</td>'
        f'<td class="{cls}">{(t["ret"] - 1) * 100:+.1f}%</td><td class="{cls}">{tanda}{usd(t["pnl"])}</td>'
        f'<td>{MAP.get(t["keluar"], t["keluar"])}</td></tr>')


def row(nm, s, cls):
    c = ""
    for h in ["h1", "h7", "h30"]:
        v = MC[s][h]
        c += f'<td>{usd(v["min"])}</td><td class="{cls}"><b>{usd(v["med"])}</b></td><td>{usd(v["max"])}</td>'
    d = MC[s]["dd"]
    return (f'<tr><th>{nm}</th>{c}<td>{MC[s]["h30"]["rugi"]}%</td>'
            f'<td>{d["med"] * 100:.0f}%</td><td>{MC[s]["stop"]}%</td></tr>')


tab = row("Terbaik", "terbaik", "up") + row("Realistis", "realistis", "acc") + row("Terburuk", "terburuk", "dn")

CSS = """
:root{--bg:#0B0F14;--panel:#11171E;--line:#1E2833;--ink:#D5DDE5;--mut:#7F8B97;--up:#3FB68B;--dn:#E5484D;--acc:#E3A33B;
--mono:'IBM Plex Mono',ui-monospace,Menlo,monospace;--sans:'IBM Plex Sans',system-ui,sans-serif;color-scheme:dark}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--ink);font-family:var(--sans);font-size:14px;line-height:1.55}
.w{max-width:1200px;margin:0 auto;padding-block:32px 56px;padding-left:18px;padding-right:18px}
.eb{font-family:var(--mono);font-size:11px;letter-spacing:.14em;text-transform:uppercase;color:var(--mut);margin:0 0 6px}
h1{font-size:clamp(24px,4vw,34px);margin:0 0 18px;font-weight:600;letter-spacing:-.01em;text-wrap:balance}
h2{font-size:17px;font-weight:600;margin:0 0 4px}
p{margin:0 0 10px;color:#A8B3BE;max-width:78ch}
.note{font-size:12.5px;color:var(--mut)}
.kpi{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:1px;background:var(--line);border:1px solid var(--line);border-radius:6px;overflow:hidden;margin-bottom:34px}
.kpi div{background:var(--panel);padding:14px 16px}
.kpi .k{font-family:var(--mono);font-size:10.5px;letter-spacing:.1em;text-transform:uppercase;color:var(--mut)}
.kpi .v{font-family:var(--mono);font-size:22px;font-weight:600;font-variant-numeric:tabular-nums;margin-top:3px}
section{margin-bottom:38px}
img{display:block;width:100%;height:auto;max-width:100%;border:1px solid var(--line);border-radius:6px;margin-top:12px}
.tw{overflow-x:auto;border:1px solid var(--line);border-radius:6px;margin-top:12px}
table{border-collapse:collapse;width:100%;background:var(--panel);font-variant-numeric:tabular-nums}
th,td{padding:8px 11px;border-bottom:1px solid var(--line);text-align:right;font-family:var(--mono);font-size:12.5px;white-space:nowrap}
thead th{font-size:10.5px;letter-spacing:.08em;text-transform:uppercase;color:var(--mut);font-weight:500;background:#0E141A;position:sticky;top:0}
tbody th{text-align:left;font-family:var(--sans);font-weight:600}
.mono{text-align:left}
td:last-child{text-align:left;font-family:var(--sans)}
.up{color:var(--up)} .dn{color:var(--dn)} .acc{color:var(--acc)}
.scroll{max-height:520px;overflow:auto}
ul{margin:8px 0 0;padding-left:18px;color:#A8B3BE}
li{margin-bottom:5px;max-width:78ch}
li b{color:var(--ink)}
.tag{display:inline-block;font-family:var(--mono);font-size:10px;letter-spacing:.1em;text-transform:uppercase;padding:2px 7px;border-radius:3px;margin-left:8px;vertical-align:2px}
.t-real{background:rgba(227,163,59,.14);color:var(--acc);border:1px solid #6B4E1F}
.t-sim{background:rgba(76,155,232,.14);color:#4C9BE8;border:1px solid #274B6D}
"""

html = f"""<title>Hasil Strategi RHC</title>
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500;600&family=IBM+Plex+Sans:wght@400;500;600&display=swap">
<style>{CSS}</style>
<div class="w">
<p class="eb">Robinhood Chain · Uniswap v4 · uji maju 2 Agustus – 17 September 2026</p>
<h1>Hasil Strategi RHC</h1>
<div class="kpi">
<div><div class="k">Modal → akhir</div><div class="v acc">$100 → $12.746</div></div>
<div><div class="k">Trade</div><div class="v">178</div></div>
<div><div class="k">Win rate</div><div class="v up">75,8%</div></div>
<div><div class="k">Profit factor</div><div class="v">3,72</div></div>
<div><div class="k">Drawdown maks</div><div class="v dn">20,0%</div></div>
<div><div class="k">Jam pasar</div><div class="v">±148</div></div>
</div>

<section><h2>Equity nyata<span class="tag t-real">data on-chain</span></h2>
<p>Bot mulai dari nol tanpa pengalaman; model hanya belajar dari masa lalu. Dua periode awal = masa belajar.</p>
<img src="{IMG('01_equity_nyata')}" alt="Kurva equity 178 trade dan drawdown"></section>

<section><h2>Setiap trade<span class="tag t-real">data on-chain</span></h2>
<img src="{IMG('02_setiap_trade')}" alt="Return setiap trade menurut alasan keluar">
<img src="{IMG('04_sebaran_return')}" alt="Sebaran return per trade"></section>

<section><h2>Alasan keluar<span class="tag t-real">data on-chain</span></h2>
<p><b style="color:var(--dn)">Kebocoran terbesar:</b> 30 posisi tertahan sampai batas 9 jam rugi −$3.703 — koin sepi yang mati pelan tanpa memicu sinyal jual.</p>
<img src="{IMG('03_alasan_keluar')}" alt="Jumlah dan untung rugi per alasan keluar"></section>

<section><h2>Skenario 1 hari · 1 minggu · 1 bulan<span class="tag t-sim">proyeksi</span></h2>
<p>Monte Carlo 10.000 jalur dari 178 trade nyata di atas — hanya urutan jam pasar yang diacak. Aturan akun persis bot: 1/4 Kelly (maks 10%), compounding, posisi maks 1% likuiditas pool, maks 50% equity, rem bertahap, stop darurat 60%.</p>
<div class="tw"><table>
<thead><tr><th style="text-align:left">Skenario</th><th>1 hari<br>terburuk</th><th>tengah</th><th>terbaik</th><th>1 minggu<br>terburuk</th><th>tengah</th><th>terbaik</th><th>1 bulan<br>terburuk</th><th>tengah</th><th>terbaik</th><th>Rugi<br>1 bulan</th><th>DD<br>tengah</th><th>Kena stop<br>darurat</th></tr></thead>
<tbody>{tab}</tbody></table></div>
<p class="note" style="margin-top:8px">Terbaik = pasar seramai 13–17 Sep, biaya backtest. Realistis = campuran 4 periode berbobot sama, biaya +5% per trade &amp; gas 2×. Terburuk = pasar sesepi ±5 &amp; ±10 Sep, biaya +10% per trade &amp; gas 3×.</p>
<img src="{IMG('05_mc_1hari')}" alt="Monte Carlo 1 hari">
<img src="{IMG('06_mc_1minggu')}" alt="Monte Carlo 1 minggu">
<img src="{IMG('07_mc_1bulan')}" alt="Monte Carlo 1 bulan">
<img src="{IMG('08_mc_akhir_dd')}" alt="Sebaran hasil akhir dan drawdown"></section>

<section><h2>Semua koin yang dibeli<span class="tag t-real">data on-chain</span></h2>
<p>178 trade — tidak ada yang dibuang, termasuk yang habis total.</p>
<div class="tw scroll"><table>
<thead><tr><th>#</th><th>Periode</th><th style="text-align:left">Pool</th><th>Skor ML</th><th>Posisi</th><th>Pegang</th><th>Return</th><th>Untung/rugi</th><th style="text-align:left">Keluar karena</th></tr></thead>
<tbody>{"".join(rows)}</tbody></table></div></section>

<section><h2>Biar makin yakin</h2>
<ul>
<li><b>Paper live 2 minggu di VPS</b> — kalau hasilnya mendekati uji maju, sistemnya jujur.</li>
<li><b>Tambah data ke ±1.000 trade</b> — sekarang 178; win rate masih bisa meleset ±6%.</li>
<li><b>Tutup kebocoran batas 9 jam</b> — keluar lebih cepat dari koin yang berhenti bergerak.</li>
<li><b>Perbaiki 4 asumsi optimis</b> — penjualan kita belum menggerakkan harga, antrean nonce, posisi order jual dalam blok, gas konstan.</li>
<li><b>Uang asli mulai kecil</b> ($50–100) setelah mode bayangan membuktikan harga eksekusi nyata.</li>
</ul></section>
<p class="note">Dihitung 19 Sep 2026 · angka proyeksi hanya di bagian bertanda "proyeksi" · belum pernah menyentuh uang asli</p>
</div>"""
open(OUT, "w", encoding="utf8").write(html)
print("halaman ditulis:", round(len(html) / 1024 / 1024, 2), "MB")
