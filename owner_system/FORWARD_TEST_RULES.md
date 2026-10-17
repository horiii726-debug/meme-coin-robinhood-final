# Uji maju v4 — aturan ditulis SEBELUM melihat data

Ditulis: 2026-09-13, sebelum data blok 60.750.163–61.866.033 dianalisis.
Aturan strategi dibekukan persis seperti di backtest (`exit_tp2.js`, konfigurasi
"TP1 +20% jual 60% | sisa: model bahaya>=0.4"). Tidak ada parameter yang boleh diubah
setelah melihat hasil uji maju.

## Aturan v4 yang diuji (beku)
- Saringan: quote ETH native, fee <= 5000, bit beforeSwap hook = 0, ukuran = min($200, 1% LP) >= $20.
- Masuk: swap pertama >= 600 blok (1 menit) setelah Initialize.
- TP1: nilai >= 1,2x -> jual 60% (eksekusi di swap pertama >= 30 blok kemudian).
- Sebelum TP1: keluar bila nilai <= 60% dari puncak.
- Selalu: keluar bila LP ditarik > 30% (kumulatif), satu jual >= 5% LP, atau tanda pucuk
  (puncak >= 3x, rata-rata jual 60 dtk >= 1,5x rata-rata jual sejak masuk, >= 3 jual / 60 dtk, >= 6 jual total).
- Sesudah TP1: keluar bila p_bahaya >= 0,4 atau nilai <= 10% dari puncak.
- Rug (LP ditarik > 80%) sebelum eksekusi = nilai 0. Batas pegang 6 jam. Gas $0,02/transaksi.
- Model p_bahaya = model yang dilatih di periode LAMA saja (sama dengan backtest).

## Tahap 1 — kesamaan mesin (wajib lulus dulu)
Mesin live diputar ulang di data BARU lama. LULUS bila jumlah trade v2/v3/v4 sama persis
dan total PnL tiap rencana selisih < 1% dari `plans_trades.json`.

## Tahap 2 — uji maju di data yang belum pernah dilihat (v4)
- LULUS: win rate >= 42% DAN profit factor >= 1,30 DAN total PnL > 0 DAN PnL tanpa 1 trade terbesar > 0.
- GAGAL (stop, jangan setel ulang): win rate < 35% ATAU profit factor < 1,00.
- Di antaranya: BELUM JELAS -> lanjut paper trading live.

## Tahap 3 — paper trading live (mesin yang sama, data real-time)
Minimal 7 hari dan >= 300 trade v4 selesai, tanpa celah data. Kriteria lulus/gagal sama dengan tahap 2.
Tambahan: drawdown maksimum dengan 1/4 Kelly (9,5%) tidak melewati 69% (persentil 95 Monte Carlo).

## Tahap 4 — uang asli
Hanya keputusan pemilik dompet. Mulai sangat kecil. Belum pernah ada uji eksekusi nyata:
latensi pengiriman transaksi, gagal transaksi, dan honeypot hanya bisa diuji dengan transaksi sungguhan.

## Tambahan 2026-09-13 malam — hasil audit, ditulis SEBELUM data uji maju dianalisis
(Kolektor uji maju baru 175/930 potongan, belum ada satu trade pun yang dihitung.)

Audit di data BARU menemukan:
- Masuk di harga swap pemicu terlalu optimis. Dengan masuk telat 3 dtk: win rate 50% -> 44,7%, PF 1,91 -> 1,55.
- Pool yang mati setelah kita masuk sempat dibuang dari backtest (12 trade). Sudah dimasukkan.
- Model "bahaya" TIDAK menambah nilai: diganti skor acak hasilnya sama (win 51%, PF 1,94–2,03).
- Ambang 0,4 dipilih setelah melihat BARU (menurut LAMA saja yang terbaik 0,5). BARU bukan uji bersih.
- Tidak ada efek dari intip swap lain di blok yang sama, maupun LP yang ditarik setelah swap terakhir.

Maka untuk tahap 2 dan 3:
- Penilaian UTAMA memakai koreksi realistis: masuk telat 3 dtk, pool mati tidak dibuang, tanpa intip blok, LP akhir dihitung.
  Backtest-asli tetap dilaporkan sebagai pembanding.
- v3 (tanpa model) dinilai dengan kriteria yang sama persis dengan v4.
- Ambang lulus/gagal TIDAK diubah.
- Paper trading live sejak 13-09 20:55 WIB memakai koreksi realistis (hasil lama diputar ulang otomatis).

## Tambahan 2026-09-13 21:35 WIB — ditulis SEBELUM data uji maju dianalisis (kolektor 300/930)
- Batas hold 6 jam DIHAPUS (permintaan pemilik). Penilaian UTAMA tahap 2 & 3: koreksi realistis + tanpa batas 6 jam
  + pesanan jual terisi 3 dtk kemudian walau tidak ada swap (fillOnTime).
- Aturan jual berbasis waktu ("belum TP1 dalam X menit") dan "pool sepi X menit" diuji di LAMA saja: keduanya merusak
  profit (PF 1,99 -> 0,98–1,61). TIDAK dipakai.
- Ukuran posisi: 1/4 Kelly = 7,3% (dihitung dari LAMA saja).
- Ambang lulus/gagal tetap sama.

## Tambahan 2026-09-13 ±22:30 WIB — ditulis SEBELUM data uji maju dianalisis
- Batas hold 6 jam DIKEMBALIKAN (v4 asli). Alasan (dari LAMA+BARU, bukan data uji maju): tanpa batas, 35% posisi tidak pernah
  dapat sinyal jual dan uang terkunci; akun $100 riwayat asli -> $78, dengan batas 6 jam -> $5.756.
- Penilaian UTAMA tahap 2 & 3: v4 asli + koreksi realistis (masuk telat 3 dtk, pool mati dihitung, tanpa intip blok, LP akhir), 1/4 Kelly 7,3%.

## Tambahan 2026-09-15 23:59 WIB — UJI KOIN BARU, ditulis SEBELUM hasil dilihat
- Data: koin yang lahir SETELAH data backtest (blok >= 60.750.163): (A) data uji maju 60.750.163–61.866.033,
  (B) event paper live tersimpan 61.866.034–62.178.858. Koin ini tidak pernah dipakai menyetel aturan, model bahaya, filter, atau Kelly.
- Mesin: v4 asli, batas 6 jam, mode realistis hasil audit (masuk berdasarkan waktu, fill berdasarkan waktu) + biaya nyata
  (gas $0,06/tx, approve $0,03, urutan terburuk di blok). Tidak ada parameter yang diubah.
- Filter dasar+LA: model dilatih hanya dari trade yang sudah selesai sebelum keputusan (mulai dari 854 trade lama), ambang = kuantil 30% skor latih.
- Ukuran posisi: 1/4 Kelly kausal (hanya trade yang sudah selesai), modal awal $100, dengan batas likuiditas (utama) dan tanpa batas (pembanding).
- Dilaporkan apa adanya: jumlah trade, win rate, PF, equity akhir, drawdown, dan Monte Carlo waktu $100 -> $20.000 dari trade koin baru saja.

## Tambahan 2026-09-17 — UJI ATURAN KELUAR BERBASIS KONDISI (bukan batas 6 jam), ditulis SEBELUM hasil dilihat
Alasan: dari 1.815 trade, keluar karena "batas 6 jam" selalu rugi besar (win 1,6–19,5%, kontribusi PnL −25% s/d −66%).
Ide: koin jelek keluar cepat, koin bagus dibiarkan sampai ada tanda bahaya.

Aturan yang diuji (grid, hanya di data LAMA 6–12 Sep):
- staleMin ∈ {15, 30, 60} menit: kalau belum kena TP1 dalam X menit -> jual (koin tidak jalan).
- quietMin ∈ {10, 20, 30} menit: kalau tidak ada swap sama sekali selama X menit -> jual (pool sepi/mati), berlaku sebelum & sesudah TP1.
- Batas keras: 6 jam (seperti sekarang) ATAU tanpa batas sama sekali.
Total 3 x 3 x 2 = 18 kombinasi + baseline (6 jam saja).

Kriteria pemenang DIKUNCI SEKARANG: equity akhir akun $100 (1/4 Kelly kausal, dengan batas likuiditas pool)
di data LAMA. Kalau selisih < 10%, dipilih yang drawdown lebih kecil.
Pemenang diuji SEKALI di data yang belum dipakai: 350 trade koin baru + 611 trade paper live.
Kalau di data baru hasilnya lebih jelek dari aturan sekarang, aturan TIDAK diganti dan hasilnya tetap dilaporkan.

## Tambahan 2026-09-17 (2) — varian lanjutan, ditulis SEBELUM hasilnya dilihat
Grid pertama (stale+quiet) KALAH telak dari aturan sekarang di data LAMA ($93–98 vs $870), jadi aturan TIDAK diganti.
Dugaan: menjual karena "belum TP1 dalam X menit" ikut membuang koin yang meledak belakangan.
Varian lanjutan yang diuji (LAMA saja, kriteria sama): HANYA quietMin ∈ {10, 20, 30} menit (pool sepi -> jual),
tanpa aturan stale, dengan batas 6 jam dan tanpa batas. Kalau tetap kalah, batas 6 jam dipertahankan apa adanya.

## Tambahan 2026-09-17 (3) — uji panjang batas pegang, ditulis SEBELUM hasil dilihat
Diuji di data LAMA saja: batas pegang 1, 2, 3, 4, 6 (sekarang), 9, 12, 24 jam, dan tanpa batas.
Kriteria pemenang (dikunci): equity akhir akun $100, 1/4 Kelly kausal, dengan batas likuiditas pool.
Pemenang diuji SEKALI di data baru (koin 12-13 Sep + paper live 13-14 Sep). Kalau kalah di data baru, aturan tidak diganti.
Hasil grid (LAMA): 24j $1.280 · 12j $1.279 · 9j $1.269 · 6j $870 · 4j $406 · 3j $342 · 2j $131 · 1j $98.
Pemenang dipilih: 9 JAM (paling pendek di antara yang selisihnya <10% dari terbaik; drawdown sama 18%).
Konfirmasi dilakukan SEKALI di data baru (koin 12-13 Sep dan paper live 13-14 Sep), pool disamakan agar adil.

## Tambahan 2026-09-17 (4) — pemilihan model ML, ditulis SEBELUM hasil dilihat
Masalah: CatBoost menang di set fitur "dasar", HistGB menang di "dasar+aljabar". Selisih AUC 0,01 di 900 trade bisa kebetulan.
Uji: tiap model (HistGB, LightGBM, XGBoost, CatBoost) x set fitur (dasar, dasar+aljabar, dasar+aljabar+matematika) dijalankan 5 benih acak.
Kriteria pemenang DIKUNCI: rata-rata AUC tertinggi di 900 trade koin baru. Kalau selisih rata-rata < 0,01, dipilih yang simpangan bakunya lebih kecil.
Equity dipakai hanya sebagai laporan, BUKAN penentu, karena terlalu dipengaruhi segelintir koin besar.

## Tambahan 2026-09-17 (5) — fitur REPUTASI DEV, ditulis SEBELUM hasil dilihat
Dev = dompet penerima mint pertama token (transfer dari alamat nol). Hanya koin dev tsb yang HASILNYA SUDAH DIKETAHUI
sebelum blok keputusan koin sekarang yang dipakai (tanpa kebocoran).
Fitur: jumlah koin sebelumnya, porsi yang rug (ret<0,3), porsi menang, rata-rata & terbaik ret, jarak waktu dari koin terakhir.
Kriteria: AUC di 900 trade koin baru, model HistGB, dibandingkan dengan set "dasar+LA" tanpa fitur dev. Equity dilaporkan tapi bukan penentu.

## Tambahan 2026-09-18 — ATURAN BELI berbasis reputasi dev, ditulis SEBELUM hasil dilihat
Dua definisi dev: (a) penerima mint pertama, (b) pemegang terbesar non-pool di menit ke-1.
Riwayat dev hanya dari koin yang HASILNYA SUDAH DIKETAHUI sebelum blok keputusan (tanpa kebocoran).
Aturan yang diuji: A) dev pernah bikin koin >=2x, B) dev tidak pernah rug (ret<0,3), C) A dan B, D) buang dev yang belum dikenal, E) semua (pembanding).
Kriteria: equity akun $100 (1/4 Kelly kausal) di 900 trade koin baru. Dilaporkan juga PF dan jumlah trade. Aturan dipakai hanya kalau menang di data koin baru.

## Tambahan 2026-09-18 (2) — BATAS EKSPOSUR, ditulis SEBELUM hasil dilihat
Diuji di 795 trade koin baru (sistem 9 jam, 1/4 Kelly, modal $100):
maks posisi terbuka ∈ {5, 10, 20, 40, tanpa batas} x maks uang terpakai ∈ {30%, 50%, 80%, 100%} dari equity.
Kriteria DIKUNCI: dari setelan yang equity-nya >= 90% setelan terbaik, pilih yang drawdown-nya paling kecil.

## Tambahan 2026-09-18 (3) — DATA UJIAN AKHIR (holdout), ditulis SEBELUM dipakai
Tidak boleh dipakai untuk menyetel apa pun, hanya untuk menguji sistem FINAL sekali:
(a) data 7–11 Sep (blok 56.196.162–59.886.161) yang belum pernah diambil; (b) paper live realtime mulai 2026-09-18.
