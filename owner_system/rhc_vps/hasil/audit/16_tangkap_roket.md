# Agent 16 — Menangkap roket dengan aturan keluar baru

**Status: DRAFT (sedang berjalan).** Berkas kerja: `hasil/audit/kerja_16/`.
Semua angka dari data on-chain nyata. Tidak ada data sintetis. Setiap keterbatasan ditulis apa adanya.

## Ringkasan satu paragraf

Meramal roket dari **fitur menit-1 tetap gagal** (AUC 0,60–0,64 untuk MFE ≥5x/≥10x — nyaris tidak berguna).
Tetapi roket **tidak perlu diramal**: ia bisa dikejar. Kalau bot menunggu sampai koin sudah naik **1,5 kali**
dari harga menit-1, lalu baru masuk (jalur kedua), **100% koin yang kelak ≥5x dan ≥10x pasti lewat pemicu itu**,
dan dengan aturan keluar baru (rugExit + trailing 40% + dump 12% LP) sisa kenaikannya masih besar:
median 25 menit lagi sampai puncak untuk koin ≥10x. Di 9 periode (19.220 koin, 3.811 peluang jalur kedua),
ret rata-rata jalur kedua **1,32 di Agustus** dan **1,26 di September**, sementara masuk menit-1 hanya
0,98 (Agustus) dan 1,11 (September).

