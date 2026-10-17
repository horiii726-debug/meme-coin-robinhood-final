# RHC — panduan untuk Claude Code

Bot paper trading sniping memecoin Uniswap v4 di Robinhood Chain (chainId 4663). File ini dimuat otomatis — **jangan dibaca ulang**. Semua fakta inti ada di sini; file lain hanya dibuka kalau tugasnya butuh.

## Lingkungan
- **PC Windows biasa**, bukan VPS. Folder proyek: `C:\Users\horii\rhc-quant\rhc_vps` (sudah terbongkar — jangan bongkar arsip `.tar.gz`).
- Skrip `.sh` jalan di Git Bash. Node 24, Python 3.13 (+ catboost, scikit-learn).
- **Koneksi rumah Indonesia:** DNS dibajak ISP → RPC wajib lewat DoH (`DOH_URL` di `bot/.env` sudah terisi). RPC gratis sering `Too Many Requests` — beri jeda, jangan banjiri.
- **Disk terbatas (±14 GB bebas).** Data mentah diproses per potongan lalu dihapus. Jangan unduh lebih dari ±5 GB sekaligus.
- **CPU terbatas:** maksimal 2 pekerjaan berat (replay, latih model, unduh) berjalan bersamaan.
- Bot dijalankan dengan `bot/jalankan_windows.ps1` (penjaga + deteksi hang). `pm2`, `cek_sehat.sh`, `DEPLOY_VPS.md` hanya untuk VPS nanti.

## Cara bicara dengan pemilik
- Bahasa Indonesia, singkat, langsung ke angka. Bahasa sederhana kalau diminta.
- Grafik: Matplotlib, gaya tear sheet quant, latar gelap, garis Monte Carlo beda warna.
- Hasil utama selalu dari data on-chain nyata. Monte Carlo = **proyeksi**, wajib diberi label.

## Aturan yang tidak boleh dilanggar
- **Mode kertas saja.** Tidak ada transaksi uang asli, dompet, atau kunci privat.
- **Jangan ubah setelan strategi** (`bot/.env`, aturan di `v4engine.js`) tanpa diminta pemilik; setiap perubahan lolos uji maju dulu (`pipeline/wf_penuh.sh`).
- **Tidak boleh melihat masa depan.** Fitur hanya dari data ≤ `init+600`. Model hanya dilatih dari trade yang sudah tutup sebelum koin yang dinilai; model keluar tiap periode hanya dari periode sebelumnya. Jangan menguji model di data latihnya sendiri — kesalahan ini pernah membuat hasil palsu.
- **Parameter dipilih di satu periode, dibuktikan di periode lain.** Memilih angka karena hasilnya terbesar = overfitting.
- **Semua trade dihitung**, termasuk yang habis total.
- Alamat kontrak dari `dok_lama/config.toml` (terverifikasi on-chain), bukan dari ingatan. Kunci API di variabel lingkungan, jangan di-commit.

## Hasil yang berlaku (satu-satunya sumber angka)
Uji maju 2 Ags – 17 Sep, bot mulai dari nol: **$100 → $11.372,92**, 177 trade, win 75,7%, PF 3,45, drawdown maks 20,4%, 0 posisi > 1% likuiditas pool, ±148 jam pasar. (Angka lama $12.746 salah: gas periode Agustus–10 Sep dihitung proporsional — dikoreksi 4 Okt.)

| Periode | Trade | Untung |
|---|---|---|
| 2 & 19–20 Ags | 0 (model belum siap) | $0 |
| ±5 Sep | 18 | −$5,54 |
| ±10 Sep | 25 | +$11 |
| 13–15 Sep | 84 | +$7.438 |
| 16–17 Sep | 50 | +$3.829 |

**Uji holdout Oktober 1–2** (data baru, strategi & model beku sejak 17 Sep, mesin Rust): **$100 → $208,70**, 50 trade, win 72%, PF 5,88, DD 5,1% — padahal v4 mentah di rezim itu rugi (PF 0,76, rug 29,9%). AUC filter turun 0,80 → 0,64; model tidak bisa memprediksi rug di Oktober (AUC 0,47).
Variasi seed CatBoost di Ags–Sep: $11.373–$16.394 (5 seed) — satu angka equity bukan kepastian.

**Referensi `Downloads/Robinhood_Chain_MemeCoin_Quant_Spec.md` sudah diuji 4 Okt — semua tambahan DITOLAK** (jangan ulangi tanpa data baru):
- 57 fitur orderflow bagian 1–10 (Rust: `rust/port_features/src/orderflow.rs`, `bin/feat_flow`): ablation per kelompok tidak menaikkan avg ret top-10%; semua sekaligus median $11.745 vs $14.851.
- Keluar saat momentum melemah / tahan saat kuat (bagian 14; opsi mesin `momMin`, `momHold`, default mati): $4.707–$11.261, DD sampai 53%.
- Veto P(rug) (bagian 12): $4.692–$6.547. Jalur roket P(≥2×): menang di Ags–Sep, kalah di Oktober ($151–$179, DD 16–21%).

- Koin dilihat 2.797 → dibeli 177 (ditolak ML 2.429, honeypot 120, model belum siap 70).
- (Alasan keluar & Monte Carlo di bawah masih dari run 178 trade sebelum koreksi gas.)
- Alasan keluar: model bahaya 125 trade +$16.505; **batas 9 jam 30 trade −$3.703 (kebocoran terbesar)**; dump likuiditas 9 −$246; stop −40% 7 −$145.
- Roket (cek 4 Okt, puncak harga nyata dari swap, likuiditas di puncak $19k–$430k): koin ≥11× dalam 9 jam — Ags–Sep 61, dibeli 1 (0,52×); Okt 19, dibeli 2. **Saringan ML menolak 57 dari 61** — skor roket di persentil ±40% (koin 2× di ±70%), karena label `ret > 1` memilih pemenang kecil yang aman. Aturan keluar v4 juga menjual roket terlalu cepat: 19 roket Oktober (puncak rata-rata 19×) hanya terealisasi rata-rata 1,93× (median 1,71×) — "model bahaya" keluar di 2–5× (hanya sesekali menahan, mis. 40,1× di m2). Aturan honeypot (belum ada penjual di menit-1) menolak 7 dari 19. Andai 19 itu dibeli (melihat masa depan): $100 → $114,86 aturan persis; $491 dengan 10%/posisi.
- **Forensik roket (4 Okt, `data_b/forensik*.jsonl`, `tahan_semua.csv`):** roket nyata (bertahan ≥11× ≥30 dtk: 53/61 Ags–Sep, 16/19 Okt) tapi pump-dump cepat (di atas ½ puncak median 5 mnt Ags–Sep), koreksi median 43% sebelum puncak, puncak median menit ke-60 (Ags–Sep) / 34 (Okt). Sidik menit-1 konsisten 2 periode: SEPI — swap, pembeli, holder, kenaikan harga, swap/pembeli lebih rendah; kepemilikan lebih terkonsentrasi. Koin 4–6 swap di menit-1: rasio roket 2–5× lebih tinggi. Diuji & DITOLAK (kalah di Ags–Sep): model roket CatBoost (AUC Okt 0,28–0,49), jalur sepi 2% (Kelly campur/pisah), moon bag 20% v2, tanpa aturan honeypot.
- **Rem rezim (kandidat, belum dipasang — tunggu pemilik):** `REMREZIM=1.5 MKTPRE=…` di arena — ukuran ×0,5 kalau rug 100 koin terakhir > 1,5× rata2 panjang. Ags–Sep −4% hasil, DD lebih kecil 2/3 seed; Okt resmi $142 (vs $209); Okt Kelly hangat $125 (vs $91,60, DD 23% vs 36%).
- Plafon compounding: batas posisi 1% likuiditas pool (pool median ±$20k → posisi maks ±$200) mengikat di atas ±$2.000 equity. Mulai $10.000 di Ags–Sep hanya → $30.212 (3×). Oktober: akun Ags–Sep yang lanjut $11.373 → $13.107 (+15%/29 jam, 100% posisi kena batas); mulai $100 tapi Kelly langsung 10% → $91,60 (−8%, DD 36%) — pemanasan Kelly 2% justru menyelamatkan.
- Monte Carlo (proyeksi, median 1 hari / 1 minggu / 1 bulan): terbaik $415 / $40.817 / $203.858; realistis $161 / $11.055 / $61.187; terburuk (pasar sepi) $117 / $106 / $95 — 52% jalur rugi.
- Angka lain yang pernah muncul ($630, $2.164, $2.661, $7.913, $19.401, $23.569) **tidak sah** — bocor, sintetis, atau sebelum perbaikan audit.

## Bot Rust & VPS (4 Okt 2026)
- **Bot live sekarang Rust:** `rust/rhc-live` (`rhc-live live|sim|unduh|menit1`). Logika keputusan = `bot.rs`; terbukti = backtest: Okt 50/50 koin sama, Ags–Sep 177/177 (setelan resmi) dan Okt 50/50 (AUDIT07). Fitur Rust `port_features`, mesin `port_engine` (parity identik).
- **Setelan VPS = AUDIT07** (`rhc_vps/vps/env.vps`): tutup saat rug, trailing 40%, dump 12%, MAX_POS 5. Lolos semua uji: Ags–Sep $16.291/$18.204/$14.224, Okt $264,69, acak median $11.656 (DD terburuk 5% 33,4%) — lebih baik dari setelan resmi di semua uji.
- Paket VPS: `rhc_vps/vps/` (pasang.sh, systemd bot + penjaga 2 mnt + latih ulang harian bergerbang mutu `pipeline/latih_ulang.py`, BACA_VPS.md). Build Linux belum dites (PC tanpa WSL distro).
- **Radar** (`radar.rs`): semua DEX on-chain (v4, v3+Ramses/Up/Alandale, PancakeSwap-v3/Giga, v2/0swap), semua pasangan kecuali saham; klasifikasi `kelas.rs`: saham Robinhood = BeaconProxy beacon `0xe10b6f…1b00` -> dikecualikan. Radar TIDAK trading. DEX Screener hanya untuk verifikasi (DS=1).
- **RPC publik Robinhood:** ±1 dtk/jawaban, 429 kalau dibebani; getLogs maks 10 juta blok (ber-alamat) / 30.000 blok (tanpa alamat), maks 10.000 log. Radar penuh + trading butuh RPC berbayar/privat.
- Sequencer feed tidak publik (HTTP 400). GMGN menolak (403).
- Waktu blok berubah: ±0,3 dtk sebelum Agustus, ±0,1 dtk sesudahnya (aturan berbasis blok = waktu nyata berbeda di Mei–Juli).

## Peta file — buka hanya kalau perlu
| File / folder | Buka saat |
|---|---|
| `RENCANA_MULTI_AGENT.md` | pemilik minta menjalankan audit multi-agent |
| `STRATEGI_FINAL.md` | butuh detail aturan masuk/keluar/ukuran posisi |
| `CATATAN_AUDIT.md` | butuh daftar temuan audit (sudah & belum diperbaiki) |
| `BACA_DULU.md`, `DEPLOY_VPS.md` | untuk manusia / VPS nanti — **tidak perlu dibaca** |
| `bot/` | `paper_live.js` (bot), `v4engine.js` (mesin — dipakai bot DAN backtest), `filter_feats.js` (34 fitur), `cat_model.js`, 3 model + `*_check.json`, `.env` |
| `pipeline/` | `collect.js`, `replay.js`, `state_rows.js`, `arena.js` (akun), `arena_score.py` (skor ML kausal), `wf_penuh.sh` (uji maju penuh), `mc_pro.js` (Monte Carlo), `viz_pro.py` (grafik) |
| `data/` | 6 periode utuh + `agustus_mentah/` (berlubang, lanjutkan dengan checkpoint) |
| `hasil/` | `uji_maju_final/` (178 trade + alasan keluar), `visual/`, `monte_carlo/`, `paper_live/` |

## Pemeriksaan wajib
- Tiap model punya `*_check.json`; bot menolak jalan kalau JS meleset > 1e-9 dari Python. Jangan dilewati.
- Setelah mengubah `v4engine.js`: replay `data/ags4` harus tetap 75 trade identik dengan `data/ags4/trades.jsonl`.
- `bot/status.json` → `lag_blocks` harus < 300.

## Perintah
```
powershell -ExecutionPolicy Bypass -File bot\jalankan_windows.ps1   # jalankan bot (buat bot\stop.txt untuk menghentikan)
type bot\status.json                                                  # equity, posisi, lag_blocks, mode_aman
cd pipeline && bash wf_penuh.sh                                       # ulang uji maju penuh
```
