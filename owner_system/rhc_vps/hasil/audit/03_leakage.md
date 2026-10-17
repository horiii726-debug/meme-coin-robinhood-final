# Audit 03 — Kebocoran data (Leakage Auditor)

Skrip & keluaran: `hasil/audit/kerja_03/` (`uji_label_acak.py`, `cek_jendela.py`, `cek_fitur_periode.py`, `eq_q*.json`). Tidak ada file bot/ atau pipeline/ yang diubah.

## Lulus (tidak ada kebocoran data)
| Hipotesis | Uji | Hasil |
|---|---|---|
| H1: fitur filter hanya dari blok ≤ init+600 | hitung record > init+600 di `swaps_m1.json` & `transfers.json`, 6 periode | **0** record lewat (offset maks 600). Jendela dari `extract_m1.js:11`, `fetch_tr.js:40`; live sama (`paper_live.js:458-462`). 34 fitur di `filter_feats.js:10-127` hanya memakai `sw`/`tr` itu; ethUsd = harga saat init (`replay.js:113`). |
| H2: label diacak → AUC ≈ 0,50 | alur kausal `arena_score.py` persis, 5 permutasi label, thread_count=2 | **0,488 ± 0,005** (sedikit < 0,5 karena permutasi tanpa pengembalian). AUC kausal sungguhan **0,742** (ds5d 0,644 · ds24 0,642 · m1 0,756 · m2 0,796). |
| H3: pelatih filter hanya pakai trade exit < keputusan | replikasi `arena_score.py:150` + cek tiap model | 25 kali latih ulang, **0 pelanggaran**, skor identik dengan `arena_scored.csv` (selisih maks 1e-16). |
| H3b: model keluar W_i hanya dari periode lampau | blok label terakhir (blk+18.000) vs awal periode uji | semua aman, mis. W5: ≤ 63.599.810 < m2 mulai 64.401.245. Fitur `state_rows.js:81-97` dan `v4engine.js:154-174` hanya masa lalu; label hanya di `state_rows.js:99-104`. |
| arena.js | baca kode | ambang kuantil, Kelly, reputasi dev dari data ≤ keputusan/trade tutup. Hasil $12.746,32 berhasil direproduksi. |

## SEDANG — bias pemilihan parameter (bukan data bocor, tapi hasil tidak sepenuhnya out-of-sample)
1. **QTHR=0,90 dipilih setelah melihat hasil.** `pipeline/ARENA_RULES.md:9` menyatakan ambang "kuantil 30%… dikunci sebelum melihat hasil", tapi `wf_penuh.sh:173` / `bot/.env:12` memakai 0,90 (juga KILL 35% di aturan vs 0,60 di `arena.js:14`, MAXPOS 20 vs 10). Kepekaan (aturan lain sama): 0,30 → $3.490 · 0,50 → $18.226 · 0,70 → $5.848 · 0,80 → $19.736 · 0,85 → $24.659 · **0,90 → $12.746** · 0,95 → $3.147. Tidak monoton → angka utama berada di pita $3k–$25k. Bila dipilih jujur di periode awal (ds5d+ds24, untung +$900 di 0,30 vs +$13 di 0,90) → pilihan 0,30 → **$3.490**. Tanpa filter ML: $194.
2. **Aturan tunda-TP disetel di m2.** Komentar `bot/v4engine.js:191-193`: "Uji bersih m2: $455 → $1.934" → m2 (periode uji terakhir) dipakai memilih aturan TP_UP; DANGER_TH 0,4 / UP_TH 0,5 / TP_UP 0,5 (`wf_penuh.sh:154`) tidak punya jejak dipilih dari periode sebelumnya.
3. **Fitur dieksplorasi di m1+m2.** `pipeline/fitur_extra.js:1` "sekarang 2.125" = persis jumlah trade m1+m2 (periode penghasil ±99% untung). Kekuatan univariat |AUC−0,5| rata-rata: periode awal 0,053 vs m1+m2 0,085; arah sama 30/34 (fitur tidak palsu, tapi pemilihannya tidak out-of-sample). `g_eig_max_nonpool` dihitung tapi dibuang tanpa catatan kapan/dengan data apa.

## RINGAN
4. **50 koin (1,8%) dibuang** `build_feats2.js:16-17` karena tak ada swap di menit-1 (ds5d 11, ds24 13, m1 7, m2 19). Dampak PnL 0 (aturan honeypot `jual_m1=0` pasti menolaknya), tapi "koin dilihat" seharusnya 2.847 dan "ditolak honeypot" +50.
5. `retrain_filter.py:209-216` (hanya live): latih di seluruh data, `thr_start` = kuantil 0,90 prediksi **in-sample** (0,747, optimistis). `retrain_filter.py:202` hanya menambah trade live yang lolos ML → umpan balik seleksi.
6. `latih_keluar_wf.py:170` early stopping memakai validasi acak antar baris dari pool yang sama → berhenti sedikit terlambat (internal, tidak menyentuh periode uji).
7. RETRAIN=100 dipilih setelah uji maju penuh (`hasil/riset/uji_retrain.log`), tapi tidak peka: $12.479–$13.292 untuk 10/20/50/100.

## Usul perbaikan
- Kunci QTHR, DANGER_TH/UP_TH/TP_UP, KILL, MAXPOS dengan memilihnya **hanya di ds5d+ds24** (atau walk-forward bersarang), lalu laporkan m1+m2 sebagai uji. Tampilkan pita kepekaan QTHR di samping angka $12.746.
- Catat asal 34 fitur; ulangi seleksi fitur hanya dari data sebelum m1 dan bandingkan hasilnya.
- Tambahkan 50 koin tanpa swap sebagai baris "ditolak honeypot" agar hitungan lengkap.
- `retrain_filter.py`: ambang awal dari prediksi out-of-fold; early stopping dengan pembagian per pool/waktu.
