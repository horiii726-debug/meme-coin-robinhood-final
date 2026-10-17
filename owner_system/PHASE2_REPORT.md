# FASE 2 — Population Sizing (GATE)
Tanggal: **2026-09-12** · Status: **LOLOS** (dengan 1 catatan cacat definisi)

## Metode
- Sumber: `eth_getLogs` PoolManager v4 langsung dari RPC (bukan Bitquery — kuota dihemat).
- **3 window terpisah**, 40.000 blok (~67 menit) masing-masing, diambil dari waktu berbeda
  agar tidak bias jam: hari-H, H-1, H-3. Total 120.000 blok / 675.400 log / **0 chunk gagal**.
- Likuiditas dihitung dari event `Swap` (`liquidity` + `sqrtPriceX96`).
  **Tidak butuh archive state** — ini yang menyelamatkan kita dari blocker B2 di Fase 0.
- Populasi = pool yang `Initialize`-nya jatuh di dalam window DAN punya >=3.000 blok
  (~5 menit) waktu tindak lanjut. Peak LP diukur pada 5 menit pertama itu.
- ETH/USD = **$2.539,49**, diturunkan on-chain dari pool ETH/USDG (poolId dihitung
  deterministik dari PoolKey). Dikonfirmasi 2 pool independen, selisih 0,03%.

## Hasil per window — stabil di 3 hari berbeda
| window | pool lahir | terukur | tradable >=$20k | % |
|---|---:|---:|---:|---:|
| H-3 | 553 | 148 | 43 | 29,1% |
| H-1 | 516 | 206 | 67 | 32,5% |
| H-0 | 835 | 205 | 60 | 29,3% |

Kestabilan 29,1 / 32,5 / 29,3% ini lebih meyakinkan daripada nilai absolutnya.

## KILL CRITERIA (ditetapkan di Fase 2, tidak diubah)
| # | Kriteria | Angka terukur | Hasil |
|---|---|---|---|
| 1 | pool TRADABLE < 200 → STOP | 170 di 185 mnt sampel → **~1.323/hari** (~39.700/30 hari) | **LOLOS** |
| 2 | median LP tradable < $20k → STOP | $38.208 | **LOLOS** (tapi lihat catatan) |
| 3 | pool baru < 5/hari → STOP | **~13.709/hari** | **LOLOS** |

### ⚠ Catatan: kriteria 2 adalah tautologi
TRADABLE didefinisikan sebagai "pernah LP >= $20.000". Median dari himpunan yang semua
anggotanya >= $20.000 **pasti** >= $20.000. Kriteria ini tidak bisa gagal dan tidak
memberi informasi. Angka yang benar-benar informatif:
- median peak LP **seluruh** pool baru terukur: **$8.959**
- sebaran pool tradable: p10 $22.984 · p25 $27.503 · p50 $38.208 · p75 $72.588 · p90 $142.116

Niat asli kriteria tetap terpenuhi (ada ruang di atas ambang, bukan nyerempet), tapi
jumlah pengaman efektif di gate ini **2, bukan 3**.

## Validasi asumsi (dilakukan karena metode TVL saya berpotensi optimistis)
Uji model-free memakai identitas eksak Uniswap: `amount = L x d(sqrtP)`.
Dari swap nyata, hitung `L_tersirat` lalu bandingkan dengan `liquidity` yang dilaporkan.

```
31.261 pasangan swap berurutan
p10 1.000 | p25 1.000 | p50 1.000 | p75 1.000 | p90 1.011
dalam +-10% dari 1.0 : 97,6%
```
**Rumus sahih.** Angka TVL & model slippage bisa dipakai apa adanya.

> Uji sebelumnya ("berapa % posisi full-range?") memberi 20,9% dan kesimpulan otomatis
> "terlalu optimistis" — itu **tes yang salah**. Lebar rentang median 69.000 tick
> (~991x rentang harga) berperilaku seperti full-range. Uji model-free di atas yang benar.

## Konsekuensi sizing (menjawab Fase 3 poin 1 lebih awal)
Dari identitas yang tervalidasi: `slippage = d(sqrtP)/sqrtP0` dan `size = cadangan_quote x slippage`,
maka **size maks @ slippage 2% = 1% dari TVL**.

| Pool | TVL | Size maks @ 2% |
|---|---|---|
| median tradable | $38.208 | **~$382** |
| p75 | $72.588 | ~$726 |
| p90 | $142.116 | ~$1.421 |

**Dikonfirmasi independen oleh perilaku pasar nyata** — distribusi ukuran swap yang
benar-benar terjadi: p50 **$34** · p75 $133 · p90 **$373** · p99 $1.550 · max $10.939.
Dua turunan independen (matematika kurva vs perilaku trader) sepakat di skala ~$400.

**KESIMPULAN SIZING: ini permainan size kecil.** Bukan pembunuh riset kalau target 1000%+,
tapi strategi ini **tidak bisa discale ke modal besar**.

## Temuan lain
- **49% pool baru tidak pernah di-swap sama sekali.** Filter pertama gratis & kuat.
- Pool tradable: median 56 swap (p25 21, p75 113) dalam 5 menit pertama.
- Fee pool tradable: median 2.500e-6 (0,25%), p90 50.000e-6 (5%).
- Hanya 31/170 pool tradable memakai hook.

## BELUM TERJAWAB
- **Trader unik per pool (Fase 2 poin 4)** — belum bisa dihitung. `sender` di event v4
  adalah router, bukan orang. Butuh `tx.from` (lihat blocker Fase 0). **Tidak diisi angka karangan.**
