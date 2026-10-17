# RENCANA RISET — dari cetak biru moonshot ke sistem yang layak uang asli

Dokumen kerja. Sumber: cetak biru pemilik (MEMECOIN_MOONSHOT_SYSTEM_BLUEPRINT) + seluruh bukti audit multi-agent
20–21 Sep 2026 (`hasil/audit/01..16`). Angka di sini sudah diverifikasi; yang belum diuji ditandai **belum diuji**.

## Aturan yang tidak boleh dilanggar (berlaku untuk semua eksperimen)

1. Fitur hanya dari data ≤ blok keputusan. Fitur keluar boleh memakai data sampai blok sekarang, tidak pernah setelahnya.
2. Ambang dipilih di periode PILIH, dikunci, lalu dibuktikan di periode BUKTI. Menyebut angka terbaik dari periode bukti = overfitting.
3. **Perbandingan wajib BERPASANGAN** (daftar koin dikunci) + bootstrap 95%. Alasan terbukti: mengubah aturan keluar mengubah label menang → filter dilatih ulang → bot membeli koin lain; 9 varian yang setara secara statistik menghasilkan akun $3.839–$15.186 (beda 4×). Akun akhir BUKAN alat ukur aturan.
4. Semua biaya nyata masuk: gas on-chain per periode, biaya swap, slippage, dampak harga jual kita sendiri (pool bayangan), latensi, transaksi gagal.
5. Semua trade dihitung, termasuk yang habis total. Hasil gagal tetap dilaporkan.
6. Hanya data on-chain nyata. Tidak ada data sintetis. Kalau data tidak ada → tulis "tidak ada data".
7. Regresi wajib tiap perubahan mesin: replay `data/ags4` = 75 trade identik byte, dan parity model JS vs Python ≤ 1e-9.

## Penghambat — diurutkan dari yang paling merugikan

| # | Penghambat | Bukti | Status |
|---|---|---|---|
| P1 | Filter beli menolak roket: 14–15 dari 15–16 koin ≥10× ditolak ML | label latih "menang = ret > 1" mengajarkan cari koin aman | **belum selesai** (Agent 16) |
| P2 | Rug instan setelah masuk: 24 dari 27 trade terburuk = LP ditarik 100% dalam 0–7 menit, −$3.061 | tidak bisa ditebak dari 34 fitur menit-1 (AUC 0,40); honeypot ≠ rug | **belum selesai** (Agent 15) |
| P3 | Kapasitas pool: LP median $25,7rb → posisi maks ±$256; 43% beli mentok, 40/40 beli terakhir mentok | pertumbuhan jadi linear di atas equity ±$2.000 | **batas keras, bukan bug** |
| P4 | Sampel kecil → pita derau lebar: akun $3.839–$15.186 untuk setelan setara | 186 trade tingkat akun | sebagian teratasi: 19.247 trade mesin, Agustus +167 jam |
| P5 | Untung terkonsentrasi: 1 hari (14 Sep) = hampir seluruh untung, ×27,05; median harian ×1,386 | 8 hari dagang | **belum ada filter rezim** |
| P6 | Bot ≠ backtest: 26 perbedaan aturan | model keluar beku di bot = $737 vs $5.158; honeypot bot lebih longgar; reputasi dev inert | **belum dipasang** |
| P7 | Ambang dipilih setelah melihat hasil (QTHR 0,90) | pemilihan jujur memilih 0,60 → bukti $142, DD 49,6% | belum stabil; QTHR 0,90 dipertahankan dengan catatan |
| P8 | Bot belum terbukti jalan lama | 7 bug fatal sudah diperbaiki 20 Sep; paper live 2 minggu belum dijalankan | **belum dijalankan** |
| P9 | Identitas penjual setelah menit-1 tidak tersedia | swaps tanpa kolom pengirim; transfers berhenti di init+600 | **tidak ada data** — butuh pengumpul baru |

## Yang SUDAH terbukti bekerja (jangan dibongkar tanpa bukti baru)

- Exit: `rugExit` + trailing 40% + ambang dump 12% LP → berpasangan +0,0111 (pilih) dan +0,0117 (bukti), keduanya signifikan.
- Model bahaya = komponen keluar paling berharga. Semua usaha melemahkannya merugi signifikan.
- Larangan beli saat pemanasan: DD 20,6% → 10,7%.
- Filter ML punya nilai nyata: tanpa filter $194; AUC kausal 0,742; label diacak 0,488 (tidak ada kebocoran).
- Mesin memegang roket dengan baik **kalau dibeli**: ret 4,1×–34,3×.
- Uji maju final sekarang: **$100 → $10.854, 186 trade, win 71,5%, PF 2,98, DD 24,5%**.

## Yang SUDAH diuji dan GAGAL (jangan diulang tanpa alasan baru)

Jalur roket sebagai filter kedua (6+ varian, akun $170–$3.528) · skor roket sebagai filter utama (PF 0,59) ·
30+ varian exit berbasis tekanan (semua gagal pindah periode) · trailing 15%/20% (−) · jual bertahap (−0,0178 sig) ·
melonggarkan ambang bahaya (−0,0151 sig) · menghapus batas 9 jam (ds5d PF 1,35 → 0,82) · +2 fitur sidik jari
($7.388 → $4.909) · batas 3 beli/30 menit · batas 1 posisi per dev · tanda "sudah puncak" dari tekanan (angkat 0,73×) ·
tanda "mau rug" dari LP ditarik (presisi bukti 0,0%).

**Catatan penting untuk P1:** semua uji jalur roket di atas memakai EXIT LAMA yang menjual roket di ±2,4×.
Dengan exit baru, perhitungannya berubah — itulah alasan Agent 16 menguji ulang, bukan mengulang.

## Arsitektur sasaran (dari cetak biru, disesuaikan bukti)

```
RPC → event → fitur
        ├── HONEYPOT   : "bisa dijual?"            (sudah ada, perlu diperketat di bot)
        ├── RUG MODEL  : "LP akan ditarik?"        (BELUM ADA — P2)
        ├── MOONSHOT   : "mirip koin yang meledak?" (BELUM ADA — P1)
        └── REZIM      : "pasar layak ditradingkan?" (BELUM ADA — P5)
                      ↓ ranking, bukan satu ambang
                   aturan beli
                      ↓
                   EXIT MODEL (sudah ada & terbukti; tambah rug-escape)
```

Empat model terpisah, bukan satu model raksasa. Alasan: satu model dengan satu label tidak bisa sekaligus
menjawab "aman?", "meledak?", dan "kapan keluar?" — itu akar P1.

## Yang KURANG dari cetak biru — tambahan wajib

1. **Snapshot 0,5–2 detik tidak mungkin di chain ini.** Blok ±0,1 detik tapi data yang tersimpan per blok; RPC gratis
   dibatasi dan DNS rumah lewat DoH. Rencana snapshot harus memakai satuan blok, dan setiap klaim "T-42 detik"
   harus dicek ketersediaan datanya dulu. Jangan janjikan resolusi yang tidak ada datanya.
2. **Target 200–500 moonshot belum mungkin dari data sekarang.** Seluruh data: 64 koin ≥10×, 25 ≥25×, 11 ≥50×, 5 ≥100×,
   maksimum 130×. Tidak ada 250×. Jadi PRIORITAS 1 cetak biru bergantung mutlak pada perluasan data (Agent 1).
   Sampai itu tercapai, tiap klaim moonshot wajib menyertakan selang kepercayaan dan uji permutasi.
3. **Kapasitas harus jadi bagian objective, bukan catatan kaki.** Strategi yang "menang" dengan posisi 5% likuiditas
   adalah strategi palsu kalau tidak direplay dengan pool bayangan. Objective: untung per jam pasar pada batas 1% LP.
4. **Uji berpasangan wajib** (poin 3 aturan di atas). Cetak biru tidak menyebut ini, padahal tanpa itu semua
   perbandingan bisa salah 4×.
5. **Tail sensitivity dua arah.** Cetak biru minta hasil tanpa 1/3/5 pemenang teratas. Tambahkan juga: hasil tanpa
   hari terbaik, dan hasil per rezim, karena untung kita terkonsentrasi di satu hari.
6. **Parity & satu sumber aturan.** Satu berkas konfigurasi dipakai bot dan backtest; bot menolak start kalau
   konfigurasi/versi model berbeda. Ini menutup P6 secara permanen, bukan sekali perbaiki.
7. **Biaya kehilangan peluang.** Menolak koin bukan gratis: menolak memiskinkan aliran label untuk latih ulang.
   Terbukti: semua varian filter keras menurunkan akun $640–$7.105.
8. **Data pengirim swap** (P9) harus dikumpulkan kalau ingin fitur "siapa yang menjual" — butuh perubahan collector,
   bukan analisis ulang data lama.
9. **Gerbang keputusan sebelum uang asli** — syarat lama tetap, ditambah: perbaikan hanya diterima kalau
   uji berpasangan signifikan di periode bukti, dan kapasitas realistis dilaporkan bersama angka untung.

## Urutan kerja

| Prioritas | Pekerjaan | Pemilik | Status |
|---|---|---|---|
| 1 | Perluas data (target ≥1.000 trade akun, ≥200 moonshot) | Agent 1 | jalan terus, +167 jam masuk |
| 2 | Model rug instan + waktu masuk | Agent 15 | jalan |
| 3 | Moonshot model + label payoff, diuji dengan exit baru | Agent 16 | jalan |
| 4 | Fitur ML untuk periode Agustus (swaps_m1, transfers) — membuka 12.911 trade | Agent 16 (tugas A) | jalan |
| 5 | Pasang 3 perbaikan wajib ke bot live (latih ulang model keluar, honeypot ketat, opsi exit baru) | — | belum |
| 6 | Filter rezim (P5) | — | belum |
| 7 | Paper live 2 minggu | — | belum |

## Gerbang "layak uang asli"

| Syarat | Batas | Sekarang |
|---|---|---|
| Trade uji maju (tingkat akun) | ≥ 1.000 | 186 |
| PF skenario realistis (biaya +5%, gas 2×) | ≥ 1,5 | 2,98 |
| Minggu untung | ≥ 70% | tidak ada data (belum ada minggu penuh) |
| Rezim sepi/hancur | DD < 40%, tidak kena stop darurat | MC pasar sepi: 93,5% kena stop — **gagal** |
| Paper live 2 minggu | laju untung ≥ 50% uji maju | belum dijalankan |
| Parity model & replay | tetap lolos | lolos (2,2e-16 / 75 trade identik) |
| **Tambahan:** perbaikan signifikan berpasangan di periode bukti | wajib | exit baru: lolos |
| **Tambahan:** kapasitas dilaporkan | wajib | ±$103 untung per jam pasar; batas realistis $50rb–$100rb |
