# Audit 07 — Eksperimen uji maju (Agent 7)

Semua dijalankan di salinan `hasil/audit/kerja_07/`. `bot/`, `pipeline/`, `data/*/trades.jsonl` dan
`bot/.env` asli TIDAK disentuh. Mesin dasar = salinan kerja_06 (perbaikan eksekusi a+b+c: pool bayangan,
urutan jual dalam blok, antrean nonce) + gas nyata per receipt.

**Pemeriksaan wajib lolos:** replay `data/ags4` dengan opsi baru dimatikan = **identik byte** dengan
`kerja_06/run_abc/ags4/trades.jsonl` (75 baris / 25 pool v4). Pembanding `$10.439,91` direproduksi persis.

---

## 0. Dua hal yang harus dibaca sebelum tabel apa pun

**(a) Angka dolar akhir BUKAN alat banding untuk aturan keluar.** Mengubah aturan keluar mengubah label
`win`, filter ML dilatih ulang, lalu bot membeli **koin yang berbeda**. Contoh dari data saya sendiri:
sembilan varian yang secara statistik **sama** (selisih ret per trade < 0,012) menghasilkan akun akhir
**$3.839 sampai $15.186** — beda 4x. Jadi semua kesimpulan keluar di bawah diambil dari **uji berpasangan**
(daftar koin dikunci, koin yang sama di kedua varian) + selang kepercayaan bootstrap 95%.

**(b) Sampel mesin sekarang 19.247 trade, bukan 180.** Dengan data Agustus baru
(`am_ags01/07/13/18/24`, model keluar tiap periode hanya dari periode sebelumnya):
16.400 kandidat Agustus + 2.847 kandidat garis waktu lama. Periode **PILIH** = Agustus baru
(12.911 trade murni baru: am_ags07 6.965, am_ags13 3.827, am_ags24 2.119), periode **BUKTI** = m1+m2
(2.151 trade). Tingkat akun tetap 186 trade karena periode Agustus belum punya `swaps_m1.json` /
`transfers.json` untuk filter ML — **tidak ada data** untuk menjalankan arena di Agustus.

Catatan penting dari data Agustus: ret rata-rata SEMUA kandidat di Agustus hanya **0,97 (PF 0,94)** —
tanpa filter, strategi ini rugi di Agustus. Itu konteks yang hilang dari garis waktu lama.

---

## 1. Uji BERPASANGAN aturan keluar (satu-satunya banding yang sah)

Selisih ret rata-rata per trade, daftar koin dikunci, bootstrap 95%, 4.000 ulangan.

| Varian keluar | Agustus BARU (PILIH, n=12.911) | m1+m2 (BUKTI, n=2.151) | ds5d | ds24 | Putusan |
|---|---|---|---|---|---|
| Tutup saat rug terdeteksi | -0,0000 (2 dari 12.911 trade berubah) | +0,0000 (0 berubah) | — | — | **Terima** (bukan uang: slot + kejujuran status) |
| Trailing 40% dari puncak | +0,0006 [-0,000..0,001] | +0,0032 [0,001..0,006] **sig** | +0,0040 **sig** | — | **Terima** (rem darurat) |
| Ambang dump 5% -> 12% LP | **+0,0102 [0,008..0,012] sig**, PF 0,94 -> 1,08 | +0,0038 [-0,009..0,019] | — | — | **Terima** |
| **Trailing 40% + dump 12%** | **+0,0111 [0,009..0,013] sig**, PF 0,94 -> 1,09 | **+0,0117 [0,002..0,025] sig**, PF 1,40 -> 1,45 | +0,0020 | +0,0064 | **DIPAKAI** |
| Trailing 30% + dump 12% | +0,0115 [0,009..0,014] sig | +0,0109 [0,001..0,024] sig | -0,0080 | — | setara (beda 30% vs 40% = +0,0004 [-0,000..0,001], tidak meyakinkan); 40% dipilih karena lebih lebar dan signifikan sendirian di periode lama |
| Trailing 30% saja | — | +0,0042 [0,001..0,008] sig | +0,0032 tidak sig | — | kalah dari 40% di periode pilih |
| Trailing 20% saja | — | +0,0033 [-0,003..0,010] | -0,0030 | — | **Tolak** (terlalu ketat) |
| Jual bertahap 30/30/20 | — | **-0,0178 [-0,030..-0,006] sig RUGI** | — | — | **Tolak** |
| Ambang model bahaya 0,4 -> 0,6 | — | **-0,0151 [-0,023..-0,007] sig RUGI** | -0,0193 sig | — | **Tolak** |
| Mode "pelari" 3,0x (matikan model bahaya setelah koin bergerak) | +0,0046 [-0,000..0,010] | +0,0016 [-0,010..0,015] | — | — | **Tolak** |
| Mode "pelari" 1,5x / 2,0x | — | -0,05 s/d +0,00 | — | — | **Tolak** (akun $427-$4.182) |
| Hapus batas 9 jam (pegang sampai akhir data) | — | ret/trade 1,101 -> **1,046** | PF 1,35 -> **0,82** | — | **Tolak** |

**Kesimpulan keluar:** satu-satunya perbaikan yang lolos di periode pilih **dan** periode bukti adalah
**tutup-saat-rug + trailing 40% dari puncak + ambang dump 12%**. Besarnya kecil: **+0,010 ret per trade**.
Semua usaha "biarkan pemenang jalan" dengan cara melemahkan model bahaya (mode pelari, ambang 0,6,
jual bertahap) **merugi dan signifikan**. Model bahaya adalah komponen keluar paling berharga yang ada.

---

## 2. Tabel akun tiap varian (MAXPOS=5, 1/4 Kelly compounding, gas nyata)

Format: `akun / trade / win / PF / DD`. PILIH = ds5d+ds24, BUKTI = m1+m2, PENUH = seluruh garis waktu.
**Kolom PENUH hanya informasi — lihat bagian 0(a).**

| # | Varian | PILIH | BUKTI | PENUH |
|---|---|---|---|---|
| G0 | **dasar** (a+b+c+d, MAXPOS=5) | $87,49 / 41 / 63,4% / 0,70 / 20,2% | $3.336 / 109 / 72,5% / 2,38 / 16,9% | $7.387,82 / 153 / 73,9% / 3,07 / 20,6% |
| G2 | + tutup saat rug | $120,84 / 55 / 58,2% / 1,38 / 22,4% | $5.365 / 130 / 76,9% / 4,78 / 24,5% | $9.143,34 / 174 / 73,6% / 3,99 / 24,5% |
| G4 | + trailing 20% | $130,02 / 51 / 56,9% / 1,57 / 17,6% | $2.246 / 122 / 73,0% / 2,86 / 24,5% | $3.838,90 / 160 / 70,6% / 2,81 / 24,5% |
| G3 | + trailing 30% | $182,15 / 56 / 55,4% / 2,20 / 17,1% | $5.858 / 136 / 75,7% / 3,91 / 17,9% | $11.614,77 / 181 / 71,8% / 3,56 / 17,9% |
| G5 | + trailing 40% | $123,43 / 52 / 51,9% / 1,36 / 19,9% | $3.423 / 128 / 72,7% / 3,19 / 24,5% | $6.225,03 / 168 / 69,0% / 2,89 / 24,5% |
| G14 | + dump 12% | $179,45 / 53 / 58,5% / 2,12 / 18,6% | $7.984 / 160 / 71,9% / 3,16 / 24,1% | $15.186,38 / 200 / 71,0% / 3,75 / 18,6% |
| G13 | + trailing 30% + dump 12% | $131,20 / 52 / 51,9% / 1,49 / 18,8% | $8.177 / 163 / 74,8% / 3,14 / 24,5% | $14.496,04 / 202 / 71,3% / 3,58 / 24,5% |
| **G11** | **+ trailing 40% + dump 12% (dipakai)** | $167,52 / 58 / 53,4% / 1,92 / 22,5% | $5.158 / 158 / 72,2% / 2,53 / 24,5% | $11.461,74 / 202 / 69,3% / 3,03 / 24,9% |
| G6 | + jual bertahap 30/30/20 | $146,53 / 57 / 64,9% / 1,98 / 14,4% | $6.134 / 151 / 78,1% / 4,55 / 18,6% | $9.866,60 / 195 / 76,9% / 4,71 / 17,9% |
| G9 | + trailing 40% + bertahap | $110,74 / 53 / 60,4% / 1,20 / 18,8% | $5.781 / 148 / 78,4% / 6,37 / 17,9% | $8.003,27 / 183 / 76,5% / 5,87 / 18,8% |
| G10 | + trailing 30% + bertahap | $274,35 / 61 / 60,7% / 3,88 / 16,6% | $4.119 / 146 / 77,4% / 5,51 / 17,9% | $8.313,18 / 189 / 74,1% / 4,53 / 17,9% |
| G12 | + trail 40 + bertahap + dump 12 | $88,43 / 54 / 51,9% / 0,81 / 16,7% | $7.688 / 171 / 78,9% / 4,54 / 18,4% | $10.139,52 / 211 / 74,4% / 4,70 / 17,9% |
| G7 | + hapus batas 9 jam + sepi 45 mnt | $133,93 / 50 / 58,0% / 1,75 / 21,1% | $5.550 / 134 / 74,6% / 4,20 / 24,4% | $10.244,44 / 173 / 72,3% / 3,64 / 21,1% |
| G8 | + ambang bahaya 0,6 | $117,59 / 50 / 54,0% / 1,44 / 21,3% | $2.280 / 129 / 69,8% / 2,74 / 24,5% | $4.156,55 / 164 / 67,1% / 2,69 / 25,1% |
| K1 | + pelari 1,5x / trail 35% | $113,67 / 57 / 50,9% / 1,20 / 27,8% | $248 / 92 / 60,9% / 1,75 / 16,3% | $426,91 / 143 / 60,1% / 1,81 / 27,8% |
| K3 | + pelari 1,5x / trail 25% | $143,55 / 48 / 52,1% / 1,76 / 16,8% | $662 / 124 / 70,2% / 2,01 / 25,6% | $1.224,39 / 158 / 65,8% / 1,96 / 25,0% |
| K4 | + pelari 1,5x / trail 45% | $141,39 / 52 / 48,1% / 1,71 / 23,6% | $259 / 91 / 61,5% / 1,75 / 26,8% | $615,73 / 129 / 58,9% / 1,93 / 26,3% |
| K2 | + pelari 2,0x / trail 35% | $181,02 / 57 / 56,1% / 2,06 / 18,7% | $1.905 / 131 / 74,0% / 2,62 / 24,5% | $4.182,14 / 176 / 70,5% / 2,62 / 25,9% |
| K6 | + pelari 2,0x / trail 25% | $137,81 / 56 / 55,4% / 1,52 / 19,5% | $1.349 / 131 / 69,5% / 2,18 / 17,9% | $4.019,97 / 175 / 67,4% / 3,11 / 19,5% |
| K5 | + pelari 3,0x / trail 35% | $207,31 / 52 / 57,7% / 2,74 / 21,4% | $6.795 / 160 / 73,8% / 3,33 / 17,9% | $11.812,99 / 199 / 71,9% / 3,70 / 21,4% |
| **F** | **model keluar DIBEKUKAN** (= perilaku bot live sekarang) | $156,51 / 70 / 75,7% / 2,67 / 14,4% | **$736,94** / 192 / 87,5% / 3,84 / 30,9% | $1.582,54 / 246 / 85,4% / 3,90 / 27,5% |

### Aturan MASUK / akun (diuji di atas dasar G0)

| # | Varian | PILIH | BUKTI | PENUH | Putusan |
|---|---|---|---|---|---|
| D | Larang beli saat pemanasan | $109,58 / 24 / 70,8% / 2,27 / **5,0%** | $3.565 / 108 / 77,8% / 2,45 / 16,0% | $8.036,66 / 136 / 76,5% / 3,20 / **10,7%** | **Terima** |
| E | Honeypot longgar (= aturan bot live) | $79,96 / 30 / 36,7% / **0,14** / 20,6% | $7.058 / 159 / 80,5% / 3,20 / 13,5% | $7.762,91 / 198 / 73,2% / 3,20 / 20,6% | **Tolak** — ds24 +$1,47 -> **-$6,56** |
| I | Rem harian -15% equity | sama persis (0 trade tertolak) | sama | sama | Terima sebagai asuransi gratis |
| H | +2 fitur sidik jari (36 fitur) | $69,35 / 36 / 55,6% / 0,23 / 31,1% | $2.829 / 107 / 72,0% / 3,52 / 19,4% | $4.909,37 / 149 / 72,5% / 3,28 / **31,1%** | **Tolak** |
| — | 1/4 Kelly MURNI (tanpa batas 10%) | sama | sama | $7.491,76 / 153 / 73,9% / 3,10 / **20,6%** | batas 10% dipertahankan |

**Soal 1/4 Kelly murni (pertanyaan pemilik):** f*/4 rata-rata 9,6% (maks 14,9%) tanpa batas, vs 8,0%
(maks 10,0%) dengan batas. Akun +1,4%, **DD maks IDENTIK 20,6%**, jalur equity sama. Sebabnya: pagar
eksposur 50% sudah mengikat lebih dulu, dan pengoptimal Kelly sendiri tidak pernah melebihi f*=0,6
(jadi f*/4 <= 15%). **Tidak berbahaya di data ini**, tapi batas 10% dipertahankan karena gratis
(tidak memotong untung) dan melindungi kalau taksiran f* terlalu tinggi.

### C — QTHR: bukti bahwa ambang ini TIDAK boleh disetel ulang

| QTHR | PILIH (ds5d+ds24) | BUKTI (m1+m2) | PENUH |
|---|---|---|---|
| 0,60 | **$374,25** (terbaik) | **$142,26**, DD 49,6% (**TERBURUK**) | $10.984 |
| 0,70 | $195,97 | $3.456 (terbaik) | $11.759 |
| 0,80 | $148,57 | $253,76 | $7.506 |
| 0,85 | $102,35 | $2.312 | $8.837 |
| 0,90 (produksi) | $87,49 (terburuk) | $3.336 | $7.388 |
| 0,95 | $88,06 | $1.103 | $2.644 |

Urutan di periode pilih **berlawanan arah** dengan urutan di periode bukti. Memilih QTHR jujur dari periode
lama akan memilih 0,60, yang di m1+m2 menghasilkan $142 dengan drawdown 49,6%. **QTHR tetap 0,90.**

---

## 3. Setelan final

Mesin: `rugExit=true`, `trail=0,40`, `dumpFrac=0,12`, `hz=324000` (9 jam TETAP), `DANGER_TH=0,4`,
`UP_TH=0,5`, `TP_UP=0,5`, model keluar dilatih ulang tiap periode (wajib).
Akun: `MAXPOS=5`, `QTHR=0,90`, honeypot ketat, dev-rule, `EXP_MAX=0,5`, `LP_CAP=0,01`,
`KELLY_MAKS=0,10`, `KILL_DD=0,60`, rem drawdown 10/20/30%, larangan beli saat pemanasan, rem harian -15%.

**Uji maju penuh (2 Ags - 17 Sep, mulai dari nol, gas nyata, eksekusi nyata):**

| | **FINAL** | Pembanding G0 (MAXPOS=5) | Resmi lama (MAXPOS=10) |
|---|---|---|---|
| Akun | **$100 -> $10.854,01** | $7.387,82 | $10.439,91 |
| Trade | 186 | 153 | 180 |
| Win | 71,5% | 73,9% | 76,1% |
| PF | 2,98 | 3,07 | 3,47 |
| DD maks | **24,5%** | 20,6% | 20,6% |
| Posisi > 1% likuiditas | 0/186 | 0/153 | 0/180 |
| Koin dilihat / ditolak ML / honeypot / pemanasan | 2.797 / 2.408 / 108 / 29 | 2.797 / 2.428 / 120 / 0 | — |

Per periode: ags1 & ags4 0 trade (model belum siap) · ds5d 6 trade -$3,45 · ds24 36 trade +$59,10 ·
m1 91 trade +$7.018,22 · m2 53 trade +$3.680,14.
Lama pegang median **4 menit** (rata-rata 16 menit, terlama 546 menit). Posisi bersamaan rata-rata 1,4 (maks 4).

**Kejujuran:** drawdown NAIK 20,6% -> 24,5%. Win rate dan PF sedikit TURUN. Yang naik: jumlah trade dan
akun akhir. Dan sekali lagi, $10.854 berada di tengah pita derau $3.839-$15.186 yang dihasilkan varian
yang secara statistik setara. **Perbaikan nyata yang boleh dipercaya = +0,010 ret per trade, bukan +47% akun.**

---

## 4. Koin >=10x — jawaban jujur

| | Sebelum (G0) | Sesudah exit diperbaiki (FINAL) |
|---|---|---|
| Koin dengan puncak >=3x | 128 -> **dibeli 4** | 135 -> **dibeli 13** |
| Koin dengan puncak >=5x | 44 -> **dibeli 0** | 49 -> **dibeli 0** |
| Koin dengan puncak >=10x | 15 -> **dibeli 0** | 16 -> **dibeli 0** |
| ret >=3x benar-benar direalisasikan | 4 | 4 |
| ret >=10x benar-benar direalisasikan | **0** | **0** |

**Penghambatnya bukan aturan keluar, tapi filter MASUK.** Dari 15 koin berpuncak >=10x di garis waktu lama,
**14 ditolak filter ML** dan 1 tidak pernah masuk arena. Mesin sendiri memegangnya dengan baik kalau dibeli
(ret 4,1x - 34,3x; yang tertinggi 0x154d4f36 puncak 41,2x, ret 34,25x). Menurunkan ambang masuk tidak menolong:

| QTHR | koin >=10x dibeli | koin >=5x dibeli | koin >=3x dibeli | akun | DD |
|---|---|---|---|---|---|
| 0,50 | 1 dari 15 | 2 dari 44 | 14 dari 128 | $2.077 | 44,6% |
| 0,60 | 1 | 1 | 17 | $11.289 | 16,8% |
| 0,70 | 0 | 2 | 15 | $11.635 | 19,3% |
| 0,80 | 0 | 1 | 10 | $7.270 | 24,7% |
| 0,90 | 0 | 0 | 4 | $8.037 | 10,7% |

Filter 34 fitur yang ada **tidak memberi skor tinggi pada koin roket** — bahkan membeli separuh pasar
(QTHR 0,50) hanya menangkap 1 dari 15. Menambah 2 fitur sidik jari tidak memperbaikinya (varian H).

**Tambahan dolar dari perbaikan keluar, dihitung berpasangan pada 186 trade yang benar-benar dibeli
(daftar beli dikunci, ukuran posisi nyata): 7 trade berubah, +$440,23.** Bukan ribuan persen.

---

## 5. Kapasitas — inilah batas yang sebenarnya

### 5.1 Slot BUKAN penghambat

| MAXPOS | akun | beli | tolak "slot penuh" | tolak eksposur | tolak kas | posisi bersamaan maks |
|---|---|---|---|---|---|---|
| 3 | $11.637,55 | 199 | 3 | 0 | 0 | 3 |
| **5** | $11.461,74 | 202 | **0** | 0 | 0 | 4 |
| 10 | $11.461,74 | 202 | 0 | 0 | 0 | 4 |
| 20 / 50 / tak terbatas | $11.461,74 | 202 | 0 | 0 | 0 | 4 |

Dengan aturan keluar baru posisi menutup jauh lebih cepat (median pegang 4 menit): rata-rata hanya
**1,4 posisi terbuka**, eksposur rata-rata **12% modal**, maksimum 4 posisi serentak sepanjang 148 jam.
Pagar eksposur 50% dan batas kas **tidak pernah mengikat sekali pun**. Menambah slot di atas 5
**tidak mengubah apa pun** — yang habis adalah koin yang lolos filter, bukan slot.
(Di setelan LAMA, MAXPOS=5 memang mengikat: 28 peluang hilang karena slot penuh, akun $10.440 -> $7.388.
Perbaikan keluar menghapus masalah itu.)

### 5.2 Yang benar-benar mengikat: likuiditas pool

- Likuiditas pool yang dibeli: p10 $13.424 · median $25.580 · p90 $52.202
- Batas 1% = median **$256** per posisi; posisi terbesar sepanjang uji **$851**
- **87 dari 202 beli (43%) mentok batas 1%**, dan **40 dari 40 beli terakhir mentok**
- Mentok terus-menerus mulai beli ke-**110**, yaitu saat equity ±$2.000

Setelah titik itu 1/4 Kelly tidak lagi menentukan ukuran posisi:
**pertumbuhan berubah dari majemuk menjadi LINEAR.**

### 5.3 Kepekaan batas likuiditas (dengan dampak harga: potongan 2 x posisi / likuiditas)

| LP_CAP | akun | PF | posisi median / maks | potongan dampak harga maks |
|---|---|---|---|---|
| 0,5% | $7.234 | 3,21 | $69 / $426 | 1,0% |
| **1% (dipakai)** | $11.462 | **3,03** | $130 / $851 | 2,0% |
| 2% | $15.509 | 2,58 | $157 / $1.432 | 4,0% |
| 3% | $16.921 | 2,36 | $157 / $1.555 | 6,0% |
| 5% | $19.668 | 2,29 | $157 / $1.367 | 10,0% |

Akun naik tapi **PF turun terus** (3,03 -> 2,29): dolar tambahan dibeli dengan mutu trade yang memburuk.
Tanpa model dampak harga, LP_CAP 5% "menghasilkan" $27.657 — **palsu** (selisih $8.000 murni dampak harga
kita sendiri). Lebih jauh: model dampak arena (potong 2 x pos/LP) sendiri terlalu longgar di ukuran 3-5%
pool, dan mesin pool-bayangan dihitung pada ukuran replay ($132-200), bukan ukuran akun.
**Rekomendasi: tetap 1%.** Kalau pemilik mau 2%, wajib replay ulang dengan pool bayangan pada ukuran akun —
itu belum dikerjakan, jadi angka 2-5% di tabel ini **tidak sah sebagai hasil**.

### 5.4 Titik jenuh, dan waktu $100 -> $10.000 / $100.000 / $500.000

Diukur dari 87 trade yang sudah mentok batas likuiditas: posisi median $247, untung rata-rata **$75,82**
per trade, laju **1,36 beli per jam pasar** (32,8 beli per 24 jam pasar).

**Kapasitas ≈ $103 untung per jam pasar** (≈ **$2.484 per 24 jam pasar penuh**) pada setelan final.

| Target | Jam pasar dibutuhkan (pertumbuhan LINEAR) |
|---|---|
| $100 -> $10.000 | ±96 jam pasar (±4 hari penuh) |
| $100 -> $100.000 | ±965 jam pasar (±40 hari penuh) |
| $100 -> $500.000 | ±4.831 jam pasar (±201 hari penuh) |

**Peringatan keras.** Angka $103/jam adalah rata-rata dari 148 jam pasar yang didominasi SATU hari luar
biasa (14 Sep: x27 dalam sehari); hari lain median hanya x1,39. Jadi ini **batas atas optimis**, dan ia
mengandaikan likuiditas pool memecoin RHC tetap seperti sekarang. **$500.000 tidak realistis** dengan
batas 1% likuiditas: untuk itu posisi harus ±$2.500-5.000 per koin = 10-20% likuiditas pool, yang akan
menggerakkan harga sendiri dan menghapus tepi strategi. Batas yang bisa saya pertahankan dengan data ini
adalah **kisaran $50.000-$100.000**; setelah itu pertumbuhan menempel di ±$2.500 per hari pasar, bukan
berlipat. Menaikkan kapasitas hanya bisa lewat (a) LP_CAP lebih besar — harus diuji ulang dengan dampak
harga yang benar, atau (b) filter yang meloloskan lebih banyak koin bermutu (sekarang cuma 202 dari 2.797).

---

## 6. Hasil 1 hari / 1 minggu / 1 bulan dari DATA NYATA

Setelan final, kurva equity arena, hari WIB (jangkar waktu nyata `data/block_time.json`).

| Hari WIB | trade tutup | equity | x hari |
|---|---|---|---|
| 6 Sep | 6 | $100,00 -> $96,55 | x0,966 |
| 11 Sep | 35 | $96,55 -> $141,63 | x1,467 |
| 12 Sep | 1 | $141,63 -> $155,65 | x1,099 |
| 13 Sep | 4 | $155,65 -> $188,11 | x1,209 |
| 14 Sep | 69 | $188,11 -> $5.088,31 | **x27,05** |
| 15 Sep | 18 | $5.088,31 -> $7.173,87 | x1,410 |
| 16 Sep | 18 | $7.173,87 -> $7.830,67 | x1,092 |
| 17 Sep | 35 | $7.830,67 -> $10.854,01 | x1,386 |

- **1 HARI (data nyata, 8 hari berdagang):** terbaik **x27,05**, median **x1,386**, terburuk **x0,966**,
  1 hari rugi dari 8. Satu hari (14 Sep) menyumbang hampir seluruh untung — ini risiko konsentrasi nyata.
- **1 MINGGU: tidak ada data.** Tidak ada satu pun rentang 7 hari berturut-turut yang terisi data.
  Yang ada: 6-12 Sep (3 hari berdagang) $100 -> $155,65 = x1,56; 12-18 Sep (5 hari berdagang)
  $155,65 -> $10.854 = x69,7. Keduanya **bukan** minggu penuh; jangan dipakai sebagai return mingguan.
- **1 BULAN: tidak ada data.** Rentang kalender 2 Ags - 17 Sep = 47 hari, tapi hanya ±148 jam pasar
  (±6 hari) yang terekam, dan bagian Agustus menghasilkan **0 trade akun** (model belum siap).
  $100 -> $10.854 di atas kertas = x108,5 dalam 47 hari kalender, tapi itu 8 hari berdagang yang
  direntangkan — **jangan dipakai sebagai return bulanan.** Untuk angka bulanan yang sah, bot harus
  berjalan terus-menerus minimal 30 hari.

---

## 7. Daftar varian GAGAL (lengkap dengan angka)

| Varian | Angka | Kenapa ditolak |
|---|---|---|
| Hapus batas 9 jam (pegang sampai akhir data) | ret/trade 1,093 -> 1,033; ds5d PF 1,35 -> 0,82; ds5d akun -$18,55 | Koin membusuk setelah 9 jam. Puncak koin >=10x datang median 61 menit setelah masuk — semua di dalam 9 jam |
| Ambang model bahaya 0,4 -> 0,6 | -0,0151 [-0,023..-0,007] **sig**; akun $4.157 | Model bahaya = komponen keluar terbaik; melonggarkannya merugi |
| Mode "pelari" 1,5x, trail 25/35/45% | akun $1.224 / $427 / $616 | ret >=3x memang naik, kerugian ekor jauh lebih besar |
| Mode "pelari" 2,0x, trail 25/35% | $4.020 / $4.182 | sama |
| Mode "pelari" 3,0x, trail 35% | +0,0046 [-0,000..0,010] tidak meyakinkan | tidak lolos ambang bukti |
| Jual bertahap 30% @1,2x / 30% @2x / 20% @4x | **-0,0178 [-0,030..-0,006] sig** | win rate & PF akun naik, tapi ret per trade turun signifikan — ekor terpotong |
| Trailing 20% | pilih -0,0030; akun $3.839 | terlalu ketat, memotong koin yang masih naik |
| Honeypot longgar (= aturan bot live sekarang) | ds24 +$1,47 -> -$6,56, win 36%, PF 0,27 | memperburuk periode sepi -> melanggar syarat |
| +2 fitur sidik jari (buyer_uniq_frac, sync_frac) | pilih $87 -> $69, bukti $3.336 -> $2.829, DD 20,6% -> 31,1% | lebih buruk di semua periode |
| Setel ulang QTHR dari periode lama | memilih 0,60 -> m1+m2 $142, DD 49,6% | pemilihan berlawanan arah antar periode |
| 1/4 Kelly murni tanpa batas 10% | +1,4% akun, DD identik 20,6% | tidak berbahaya tapi juga tidak menambah — batas dipertahankan |
| MAXPOS > 5 | 0 perubahan | slot bukan penghambat |
| LP_CAP 2-5% | akun naik, PF 3,03 -> 2,29 | mutu trade memburuk + model dampak harga belum sah di ukuran itu |
| Model keluar dibekukan (= perilaku bot live sekarang) | bukti **$5.158 -> $736,94** | latih ulang berkala WAJIB, bukan opsi |

---

## 8. Tiga hal yang harus diperbaiki di bot live

1. **Model keluar (p_bahaya / p_naik) harus dilatih ulang berkala.** Bot sekarang memuat
   `danger_model.json` sekali dan tidak pernah melatihnya ulang. Dibekukan = akun bukti $736,94
   bukan $5.158. Ini yang paling mahal dari ketiganya.
2. **Aturan honeypot bot harus DIPERKETAT sampai sama dengan arena** ("belum ada yang berhasil jual
   di menit-1"), bukan arena yang dilonggarkan ke aturan bot. Melonggarkan merusak periode sepi.
3. **Opsi keluar baru belum tersambung ke `.env`.** Perlu 2 sambungan kecil (belum dikerjakan,
   `bot/` asli tidak disentuh): salin blok bertag `AUDIT07` dari
   `hasil/audit/kerja_07/pipeline/v4engine.js` ke `bot/v4engine.js`, lalu teruskan env ke opsi PoolSim
   di `bot/paper_live.js` (blok `REALISTIC`, baris 40-42). Setelah itu WAJIB: replay `data/ags4`
   harus tetap 75 baris identik saat opsi baru dimatikan (sudah diverifikasi identik byte di salinan).

Usulan `.env` lengkap: `hasil/audit/kerja_07/env_usulan.txt`, diff: `env_diff.txt`.

---

## 9. Berkas kerja

`hasil/audit/kerja_07/`:
`jalan_replay.sh` (replay 6 periode lama) · `ags_state.sh` + `ags_latih.sh` + `ags_replay.sh`
(uji maju Agustus baru, model keluar A1-A4 tiap periode hanya dari periode sebelumnya) ·
`rantai07.sh` (fitur -> skor ML kausal -> gas dinamis dari receipt) · `nilai.sh` (arena pilih/bukti/penuh) ·
`mesin.js` (statistik tingkat mesin) · **`paired.js`** (uji berpasangan + bootstrap — alat banding yang sah) ·
`hari.js` (return per hari WIB) · `pipeline/v4engine.js` + `pipeline/replay.js` + `pipeline/arena.js`
(opsi bertag AUDIT07) · `env_usulan.txt`, `env_diff.txt` · run `g0`-`g15`, `k1`-`k6`, `a_base`/`a_rug`/
`a_t40`/`a_d12`/`a_t40d12`/`a_t30d12`/`a_arm`.
