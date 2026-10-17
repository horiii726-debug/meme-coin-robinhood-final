# Temuan Strategi — data 24 jam penuh
Tanggal: 2026-09-12 · Dataset: `ds24` (blok 59.886.162–60.750.162)
15.582 pool · 4.279.026 swap · 635.488 event likuiditas · 1 dari 720 chunk gagal

## 1. MASUK SEDINI MUNGKIN TERBUKTI LEBIH BAIK
Screen sama (`hook + quote ETH`), aturan exit sama, **hanya waktu masuk yang berbeda**:

| exit | masuk DETIK-1 | masuk menit-5 |
|---|---:|---:|
| trail-50% max 5 mnt | **+$9.001** (mean 1,34) | +$1.153 (mean 1,06) |
| trail-50% max 15 mnt | **+$7.461** (mean 1,24) | +$1.254 (mean 1,06) |
| trail-50% max 30 mnt | +$5.233 (1,20) | +$4.834 (1,11) |
| trail-50% tanpa batas | +$5.288 (1,21) | +$6.012 (1,15) |

Masuk detik-1 + hold pendek = **6-8x PnL**. Keunggulan hilang kalau hold dipanjangkan.

> Catatan: saya sempat menyimpulkan dari data parsial bahwa entry harus menunggu
> momentum terbentuk. Itu SALAH. Usulan user (masuk sedini mungkin) yang benar.

## 2. Kenapa: biaya menunggu terkonsentrasi di pemenang
Harga masuk relatif terhadap detik-1 (3.356 pool):

| titik masuk | p25 | p50 | p75 | p90 | >2x lebih mahal |
|---|---:|---:|---:|---:|---:|
| 10 detik | 1,00 | 1,00 | 1,04 | 1,16 | 1,2% |
| 1 menit | 0,98 | 1,00 | 1,23 | 1,74 | 7,6% |
| 5 menit | 0,87 | 1,02 | 1,87 | 2,98 | 22,2% |

Untuk koin median menunggu **gratis** (1,02x). Tapi 22% sudah >2x, dan koin yang lari
itulah yang ingin kita beli. Jadi menunggu murah rata-rata, mahal tepat di tempat
yang penting.

## 3. Konfigurasi terbaik saat ini
```
MASUK  : detik ke-1 setelah Initialize
SCREEN : hook != 0x0  DAN  quote = ETH native   (dua-duanya terbaca di detik ke-0)
SIZE   : 1% TVL, maks ~$200
KELUAR : trailing stop -50% dari puncak, batas keras 15 menit
```
313 trade · mean **1,24** · menang **30%** · PnL **+$7.461** · **top1 hanya 5%**

`top1 = 5%` artinya laba tersebar, TIDAK bergantung satu keberuntungan
(bandingkan versi menit-5 sebelumnya: top1 = 39%).

## 4. MASALAH: tidak stabil antar periode
Konfigurasi terbaik dipecah per waktu:

| periode | n | mean | PnL |
|---|---:|---:|---:|
| awal 60% | 187 | 1,35 | +$7.092 |
| tengah 20% | 63 | **0,89** | **-$1.302** |
| akhir 20% | 63 | 1,25 | +$1.671 |

**Semua** aturan exit rugi di periode tengah. Dengan n=63 belum bisa dibedakan
"rezim pasar berubah" vs "kebetulan". Ini yang harus dijawab data lebih panjang.

## 5. Target 1000% dengan probabilitas 50%
- Plafon populasi: **5,16%** pool pernah mencapai 11x (exit sempurna/tahu masa depan)
- Cari di 136.998 kombinasi aturan: presisi in-sample terbaik 63,6%
- Out-of-sample: 4 dari 15 aturan bertahan >=50% — tapi n=3..9
- Selang kepercayaan 95% untuk yang terbaik (3/5 = 60%): **23% – 88%**

**Belum bisa diklaim.** Untuk membuktikan presisi >=50%:
| presisi sebenarnya | trade dibutuhkan |
|---|---:|
| 55% | 370 |
| 60% | 91 |
| 65% | 41 |

Kita punya 5. Butuh ~91 → sekitar **18 hari data chain** (~39 jam pengumpulan).

Pola yang konsisten di aturan yang bertahan: `ret_w>=2,89x`, `netflow/LP>=0,39`,
`lp_growth>=2,04`, `has_hook=1`. Yakni: **sudah lari kencang sejak awal.**

## 6. Cek keamanan gratis: bit izin hook
Izin hook v4 terkodekan di bit terakhir ALAMATNYA — terbaca 0 detik, tanpa RPC.

| hook | pool | izin |
|---|---:|---|
| `0xe5e70264...` | 113 | afterSwap, afterSwapReturnsDelta — **TANPA beforeSwap** |
| `0x4e346895...` | 777 | afterSwap/AddLiq/RemoveLiq — **TANPA beforeSwap** |
| `0x4eb19769...` | 43 | **beforeSwap AKTIF** |
| `0xa19b5205...` | 37 | **beforeSwap AKTIF** |

`beforeSwap` = kontrak bisa menolak transaksi sebelum dieksekusi = mekanisme honeypot.
**Aturan: jangan masuk kalau bit beforeSwap menyala, kecuali sudah diverifikasi.**

## 7. Fakta chain yang mematikan taktik Solana
Uji urutan transaksi dalam blok (12 blok, 200+ tx):
- korelasi posisi vs gas price: **-0,188**
- blok yang terurut gas-tertinggi-dulu: **0 dari 12**

**Gas tinggi TIDAK membeli prioritas.** Sequencer Arbitrum Nitro = FIFO.
Jito bribe / priority fee tidak berlaku. Urutan ditentukan latensi jaringan murni
(ping user 190-350 ms vs block time 100 ms).

## BELUM SELESAI
- Fitur dompet (konsentrasi holder, bundle, flipper) — `tx_from` sudah ada, belum diuji
- Rekam jejak deployer — job resolusi masih jalan
- TEST SET belum dibuka

---

# LANJUTAN — Reputasi Deployer (2026-09-13)

## Cara dapat datanya
RPC publik gagal (154 request `eth_getTransactionByHash` macet 45 menit kena rate limit).
**Bitquery `Events` + `dataset: realtime`** menyelesaikan dalam hitungan detik: 3 query,
**15.596 pool ter-atribusi ke pembuatnya, 0 gagal.**
Catatan: plan gratis menolak `dataset: archive`, tapi `realtime` tetap bisa akses rentang 36 jam lalu.

## Siapa yang membuat koin di chain ini
- 15.596 pool dari **3.617 deployer unik**
- **83,7% pool** dari deployer yang bikin >1 koin
- Deployer terbesar: **1.128 koin dalam 24 jam** (pabrik bot)

## REKAM JEJAK DEV TERBUKTI MEMPREDIKSI
Rekam jejak dihitung berjalan — **hanya dari pool yang dia buat SEBELUMNYA** (anti-bocor).

| pembuat | pool | >=+100% | >=+1000% |
|---|---:|---:|---:|
| **pernah bikin koin >=+1000%** | 201 | **34,8%** | **6,47%** |
| belum pernah | 1.075 | 8,6% | 1,86% |
| semua pool (pembanding) | 3.160 | 27,2% | 3,70% |

- >=+1000%: lift **3,5x**, z=3,78, **p=1,6e-4** SIGNIFIKAN
- >=+100% : lift **4,1x**, z=10,27, **p~0** SIGNIFIKAN

Rekam jejak rug juga bekerja: dev 0-rug -> 17,2% capai >=+100%; dev semua-rug -> 2,2%
(lift 7,7x, p=0,009).

**Ini sinyal terkuat & terbersih yang ditemukan, dan tersedia di DETIK NOL.**

## Dampak ke strategi nyata (82 pool lolos struktural + dev terbukti)
| | tanpa filter dev | dengan filter dev |
|---|---:|---:|
| benar | 25,0% | **37,8%** |
| >=+100% | 10,8% | **18,3%** |
| untung/trade | $22,95 | **$26,58** |
| >=+1000% | 1,0% | **0,0%** |

## KETEGANGAN INTI: tidak bisa punya dua-duanya
Dev terbukti, masuk menit-1, variasi exit:

| exit | benar | untung/trade | >=+1000% |
|---|---:|---:|---:|
| trail -50%, max 15 mnt | 37,8% | **+$26,58** | 0,0% |
| trail -70%, max 6 jam | 24,4% | -$51,83 | 0,0% |
| trail -85%, max 6 jam | 17,1% | -$80,09 | 0,0% |

Mengendurkan exit untuk mengejar ekor besar **menghancurkan** strategi: kerugian dari
puluhan koin yang mati pelan lebih besar daripada keuntungan 1-2 koin yang meledak.

## VERDIKT TARGET "50% peluang dapat >=+1000%"
| tingkat | angka |
|---|---:|
| plafon populasi (exit sempurna) | 5,16% |
| plafon + filter dev terbukti | 6,10% (95% CI: 3%-13%) |
| **tercapai dgn exit realistis** | **0,0% - 2,4%** |
| target user | 50% |

**Tidak tercapai, dan jaraknya bukan soal data lagi — soal struktur.**
Bahkan dengan pemilihan sempurna DAN penjualan tepat di puncak, plafonnya 6%.

Yang BISA dicapai mendekati 50%: peluang **>=+100%** pada saringan
struktural + dev terbukti = **46,3%** (95% CI 36%-57%) pada plafon,
**18,3%** dengan exit realistis.

## KONFIGURASI TERBAIK SAAT INI
```
SARING (detik 0) : hook != 0x0  DAN  quote = ETH native
                   DAN deployer pernah bikin koin >=+1000%
MASUK            : menit ke-1
SIZE             : 1% TVL, maks $200
KELUAR           : trailing -50%, batas keras 15 menit
```
82 trade · benar **37,8%** · return rata-rata **+16%** · **+$26,58/trade** · top1 11%

## SISA PEKERJAAN
- n=82 masih kecil; butuh data lebih panjang (est. 18 hari untuk pengujian 1000% yang layak)
- Periode tengah 24 jam masih rugi — belum jelas rezim atau kebetulan
- TEST SET belum dibuka

---

# FASE 6 — MACHINE LEARNING (2026-09-13)

Tabel latih: **1.963 pool · 50 fitur** = arus (jendela 1 menit) + reputasi dev (berjalan,
anti-bocor) + struktur (bit izin hook, fee, quote) + kepadatan launch + 3 fitur noise.
Model: HistGradientBoosting (max_depth 4, 12 leaf, L2=5). Split WAKTU 60/20/20.
**TEST SET (393 pool) TIDAK DIBUKA.**

> LightGBM crash di Windows (access violation di level native). Diganti scikit-learn.

## Hasil validasi
| target | AUC val | top-5 | top-10 | top-20 | top-40 |
|---|---:|---:|---:|---:|---:|
| >= +100% | 0,883 | 100% | **100%** | 95% | 90% |
| >= +400% | 0,794 | 80% | **80%** | 60% | 47,5% |
| >= +1000% | 0,790 | 60% | 40% | 25% | 17,5% |

Kalibrasi bagus: pada target +1000%, kelompok teratas diprediksi 14,0% -> kenyataan 13,9%.

## AUDIT 1 — apakah model bergantung fitur NOISE?
`noise1` sempat muncul di top-10 permutation importance (peringkat 4 dan 8) — bendera merah
menurut aturan sendiri. Diuji dengan melatih ulang TANPA fitur noise:

| target | AUC dgn noise | AUC tanpa noise | selisih |
|---|---:|---:|---:|
| +100% | 0,883 | 0,881 | -0,002 |
| +400% | 0,794 | 0,810 | +0,016 |
| +1000% | 0,790 | 0,775 | -0,015 |

AUC tidak turun -> **model TIDAK bergantung pada noise.** Peringkat tinggi tadi hanyalah
keriuhan permutation importance pada validasi kecil (n=393). **Pipeline bersih.**

## AUDIT 2 — stabilitas lintas 10 seed (tanpa noise)
### >= +400% — STABIL
| ambil | presisi rata2 | rentang | lift |
|---|---:|---|---:|
| top-10 | **83,0%** | 80%-90% | 6,4x |
| top-20 | 61,5% | 60%-65% | 4,7x |
| top-40 | 47,5% | 42%-52% | 3,7x |

### >= +1000% — TIDAK STABIL
| ambil | presisi rata2 | rentang | lift |
|---|---:|---|---:|
| top-5 | 48,0% | **20%-80%** | 11,1x |
| top-10 | 39,0% | 20%-50% | 9,0x |
| top-20 | **25,5%** | 20%-30% | 5,9x |

Angka "60%" pada tabel validasi awal ternyata **keberuntungan seed**. Rata-rata 10 seed = 48%
dengan rentang 20-80%.

## VERDIKT TARGET USER (probabilitas 50% dapat >=+1000%)
- **Tidak tercapai secara stabil.** Yang bisa diandalkan: **25,5%** (top-20, lift 5,9x).
- **Tapi 50% tercapai telak di target lebih rendah:**
  - `>= +100%` : **100%** dari top-10
  - `>= +400%` : **83%** dari top-10 (stabil 80-90% lintas seed)

Semakin ekstrem targetnya, semakin tidak terprediksi — koin yang naik 1000%+ ditentukan
faktor di luar data 1 menit pertama.

**Rekomendasi: set target di +400%, bukan +1000%. Di situ model benar 8 dari 10.**

## Fitur paling menentukan (konsisten di semua target)
1. `ret_w` — gerak harga di jendela menit pertama
2. `netflow_over_lp` — arus beli bersih relatif likuiditas
3. `sellvol_usd_w`, `max_buy_over_lp`, `has_hook`, `lag_first_swap`

## Catatan
- Deployer resolution via RPC publik akhirnya selesai setelah ~2 jam, tapi **Bitquery
  menyelesaikannya dalam detik**. Untuk backfill berikutnya, pakai Bitquery Events.

---

# LAB EXIT — hipotesis exit-momentum DITOLAK (2026-09-13)

Diuji: exit berdasarkan melemahnya arus beli bersih (momentum), bukan trailing stop tetap.
Screen struktural (hook + ETH + bit beforeSwap mati), masuk menit-1, 181 trade.

| aturan exit | menang | return rata2 | >=+100% | PnL | top1% |
|---|---:|---:|---:|---:|---:|
| **trail -50%, 15 mnt** | 28,7% | **+14%** | **13,3%** | **+$2.277** | 9% |
| trail -50%, 60 mnt | 27,1% | +17% | 8,8% | +$3.433 | 29% |
| momentum 40%, 60 mnt | 35,4% | -1% | 1,1% | **-$553** | 8% |
| momentum 25%, 60 mnt | 34,8% | -0% | 1,7% | -$118 | 11% |
| flow-negatif, 60 mnt | 30,9% | +2% | 2,2% | +$770 | 21% |

**Kesimpulan: exit momentum menaikkan tingkat menang tapi menghancurkan profitabilitas.**
`>=+100%` anjlok dari 13,3% ke 1,1% — sinyal "tenaga beli melemah" menyala TERLALU CEPAT
dan memotong pemenang sebelum geraknya selesai. Sering benar, tapi untungnya kecil.

Trailing stop sederhana tetap yang terbaik. Pilihan:
- **trail -50% / 15 menit** — PnL lebih kecil tapi top1 hanya 9% (paling tidak bergantung keberuntungan)
- trail -50% / 60 menit — PnL lebih besar tapi top1 29% (lebih rapuh)

Catatan metode: run ini memakai horizon 1 jam + filter bit `beforeSwap`, jadi angkanya
tidak langsung sebanding dengan tabel-tabel sebelumnya (yang pakai horizon 6 jam).

---

# UJI MAJU & WALK-FORWARD — koreksi atas angka validasi (2026-09-13 siang)

## 1. Uji maju radar live (20 sinyal, prediksi dicatat SEBELUM hasil)
14 pool masih diperdagangkan setelah entry (6 langsung mati, dan model memberi mereka skor 1-3% — itu benar).

| kelompok | n | prediksi >=+100% | nyata | prediksi >=+400% | nyata |
|---|---:|---:|---:|---:|---:|
| skor tinggi (p100>=0,5) | 8 | 67% | 25% | 25% | 13% |
| skor rendah | 6 | 23% | 33% | 13% | 17% |

Korelasi peringkat skor vs puncak nyata: **rho = 0,06** (praktis nol).
Strategi trail -50%/15m di 14 trade: rata-rata **-24%, PnL -$611**.
Kandidat terkuat `0x9ee0e829` benar-benar naik **+2.187%**, tapi trailing stop keluar di **-47%**.

### Bug train/serve yang ditemukan
- `launch_density_10m`: saat latih hanya menghitung pool yang punya hasil (~20%),
  radar menghitung semua pool -> skala beda ~5x. **Diperbaiki** di `mltable.js`.
- `lp_adds_w` diisi 0 di radar (latih tidak pernah 0). Tidak berpengaruh ke skor.
Setelah diperbaiki, korelasi skor live tetap ~0 -> bug ini BUKAN penyebab utama.

## 2. Walk-forward (2.540 pool, jendela 8 jam, latih HANYA di masa lalu)
Data: ds5d (17 jam, ~6 hari lalu) + ds24 (24 jam, ~2 hari lalu). Deployer ds5d baru 48% ter-atribusi.

| target | AUC out-of-sample | top-10 presisi | base rate | verdikt |
|---|---|---:|---:|---|
| >= +100% | 0,66 – 0,83 (rata2 **0,75**) | 40–60% (rata2 **48%**) | ~23% | stabil |
| >= +400% | 0,60 – 0,71 (rata2 **0,67**) | 10–30% (rata2 **16%**) | ~6% | 1 periode <0,6 |
| >= +1000% | 0,67 – 0,76 (hanya 2 periode teruji) | 10–20% | ~2% | sampel sangat kecil |

## KOREKSI
Angka sebelumnya (top-10: 10/10 untuk +100%, 8/10 untuk +400%) berasal dari validasi
DI DALAM jendela 24 jam yang sama. Lintas hari, kekuatannya jauh lebih kecil:
**~5/10 untuk +100%, ~1,6/10 untuk +400%.**

Model **punya** daya prediksi nyata lintas hari (AUC ~0,75 / 0,67 — konsisten di atas acak),
tapi **sedang, bukan kuat**. Target 50% untuk +1000% tidak tercapai (top-10: 10-20%).

## Masalah yang belum terpecahkan
**Aturan exit.** Bahkan saat model benar (+2.187%), trailing -50%/15m keluar rugi.
Seleksi koin dan waktu keluar adalah dua masalah terpisah; yang kedua belum ada solusinya.

**Status: TIDAK layak uang nyata.** Sesuai aturan Fase 8: hasil live jauh di bawah backtest.
