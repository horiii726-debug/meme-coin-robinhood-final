# Agent 12 — Sidik Jari Koin Naik

**Pertanyaan:** adakah tanda di menit pertama (≤ `init+600`) yang membedakan koin yang akan naik >100% setelah kita masuk?

**Cara kerja.** 58 fitur baru dibangun dari swap + transfer + `liq.csv` menit-1 saja, untuk **semua 2.797 koin** (termasuk yang mati total) — modul terpisah `kerja_12/fitur_sidik.py`, `bot/filter_feats.js` tidak disentuh.
**Periode PILIH** (ambang & arah ditetapkan di sini): ags1, ags4, u_ds5d, u_ds24 = 672 koin.
**Periode BUKTI** (tidak pernah dipakai memilih apa pun): m1 = 1.342 koin, m2 = 783 koin.
Label dari data nyata: `ret` koin itu di replay (aturan keluar yang sama dengan bot). ret≥2: 64 / 119 / 51 koin. ret≥5: 11 / 14 / 5 koin.
**Kontrol label diacak: AUC m1 0,54 / m2 0,47 → ≈ 0,50. Uji tidak bocor.**

## Temuan terpenting — bukan fiturnya yang salah, LABELNYA

Filter ML sekarang dilatih pada `win` (ret > 1). Diukur di m1+m2:

| yang diukur | AUC untuk win (ret>1) | AUC untuk ret≥3 | AUC untuk ret≥5 |
|---|---|---|---|
| skor filter produksi sekarang | **0,742** | **0,491** | **0,445** |

Skor produksi **buta total terhadap roket** — bahkan sedikit terbalik. Akibatnya, dari **58 koin yang mencapai ret ≥ 3×** di seluruh garis waktu, bot hanya membeli **1**; dari 30 koin ret ≥ 5× bot membeli **0**. Koin-koin itu duduk di sekitar **median** skor, lalu dibuang saat `QTHR=0.90` memotong 90% terbawah.
(Catatan: CLAUDE.md menulis "2 dari 12 koin >3×"; hitungan saya atas 2.797 koin penuh adalah **1 dari 58**. Definisi semesta perlu disamakan — Agent 7 tolong pastikan.)

Melatih model kedua dengan **fitur lama yang sama persis** tapi label `ret≥2` (kausal, hanya dari trade yang sudah tutup) langsung memberi AUC roket **0,73 (m1) / 0,83 (m2)**. Jadi sebagian besar keuntungan datang dari mengganti label, bukan dari fitur baru.

## Vonis 10 keluarga fitur

Angka: AUC satu-fitur terbaik (PILIH → m1 → m2, label ret≥5) dan Δ AUC model keluarga di atas 33 fitur lama (label ret≥2, m1 / m2).

| # | Keluarga | Definisi singkat | Hipotesis | Hasil | Vonis |
|---|---|---|---|---|---|
| 1 | Buyer acceleration | laju pembeli/detik, turunan 1 & 2, 200 blok awal vs akhir | pembeli makin cepat datang | `ba_rate3` 0,70→0,76→0,76 **tapi ρ=0,88 dgn `n_buy`**. Turunan murni (`ba_d1/d2/slope`) runtuh: 0,52→0,39→0,32. Δ −0,010 / −0,012 | **LEMAH** (jumlah pembeli berguna, percepatannya tidak) |
| 2 | Transaction burst | jarak antar-swap mengecil, burst index, kerapatan maks 50 blok | tx makin rapat = perhatian naik | `gap_mean3` 0,73→0,67→0,78; `burst_max50_frac` 0,63→0,70→0,80; `burst_idx` 0,70→0,63→0,59. ρ hanya 0,44–0,74. **Δ +0,018 / +0,004 (ret≥2) dan +0,018 / +0,022 (ret≥5) — satu-satunya keluarga yang naik di KEDUA periode bukti** | **BERGUNA** |
| 3 | Volume acceleration | volume USD per waktu, turunan 2, kemiringan bin | uang masuk makin deras | `vol_ratio` 0,73 di PILIH → 0,55 / 0,45 di bukti; `vol_accel` malah 0,25 (m2, ret≥2). Δ −0,012 / +0,009 | **LEMAH** |
| 4 | Liquidity growth | LP ditambah/ditarik bersih dari `liq.csv` dalam jendela | LP ikut tumbuh = organik | **TIDAK ADA DATA.** 2.752 / 2.797 pool tidak menerima tambahan LP sama sekali dalam 60 detik pertama; **0 dari 2.797** menarik LP. 45 sisanya menambah dengan jumlah identik. Fitur ini nyaris konstan | **TIDAK BERGUNA** (data tidak ada di chain ini) |
| 5 | Holder acceleration | jumlah holder per sepertiga jendela + turunan | holder bertambah makin cepat | `hold_t3` 0,68→0,78→0,84 **tapi ρ=0,99 dgn `n_holders`**. Suku percepatan (`hold_accel`, `hold_ratio`) gagal: 0,55→0,43→0,39. `hold_growth` (ρ=0,61) lumayan: 0,66→0,79→0,72. Δ −0,008 / +0,004 | **LEMAH** |
| 6 | Wallet independence | pembeli unik, komponen terhubung antar-pembeli, klaster terbesar | banyak dompet mandiri | solo kuat (ret≥5: m1 0,79 / m2 0,92) tapi `n_clusters` ρ=**1,00** dan `clus_max_frac` ρ=**0,99** dgn `n_buyers` — duplikat. Hanya `buyer_uniq_frac` (ρ=0,80) agak baru. Δ −0,000 / −0,010 | **LEMAH** (hampir seluruhnya sudah ada) |
| 7 | Second-wave buyers | pembeli **baru** per sepertiga vs pembeli lama menambah | gelombang kedua = permintaan nyata | `new_t3_frac` untuk ret≥2 bagus & stabil: 0,63→0,61→0,72 (ρ=0,53, informasi baru). Untuk ret≥5 mati: 0,50→0,45→0,48. Δ −0,007 / +0,003 | **LEMAH** (berguna untuk 2×, tidak untuk roket besar) |
| 8 | Price trajectory | pullback dari puncak berjalan, waktu pulih, bentuk pump-pullback-breakout | pola sehat sebelum breakout | Contoh overfitting paling jelas: `traj_convex` 0,68 di PILIH → **0,19 / 0,23** di bukti (terbalik). `traj_pola` hanya menyala di 200/2.797 koin. `traj_dd` bertahan (0,80→0,55→0,56) tapi ρ=0,87 dgn `sell_usd`. Δ **+0,021 / +0,008** (ret≥2), −0,034 / −0,055 (ret≥5) | **LEMAH** (pencocokan bentuk: TIDAK BERGUNA) |
| 9 | Wallet cluster / funding | graf pendanaan, dompet dari sumber sama, masuk berbarengan | organik vs terkoordinasi | **Graf pendanaan: tidak ada data** — transfer ETH asli tidak dikumpulkan; dari transfer token, `fund_src_max` = 0 atau 1 untuk 2.784/2.797 koin. Sisi waktu ada isinya: `fund_frac` 0,60→0,67→0,67 (ret≥2, ρ=0,67), `sync_frac` 0,54→0,59→0,60. Δ −0,000 / −0,003 | **LEMAH** (perlu data transfer ETH dulu) |
| 10 | Dev behavior | porsi dev, transfer dev ke pool/lain, waktu transfer pertama | dev tidak buang = aman | Paling menyesatkan: `dev_share` 0,78 di PILIH → **0,41 / 0,43** di bukti; `dev_first_out` 0,69 → 0,43 / 0,44; `dev_out_frac` 0,58 → 0,22 / 0,29. Arah yang dipilih di periode lama **terbalik** di periode bukti. Δ keluarga **−0,159 / −0,180** (ret≥5) — terburuk | **TIDAK BERGUNA** |

## Usul: jalur roket kedua ("moon lane")

Model **kedua**, kausal (hanya belajar dari trade yang sudah tutup sebelum blok keputusan, dilatih ulang tiap 100 trade), label `ret ≥ 2`, fitur = **33 fitur lama + 4 fitur burst** (`gap_mean1`, `gap_mean3`, `burst_idx`, `burst_max50_frac`). Koin yang gagal di filter untung biasa tetap dibeli kalau skor roketnya di **10% teratas**.

Mutu seleksi (ambang kuantil ditetapkan di periode PILIH, dipakai apa adanya di m1/m2) — ini ukuran yang **tidak** tergantung jalur akun:

| penyaring, 10% teratas | presisi ret≥2 m1 / m2 | recall ret≥2 m1 / m2 | ret rata-rata m1 / m2 |
|---|---|---|---|
| filter produksi (label win) | 30,4% / 22,8% | 34,5% / 35,3% | 1,49 / 1,55 |
| jalur roket, fitur lama saja | 45,7% / 60,9% | 35,3% / 54,9% | 1,51 / 1,70 |
| **jalur roket + burst** | **47,8% / 58,0%** | **37,0% / 56,9%** | **1,65 / 1,69** |
| jalur roket + 21 fitur baru | 42,3% / 63,0% | 37,0% / 56,9% | 1,58 / 1,77 |
| (semua koin, pembanding) | 8,9% / 6,5% | 100% | 1,15 / 1,03 |

Uang (arena, aturan live: `MAXPOS=10 QTHR=0.90 SLIP=1 EXPMAX=0.5 REM=1 LPCAP=0.01`, akun $100):

| MOONQ | sekarang | jalur roket, fitur lama | **+ burst (usul)** | + 21 fitur baru |
|---|---|---|---|---|
| mati | $12.746 | — | — | — |
| 0,80 | | $2.214 | $6.754 | $464 |
| 0,85 | | $12.171 | $17.781 | $9.778 |
| 0,88 | | $11.393 | $19.145 | $16.074 |
| 0,90 | | $17.220 | **$21.623** | $22.106 |
| 0,92 | | $14.381 | $16.159 | $19.609 |
| 0,95 | | $9.770 | $10.994 | $9.370 |
| **menang dari $12.746** | | **2 dari 6** | **5 dari 6** | **3 dari 6** |

Periksa silang (MOONQ=0,90): ukuran tetap 5% ekuitas → $5.717 → **$11.954**; batas 5 posisi (aturan pemilik) → $9.350 → **$11.406**, dan di sini slot memang penuh 150×, jadi prioritas benar-benar terpakai. Roket tertangkap naik dari **1 → 11** (dari 58 koin ret≥3) dan **0 → 2** (dari 30 koin ret≥5); DD maks 20,0% → 21,4%; trade 178 → 236, win turun 75,8% → 64,8%, PF 3,72 → 3,78.

**Peringatan jujur.** Angka dolarnya sangat peka pada ambang: MOONQ=0,80 **merugi** dibanding sekarang. Yang kokoh adalah mutu seleksinya (presisi & ret rata-rata naik di m1 **dan** m2 untuk ketiga varian) dan set fitur burst; angka $21.623 sendiri jangan dianggap hasil sah sebelum lewat `wf_penuh.sh`. Paket 21 fitur ("luas") memberi puncak tertinggi tapi jauh lebih rapuh — jangan dipakai.

## Daftar uji untuk Agent 7 (`wf_penuh.sh`)

1. **Patokan ulang** tanpa perubahan → harus tetap $12.746,32 / 178 trade.
2. Tambah 4 fitur burst ke `bot/filter_feats.js` (+ `*_check.json` JS↔Python baru) dan pastikan replay `data/ags4` tetap **75 trade identik**.
3. Latih **model roket terpisah** (label `ret≥2`, kausal seperti `arena_score_moon.py`) memakai 33 fitur lama + 4 burst; jangan ganti filter untung yang sekarang.
4. Jalankan jalur roket dengan **MOONQ=0,90 ditetapkan di muka** (jangan disetel ulang di periode bukti), lalu laporkan juga 0,85 / 0,88 / 0,92 sebagai kepekaan. Tolak usulan ini kalau menang < 4 dari 6 ambang.
5. Ulangi dengan **MAXPOS=5** (aturan pemilik) — di situ prioritas paling menentukan.
6. Periksa drawdown & "posisi > 1% likuiditas" tidak memburuk, dan `lag_blocks` tetap < 300.
7. **Jangan** masukkan fitur dev (F10) maupun pencocokan bentuk harga (F8) — keduanya terbalik arah di periode bukti.
8. Kalau ingin menyelamatkan F9: kumpulkan **transfer ETH asli** (graf pendanaan) — tanpa itu keluarga ini tidak bisa diuji.

Berkas kerja: `hasil/audit/kerja_12/` (`fitur_sidik.py`, `uji_sidik.py`, `moon12.py`, `feat12.csv`, `auc_satu_fitur_thr*.csv`, `auc_keluarga_thr*.csv`, `scored_{lama,inti,luas}.csv`, `beli_*.json`).
