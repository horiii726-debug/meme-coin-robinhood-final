# Biaya nyata & uji stres — 2026-09-15

## Gas diukur on-chain (383 receipt swap menit-1, scripts/measure_gas.js)
| | nilai |
|---|---|
| median per swap | $0,054 (165 ribu gas, 0,117 gwei) |
| swap sederhana (<300 ribu gas) p50 / p90 | $0,048 / $0,214 |
| gwei p90 (saat ramai) | 0,397 (3,4x median) |
| asumsi lama | $0,02 per transaksi |

Chain ini (Arbitrum Orbit) tidak lelang priority fee: menang/kalah ditentukan jeda, bukan gas.

## Opsi mesin baru (v4engine.js)
gasUsd, approveUsd (approve token sebelum jual), worstOrder (bot lain di blok yang sama lebih dulu),
failBuy / failSell (transaksi gagal: beli hilang + gas; jual diulang tiap 3 dtk + gas lagi).

## Hasil akun $100, v4 + filter dasar + LA, 1/4 Kelly kausal (6–12 Sep)
| skenario | dengan batas $200 | tanpa batas | tanpa batas + price impact | hanya 11–12 Sep (batas) |
|---|---|---|---|---|
| lama (gas $0,02) | $6.495 | $9.660 | $4.970 | $901 |
| **biaya nyata** (gas $0,06 + approve $0,03 + urutan terburuk) | **$6.260** | **$7.375** | **$4.604** | **$788** |
| gas ramai ($0,21/tx + approve $0,06) | $4.042 | $4.094 | $2.889 | $522 |
| jeda 10 dtk (bukan 3) | $4.261 | $5.732 | $3.652 | $665 |
| 10% beli gagal + 10% jual gagal | $1.154 | $1.157 | $1.157 | $183 |
| gas ekstrem $0,47/tx | $439 | $439 | $439 | $265 |
| semua terburuk digabung | $98 | $98 | $98 | $65 |

Tanpa filter (biaya nyata): batas $4.149 · tanpa batas $3.564.

## Kesimpulan
- Biaya nyata normal: hasil turun sedikit (−4% s/d −24%), strategi tetap untung.
- Titik lemah modal $100: posisi awal cuma ±$2–8, jadi gas per trade (±$0,18–1,2) memakan persen besar.
- Paling sensitif: transaksi gagal dan gas ekstrem. Wajib diukur di tahap shadow sebelum uang asli.
- Paper live sudah pakai biaya nyata (gas $0,06, approve $0,03, urutan terburuk).
