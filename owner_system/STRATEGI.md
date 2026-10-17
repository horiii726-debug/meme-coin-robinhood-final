# MONTE CARLO — v2 vs v3 vs v4 (10.000 simulasi per rencana)

Metode: block bootstrap (potongan 20 trade berurutan, supaya rentetan rugi & rezim ikut terbawa),
dari 813 trade backtest (jeda 3 detik). Diuji gabungan dan per periode.

## Hasil realistis: ukuran TETAP $200/trade, modal $10.000
| | v2 pegang penuh | v3 jual 85% | **v4 jual 60% + model** |
|---|---:|---:|---:|
| 1.000 trade — PnL median | **$42.217** | $30.986 | $31.725 |
| 1.000 trade — 5% terburuk | $18.923 | $18.007 | $18.826 |
| 1.000 trade — modal pernah habis | 0,2% | 0% | 0% |
| 5.000 trade — PnL median | **$211.415** | $156.351 | $160.550 |
| Periode BARU saja — 5% terburuk | $11.402 | **$18.240** | $17.514 |
| Periode BARU saja — modal pernah habis | 0,4% | 0% | 0% |

## Risiko (ukuran 2% modal, 1.000 trade, gabungan)
| | v2 | v3 | **v4** |
|---|---:|---:|---:|
| Drawdown median | **40%** | 16% | **14%** |
| Drawdown 5% terburuk | **61%** | 26% | **23%** |
| Peluang drawdown >50% | 2,0% | 0% | 0% |
| Rugi beruntun median / 5% terburuk | **28 / 40** | 17 / 21 | **13 / 16** |

## Kesimpulan
- **v2 untung paling besar rata-rata (+33%), tapi paling berat dijalani:** drawdown 40–61%, 28–40 rugi beruntun,
  dan satu-satunya yang bisa menghabiskan modal. Di periode BARU, skenario terburuknya jauh lebih jelek dari v3/v4.
- **v4 paling konsisten:** drawdown terkecil, rugi beruntun terpendek, tidak pernah habis modal, profit ~75% dari v2.
- v3 dan v4 hampir setara; v4 lebih baik di periode LAMA, v3 sedikit lebih baik di BARU.

## Batas
Monte Carlo hanya mengacak trade backtest. Dia membuktikan hasilnya bukan kebetulan urutan,
**bukan** bahwa edge-nya nyata. Semua asumsi backtest ikut terbawa (tanpa pesaing, tanpa transaksi gagal).
"100% simulasi untung" tidak berarti dijamin untung live — uji live v1 rugi.

---

# UPDATE v4 — SISA 40% DIATUR MODEL "BAHAYA" (sesuai syarat: sisa >=40%, win rate >=45%)

```
MASUK     menit-1, saringan aman, min($200, 1% LP)
SEBELUM TP1   stop -40% dari puncak
TP1       posisi >= +20%  ->  JUAL 60%
SISA 40%  dijual saat model bahaya >= 0,4  (juga: tanda pucuk, tanda dump, detektor rug, stop bencana -90%)
```

Model bahaya = peluang harga turun >=30% dalam 5 menit atau rug dalam 10 menit, dihitung tiap 10 detik dari
100.753 potret kondisi (794 koin). Dilatih hanya di periode LAMA. AUC periode BARU **0,77**, kalibrasi akurat
(prediksi 47% -> nyata 41%). Tanda terpenting: lama posisi terbuka, volume beli 5 menit, fee, arus 60 detik.

| jeda 3 detik | LAMA | BARU |
|---|---:|---:|
| Win rate | 44% | **50%** |
| Profit factor | **1,83** | **1,91** |
| Return rata2 | +30% | +12% |
| PnL (tanpa trade terbaik) | +$5.535 (+$3.246) | +$11.116 (+$9.962) |
| Rata2 10% trade terbaik | +433% | +147% |
| Trade terbesar | +1.776% | +794% |

## Batas fisik yang harus diketahui
Kalau SETIAP trade dijual TEPAT di puncaknya (mustahil): return rata-rata hanya **+216% (BARU) / +278% (LAMA)**,
median +38–51%. Koin yang pernah menyentuh +3.000%: **1,6–1,7%**.
**"Rata-rata +3.000% per trade" tidak mungkin di pasar ini.**

Dengan sisa 40%, koin yang naik 30x menghasilkan paling banyak ~+1.200% untuk trade itu
(0,6 x 1,2 + 0,4 x 31). Trade +3.000% butuh koin ~75x DAN sisa dijual tepat di puncaknya.

## Pilihan yang tersedia (BARU, jeda 3 detik)
| rencana | win | PF | trade terbesar |
|---|---:|---:|---:|
| v4 jual 60% + model | 50% | 1,91 | +794% |
| v3 jual 85% | 52% | 2,00 | +703% |
| v2 pegang penuh | 20% | 1,40 | +3.855% |

---

# UPDATE v3 — JUAL BERTAHAP (win rate >= 50%)

Tambahan atas v2 di bawah, diuji dengan jeda eksekusi 3 detik. Konfigurasi dipilih di periode LAMA,
dicek di periode BARU.

```
MASUK     sama seperti v2 (menit-1, saringan aman, min($200, 1% LP))
TP1       begitu posisi bernilai >= +20%  ->  JUAL 85%       (trade ini dijamin menang: 0,85 x 1,2 = 1,02)
SEBELUM TP1   stop -40% dari puncak
SISA 15%  dibiarkan jalan dengan aturan v2 (arus + tanda pucuk + tanda dump + detektor rug), tanpa batas 15 menit
```

| | LAMA | BARU |
|---|---:|---:|
| Win rate | **50%** | **52%** |
| Profit factor | 1,74 | **2,00** |
| Return rata2 per trade | +26% | +13% |
| PnL | +$4.534 | +$11.397 |
| PnL tanpa trade terbaik | +$2.208 | **+$10.291** |
| Hold rata2 / median | 43 / 5 menit | 46 / 6 menit |
| Trade terbesar | +1.805% | +703% |
| Porsi puncak moonshot tertangkap | 21% | 8% |

**Kompromi yang tidak bisa dihindari** (BARU): jual 85% -> win 52%, trade terbesar +703% ·
jual 70% -> win 43%, +1.283% · tanpa jual bertahap (v2) -> win 20%, +3.855%.
Win rate tinggi dan ekor ribuan persen saling tarik-menarik. Plafon win rate dengan exit SEMPURNA ~70%;
hanya 4-9% koin yang pernah menyentuh +1.000%.

**Perbaikan berikutnya (sedang dikerjakan):** model yang belajar dari ratusan koin kapan harga masih akan naik,
kapan mau turun, dan kapan mau rug — untuk mengatur penjualan SISA 15%. Karena TP1 sudah mengunci kemenangan,
perbaikan ini hanya bisa menambah ekor, tidak menurunkan win rate.

Menu lengkap semua kombinasi: `scripts/exit_tp_menu.txt`

---

# RENCANA DAGANG v2 — Memecoin Uniswap v4, Robinhood Chain

Disusun 13 September 2026 dari seluruh riset. Data: 26.480 pool, 7,6 juta swap,
dua periode terpisah (~6 hari lalu = LAMA, ~2 hari lalu = BARU).

> **Status: SIAP PAPER TRADING, BELUM UANG NYATA.**
> Rencana ini lolos backtest di dua periode dengan jeda eksekusi 3 detik.
> Belum pernah diuji live. v1 (trailing -50%/15 menit) sudah dibuang: impas/rugi dengan jeda nyata,
> dan itulah yang membuat uji live semalam rugi.

---

## 1. RENCANA DALAM SATU LAYAR

```
VENUE     Uniswap v4 PoolManager 0x8366a39cc670b4001a1121b8f6a443a643e40951 (Robinhood Chain)
DETEKSI   event Initialize (polling RPC; tidak ada WebSocket publik)

SARING    di detik 0, semua dari event kelahiran:
          [1] pasangan ETH native
          [2] fee pool <= 0,5%
          [3] bit izin hook "beforeSwap" MATI          <- anti-honeypot
          [4] nilai LP saat masuk >= $2.000             <- posisi minimal $20

MASUK     menit ke-1 setelah pool lahir, satu kali beli
UKURAN    min($200, 1% dari nilai LP)

KELUAR    tidak ada batas 15 menit (maks 6 jam). Aturan dicek di SETIAP swap:
          A. TANDA PUCUK  : posisi pernah >=3x  DAN  rata-rata ukuran jual 60 detik terakhir
                            >= 1,5x rata-rata ukuran jual sejak masuk        -> JUAL
          B. TANDA DUMP   : ada SATU penjualan >= 5% dari nilai LP            -> JUAL
          C. STOP BERBASIS ARUS (arus kuat = 60 detik terakhir beli >= jual DAN >= 3 beli)
                sebelum 10x : arus kuat -> stop -80% dari puncak | arus lemah -> stop -30%
                setelah 10x : arus kuat -> stop -50% dari puncak | arus lemah -> stop -20%
          D. DETEKTOR RUG : >30% LP ditarik                                   -> JUAL
```

---

## 2. HASIL BACKTEST (jeda eksekusi 3 detik)

| | LAMA | BARU |
|---|---:|---:|
| Trade | 175 | 638 |
| Trade per jam | 10 | 27 |
| **Win rate** | **28%** | **20%** |
| **Profit factor** | **1,55** | **1,40** |
| Rata-rata return per trade | +38% | +17% |
| Untung rata-rata saat menang | $337 | $328 |
| Rugi rata-rata saat kalah | $84 | $59 |
| **Lama hold rata-rata / median** | **42,5 / 3,9 menit** | **45,5 / 5,6 menit** |
| PnL | +$5.877 | +$11.895 |
| PnL tanpa trade terbaik | +$3.480 | +$7.835 |
| 5 trade terbaik menyumbang | 47% laba kotor | 27% laba kotor |
| Drawdown modal terbesar | -$4.719 | -$5.530 |
| Rugi beruntun terpanjang | 14 trade | 34 trade |
| Posisi terbuka bersamaan (maks) | 29 | 88 |
| Modal terikat maks / median | $4.322 / $2.836 | $11.618 / $7.781 |

**Cara strategi ini menghasilkan uang:** 67–75% trade rugi kecil (rata-rata -$59 sampai -$84),
sisanya menang besar (rata-rata +$330). Untung datang dari **perbandingan besar menang vs kecil kalah
(4-6 kali)**, bukan dari sering benar.

### Sensitivitas jeda eksekusi (profit factor)

| exit | jeda 0 | jeda 0,5 dtk | **jeda 3 dtk** |
|---|---:|---:|---:|
| v1: trailing -50% / 15 mnt (BARU) | 1,24 | 1,12 | **0,99** |
| **v2: arus + pucuk + dump (LAMA)** | 1,60 | 1,61 | **1,55** |
| **v2: arus + pucuk + dump (BARU)** | 1,80 | 1,53 | **1,40** |

Hanya v2 yang bertahan. Semua variasi exit lain yang diuji jatuh ke PF <1 dengan jeda 3 detik.

---

## 3. DARI MANA UNTUNG & RUGINYA (BARU, 638 trade)

| alasan keluar | trade | menang | PnL |
|---|---:|---:|---:|
| **A. tanda pucuk** | 60 | **90%** | **+$30.735** |
| B. tanda dump | 111 | 36% | +$2.414 |
| C. stop | 203 | 14% | -$4.576 |
| tidak terpicu dalam 6 jam | 179 | 3% | -$1.142 |
| **kena rug** | 85 | 0% | **-$15.537** |

- **Tanda pucuk adalah mesin uangnya.** Hanya 9% trade, tapi 90% menang dan menghasilkan semua laba bersih.
- **Rug adalah kebocoran terbesar.** 13% trade, -$15.537. Rug di chain ini ditarik dalam **satu transaksi** —
  detektor penarikan LP hampir tidak pernah sempat bereaksi. Tanda dump menurunkan kena-rug dari 112 jadi 85,
  tapi tidak menghilangkannya.

Sebaran hasil (BARU): 67% rugi · 9% +0–100% · 9% +100–400% · 1,6% +400–1.000% · 0,5% >+1.000%.

---

## 4. MENJAWAB PERTANYAAN INTI

**"Jangan exit terlalu dini — jangan jual di 1.000% kalau pembeli masih ramai dan harga masih naik."**
Itu yang dilakukan aturan C: selama arus beli kuat, stop dibuat lebar (-80%, atau -50% setelah 10x),
karena moonshot rata-rata turun **48%** di tengah jalan sebelum lanjut naik. Stop baru mengetat saat arus melemah.
Tapi batasnya harus jujur: strategi ini menangkap **17–36% dari puncak** moonshot, bukan puncaknya.
Setelah puncak, moonshot ambruk ke 26% nilainya dalam 5 menit — terlambat keluar lebih mahal daripada terlalu cepat.

**"Pakai pola moonshot."** Pola itu terpakai **di sisi keluar**, dan di situlah dia terbukti bernilai:
arus beli (aturan C) dan ukuran jual yang membesar sebelum puncak (aturan A).
Di sisi **masuk**, saringan pola (ramai di menit-1, dsb.) justru **merugikan** — kamu membeli yang sudah mahal.

**"Reputasi dev."** Terbukti memprediksi peluang puncak (lift 3,5x untuk >=+1.000%, p=0,00016),
tapi **tidak menaikkan profit trade** (62 trade, PF ~1,0). Dipakai untuk dipantau, **bukan** saringan.

**"Model ML."** Punya daya prediksi lintas hari (AUC 0,75 untuk +100%), dan dengan eksekusi seketika
menaikkan PF. Tapi dengan jeda 3 detik **tidak lebih baik dari saringan aturan** (PF 1,39 vs 1,40).
Kill criteria Fase 6 milikmu: model tidak mengalahkan aturan -> **pakai aturan, model dibuang dari keputusan masuk.**

**"Detik-detik sebelum kenaikan puluhan ribu persen."** Koin >+10.000% (7 kasus) punya pola khas:
sunyi total lalu meledak (volume beli ~$50 -> $18.500 per 5 detik). Semua moonshot: hampir tidak ada yang menjual
di 30 detik sebelum tembus 2x, harga naik curam, LP bertambah. **Tapi di detik itu moonshot dan fakeout
masih sulit dibedakan** (daya beda terbaik 0,64). Pola ini tidak cukup kuat untuk jadi sinyal masuk sendiri.

**"Target 50% peluang dapat >=+1.000%."** Tidak tercapai. Di rencana ini **0,5–3,4%** trade berakhir >+1.000%.

---

## 5. MANAJEMEN RISIKO (wajib sebelum uang nyata)

| aturan | nilai awal |
|---|---|
| Ukuran per trade | min($200, 1% LP) — **jangan dinaikkan**, menaikkan ke $1.000 cuma +18% profit |
| Modal disiapkan | ~$12.000 untuk menampung ~90 posisi terbuka (atau batasi jumlah posisi) |
| Rugi beruntun yang harus sanggup ditanggung | **34 trade** tanpa panik |
| Drawdown yang harus sanggup ditanggung | **~$5.500** |
| Kill switch harian | stop kalau rugi harian > 2x drawdown backtest |
| Sebelum setiap beli | simulasi jual via `eth_call` — kalau gagal, lewati (honeypot) |
| Batas eksekusi | kalau jeda nyata > 3 detik, hasil backtest tidak berlaku |

---

## 6. YANG SUDAH DIUJI & DITOLAK

| ide | alasan ditolak |
|---|---|
| Snipe detik 0 | kalah balapan secara struktural (sequencer FIFO, ping 190–350 ms) |
| Priority fee / Jito | gas tidak membeli urutan (korelasi -0,188) |
| Trailing -50% / 15 menit (v1) | PF 0,99 dengan jeda 3 detik; itu penyebab uji live rugi |
| Exit momentum (keluar saat arus turun dari puncaknya) | memotong pemenang |
| Stop lebar tanpa sinyal pucuk | PF 0,68–0,84 dengan jeda |
| Arus jendela 5 menit | PF 0,54–0,71 |
| Saringan "sudah ramai di menit-1" | membeli yang sudah mahal |
| Syarat wajib hook | membuang 55% moonshot |
| Detektor rug dari penarikan LP | rug = satu transaksi, menyelamatkan ~0 trade |
| Saringan reputasi dev | tidak menaikkan profit trade |
| Model ML sebagai saringan masuk | tidak mengalahkan aturan dengan jeda nyata |
| Sinyal X / Telegram | tidak ada data; puncak median 1,7 menit, sosmed terlambat |

---

## 7. BATAS & RISIKO YANG BELUM DIUKUR

1. **Belum pernah diuji live.** Satu-satunya uji live (v1, 14 trade) rugi -$611.
2. **Parameter dirancang dari data yang sama** (anatomi moonshot diambil dari dataset ini). Dua periode terpisah
   dan tiga tingkat jeda memberi perlindungan, tapi bukan pengganti data baru.
3. **Tidak dimodelkan:** transaksi gagal, pesaing bot yang juga melihat tanda pucuk, dampak jual kita sendiri
   saat banyak posisi keluar bersamaan.
4. **Deployer periode LAMA baru 48% ter-atribusi** (tidak memengaruhi rencana karena reputasi dev tidak dipakai).
5. **179 trade "menggantung" 6 jam** tanpa terpicu — modal terkunci. Kandidat perbaikan berikutnya, belum diuji.
6. Test set belum dibuka.

---

## 8. LANGKAH BERIKUTNYA

1. **Perbarui radar** dengan saringan & aturan keluar v2 (sekarang masih v1).
2. **Jalankan paper trading >= 2 minggu** di mesin yang tidak tidur. Catat jeda nyata tiap sinyal.
3. **Setiap hari bandingkan** win rate, PF, dan hold dengan tabel bagian 2. Kalau PF live < 1,1 selama
   seminggu -> berhenti, kembali ke riset.
4. Kalau cocok: uang nyata dengan ukuran terkecil ($20–50), kill switch aktif, naikkan bertahap.

---

## Lampiran — reproduksi

| file | isi |
|---|---|
| `scripts/exit_v3.js` | backtest rencana ini (`LATB=30` untuk jeda 3 detik) |
| `scripts/exit_v3_lat30.txt` | hasil lengkap semua saringan & exit, jeda 3 detik |
| `scripts/x8_trades.json` | daftar trade per trade rencana v2 |
| `scripts/anatomy.js`, `ignition.js` | anatomi moonshot & analisis detik-per-detik |
| `data/ds6d/` | fitur, simulasi, tabel ML, hasil anatomi |
| `STRATEGY_FINDINGS.md` | log riset lengkap termasuk semua koreksi |
