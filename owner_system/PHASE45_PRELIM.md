# FASE 4-5 — Deteksi Rug (HASIL AWAL, separuh data)
Tanggal: 2026-09-12 · Sampel: 694 pool (226 dgn LP entry >= $20k) · **BELUM final**

## Disiplin metode
- Fitur **hanya** dari jendela [init, init+5 menit]. Label **hanya** dari sesudahnya. Tidak tumpang tindih.
- Split berbasis waktu 60/20/20. **TEST SET (46 pool) TIDAK DIBUKA.**
- Koreksi Benjamini-Hochberg, FDR 10%, atas 41 fitur.
- **3 fitur noise acak** disisipkan sebagai kontrol.

## Dua kesalahan yang ditemukan & diperbaiki
1. **Peak harga mentah** menghasilkan multiple 1,8e55 — harga di pool berlikuiditas nol yang
   tidak bisa dijual. Diganti simulasi round-trip yang benar-benar dieksekusi.
2. **Kebocoran label**: definisi `y_rug` memakai `lp_peak_w` (besaran jendela FITUR).
   Semua fitur likuiditas dapat keunggulan palsu. Label ditulis ulang murni dari data pasca-jendela.

Hasil di bawah ini sudah setelah kedua perbaikan.

## KONTROL NOISE: BERSIH
0 dari 3 fitur acak lolos seleksi. Pipeline tidak bocor.

## TEMUAN UTAMA — rug ditentukan STRUKTUR, bukan dinamika
Segmentasi pool LP >= $20k:

| segmen | n | rug |
|---|---:|---:|
| hook ADA + quote ETH | 57 | **1,8%** |
| hook ADA + quote USDG | 9 | 77,8% |
| hook TIDAK + quote ETH | 140 | 79,3% |
| hook TIDAK + quote USDG | 20 | 70,0% |

Per alamat hook:

| hook | n | rug | >=1000% |
|---|---:|---:|---:|
| `0xe5e702641ea86f4ae6cc3cdaed2b886f976be044` | 52 | **0,0%** | 3,8% |
| `0x0000...0000` (tanpa hook) | 160 | 78,1% | 0,0% |
| `0xc9407598bfec2a0c8d585d80fc70f27356450044` | 7 | 85,7% | 0,0% |

Hook `0xe5e7…` = kontrak nyata, bytecode 15.167 byte.

## Uji honeypot pada hook tsb: LOLOS
Kekhawatiran wajar: hook yang mencegah rug bisa jadi memblokir penjualan.
- sell per pool: **median 231** (vs 23 di pool tanpa hook)
- pool yang tidak punya sell sama sekali: **0 dari 52**
- fee median: **0**

Bukan honeypot. Orang bisa keluar.

## TAPI — hook menghapus rug, BUKAN kerugian
Pada 52 pool hook tersebut:
- `end_mult` median **0,13x** (berakhir turun 87%)
- 73,1% tetap masuk kategori DUMP (berakhir < -50%)
- exit terbaik median **1,59x**, p90 5,33x

**Kesimpulan: masalahnya bukan memilih koin, tapi WAKTU KELUAR.**
Ini konsisten dgn temuan Fase 3: 70% pool rug, tapi hanya 15% yang tidak pernah balik modal.

## Arah sinyal order-flow (LP >= $20k, target rug)
| fitur | AUC | arah |
|---|---:|---|
| buy_size_med_usd | 0,919 | beli median lebih besar -> LEBIH rug |
| lag_first_swap | 0,884 | makin lama swap pertama -> LEBIH rug |
| lp_end_w_usd | 0,879 | (terkonfound dgn segmen hook) |
| ret_w | 0,853 | naik di 5 mnt awal -> LEBIH rug |
| has_hook | 0,194 | hook -> JAUH lebih aman |
| n_swap_w / n_buy_w / swaps_per_min | ~0,21 | makin ramai -> LEBIH aman |
| maxdd_w | 0,235 | drawdown awal -> lebih aman |
| bundled_frac | 0,365 | tx ter-bundle -> lebih aman (berlawanan dgn hipotesis awal) |

## PERINGATAN — jangan dibaca berlebihan
1. **n=52** untuk hook unggulan. Nol rug dari 52 bukan berarti 0% sesungguhnya;
   batas atas statistik (rule of three) sekitar **5,7%**.
2. 28 fitur "lolos" tapi sangat berkorelasi satu sama lain. Efektifnya ~5 sinyal bebas,
   dan yang dominan adalah **flag struktural yang sudah diketahui saat pool lahir** —
   bukan pola dinamis halus. ML tidak menemukan pola tersembunyi; ia menemukan "launchpad mana".
3. Sinyal order-flow di atas **terkonfound dengan segmen hook**. Belum diuji di dalam tiap segmen.
4. Data baru separuh (kolektor 24 jam jalan ~49%).

## LANGKAH BERIKUT
- Ulang di data 24 jam penuh.
- Uji order-flow DI DALAM tiap segmen hook (buang efek launchpad).
- Identitas dompet (`tx.from`) belum masuk — script siap, belum dijalankan.
